/* global api */
class sven_Cambridge {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('CN') != -1) return 'Cambridge瑞典语-英语词典';
        if (locale.indexOf('TW') != -1) return 'Cambridge瑞典語-英語詞典';
        return 'Cambridge Swedish-English Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample || 2;
    }

    async findTerm(word) {
        this.word = word;
        let results = await Promise.all([this.findCambridge(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findCambridge(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        // Cambridge Dictionary Swedish-English URL
        let base = 'https://dictionary.cambridge.org/dictionary/swedish-english/';
        let url = base + encodeURIComponent(word.toLowerCase());
        let doc = '';
        
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        // 检查是否找到词条
        let entryBody = doc.querySelector('.entry-body') || doc.querySelector('.dictionary') || doc.querySelector('.di-body');
        if (!entryBody) return notes;

        // 提取单词标题
        let expression = T(doc.querySelector('.headword') || doc.querySelector('.di-title') || doc.querySelector('h1')) || word;
        
        // 提取发音
        let reading = '';
        let pronElement = doc.querySelector('.pron') || doc.querySelector('.ipa') || doc.querySelector('[class*="pronunciation"]');
        if (pronElement) {
            reading = T(pronElement);
            // 清理发音文本，只保留音标部分
            reading = reading.replace(/^[^\/]*/, '').replace(/[^\/]*$/, '').trim();
        }

        // 查找发音音频
        let audios = [];
        let audioSources = doc.querySelectorAll('source[type="audio/mpeg"]') || doc.querySelectorAll('audio source');
        for (let source of audioSources) {
            let src = source.getAttribute('src');
            if (src) {
                // Cambridge的音频URL通常需要补全
                if (src.startsWith('//')) {
                    src = 'https:' + src;
                } else if (src.startsWith('/')) {
                    src = 'https://dictionary.cambridge.org' + src;
                }
                audios.push(src);
                break; // 只取第一个音频
            }
        }

        // 提取定义和例句
        let definitions = [];
        
        // Cambridge的词条通常在 .sense-body 或 .def-block 中
        let senseBlocks = doc.querySelectorAll('.sense-body') || 
                         doc.querySelectorAll('.def-block') || 
                         doc.querySelectorAll('.sense') ||
                         doc.querySelectorAll('.di-body .def');

        for (const senseBlock of senseBlocks) {
            let definition = '';
            
            // 提取词性
            let posElement = senseBlock.querySelector('.pos') || 
                           senseBlock.parentElement?.querySelector('.pos') ||
                           senseBlock.querySelector('.part-of-speech');
            let pos = '';
            if (posElement) {
                pos = T(posElement);
                pos = pos ? `<span class="pos">${pos}</span>` : '';
            }

            // 提取定义
            let defElement = senseBlock.querySelector('.def') || 
                           senseBlock.querySelector('.definition') ||
                           senseBlock;
            let defText = T(defElement);
            
            if (defText && defText.length > 2) {
                // 高亮搜索词
                defText = defText.replace(new RegExp('\\b' + expression + '\\b', 'gi'), '<b>$&</b>');
                
                let translationSpan = `<span class='eng_tran'>${defText}</span>`;
                definition += `${pos}<span class='tran'>${translationSpan}</span>`;

                // 查找例句
                let examples = senseBlock.querySelectorAll('.examp') || 
                              senseBlock.querySelectorAll('.example') ||
                              senseBlock.querySelectorAll('.eg');

                if (examples.length > 0 && this.maxexample > 0) {
                    definition += '<ul class="sents">';
                    let exampleCount = 0;
                    
                    for (const example of examples) {
                        if (exampleCount >= this.maxexample) break;
                        
                        let exampleText = T(example);
                        if (exampleText && exampleText.length > 3) {
                            // 过滤掉只是标点符号或很短的内容
                            if (this.isValidExample(exampleText)) {
                                exampleText = exampleText.replace(new RegExp('\\b' + expression + '\\b', 'gi'), '<b>$&</b>');
                                definition += `<li class='sent'><span class='eng_sent'>${exampleText}</span></li>`;
                                exampleCount++;
                            }
                        }
                    }
                    definition += '</ul>';
                }

                if (definition.trim()) {
                    definitions.push(definition);
                }
            }
        }

        // 如果没有找到标准的sense-body，尝试查找其他结构
        if (definitions.length === 0) {
            let defBlocks = doc.querySelectorAll('.def-body') || 
                          doc.querySelectorAll('.meaning') ||
                          doc.querySelectorAll('[class*="def"]');

            for (const block of defBlocks) {
                let text = T(block);
                if (text && text.length > 5 && this.isLikelyDefinition(text)) {
                    text = text.replace(new RegExp('\\b' + expression + '\\b', 'gi'), '<b>$&</b>');
                    let definition = `<span class='tran'><span class='eng_tran'>${text}</span></span>`;
                    definitions.push(definition);
                    if (definitions.length >= 3) break;
                }
            }
        }

        // 添加额外信息（如果有频率标记等）
        let extrainfo = '';
        let frequencyElement = doc.querySelector('.frequency') || doc.querySelector('[class*="freq"]');
        if (frequencyElement) {
            let freqText = T(frequencyElement);
            if (freqText) {
                extrainfo = `<span class="frequency">${freqText}</span>`;
            }
        }

        let css = this.renderCSS();

        if (definitions.length > 0) {
            notes.push({
                css,
                expression,
                reading,
                extrainfo,
                definitions,
                audios,
            });
        }

        return notes;
    }

    // 验证例句是否有效
    isValidExample(text) {
        // 过滤掉太短、只有标点符号或明显不是例句的内容
        if (text.length < 5) return false;
        if (/^[.,:;!?"\-\s]+$/.test(text)) return false;
        if (/^(see also|more examples|translation|pronunciation)$/i.test(text.trim())) return false;
        return true;
    }

    // 检查是否像是定义
    isLikelyDefinition(text) {
        // 避免获取导航、标题等内容
        const navPatterns = /^(dictionary|home|about|help|search|sign in|log in|menu|navigation|copyright|privacy|terms)$/i;
        if (navPatterns.test(text.trim())) return false;
        
        // 太长的文本可能是页面描述而不是定义
        if (text.length > 500) return false;
        
        // 包含常见定义特征的文本
        const definitionPatterns = /\b(is|are|means|refers to|used to|a type of|a kind of)\b/i;
        return definitionPatterns.test(text) || text.length < 200;
    }

    renderCSS() {
        let css = `
            <style>
                span.pos {
                    text-transform: lowercase; 
                    font-size: 0.9em; 
                    margin-right: 5px; 
                    padding: 2px 6px; 
                    color: white; 
                    background-color: #0d47a1; 
                    border-radius: 3px;
                    font-weight: normal;
                }
                span.tran {
                    margin: 0; 
                    padding: 0;
                }
                span.eng_tran {
                    margin-right: 3px; 
                    padding: 0; 
                    color: #1565C0;
                    line-height: 1.4;
                }
                span.frequency {
                    font-size: 0.8em;
                    color: #FF6F00;
                    margin-left: 5px;
                }
                ul.sents {
                    font-size: 0.85em; 
                    list-style: none; 
                    margin: 8px 0 5px 0;
                    padding: 8px 12px;
                    background: rgba(13, 71, 161, 0.08); 
                    border-radius: 5px;
                    border-left: 3px solid #1976D2;
                }
                li.sent {
                    margin: 3px 0; 
                    padding: 0;
                    line-height: 1.3;
                }
                li.sent:before {
                    content: "▸ ";
                    color: #1976D2;
                    font-weight: bold;
                    margin-right: 5px;
                }
                span.eng_sent {
                    margin-right: 5px;
                    font-style: italic;
                }
                b {
                    font-weight: bold; 
                    color: #0D47A1;
                    background-color: rgba(13, 71, 161, 0.1);
                    padding: 1px 2px;
                    border-radius: 2px;
                }
            </style>`;
        return css;
    }
}