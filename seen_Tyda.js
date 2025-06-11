/* global api */
class sven_Tyda {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('CN') != -1) return 'Tyda瑞典语-英语词典';
        if (locale.indexOf('TW') != -1) return 'Tyda瑞典語-英語詞典';
        return 'Tyda Swedish-English Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample || 2;
    }

    async findTerm(word) {
        this.word = word;
        let results = await Promise.all([this.findTyda(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findTyda(word) {
        let notes = [];
        if (!word) return notes; // return empty notes

        function T(node) {
            if (!node)
                return '';
            else
                return node.innerText.trim();
        }

        // Tyda.se 的搜索URL
        let base = 'https://tyda.se/search/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        // 检查是否有搜索结果
        let mainContent = doc.querySelector('main') || doc.querySelector('.main-content') || doc.querySelector('#content');
        if (!mainContent) return notes;

        // 提取单词和音标
        let expression = word; // 默认使用搜索的单词
        let reading = ''; // 音标，需要根据实际页面结构调整

        // 尝试获取更准确的表达
        let wordHeader = doc.querySelector('h1') || doc.querySelector('.word-header') || doc.querySelector('.entry-word');
        if (wordHeader) {
            expression = T(wordHeader) || word;
        }

        // 尝试获取音标
        let pronunciation = doc.querySelector('.pronunciation') || doc.querySelector('.phonetic') || doc.querySelector('[class*="phon"]');
        if (pronunciation) {
            reading = T(pronunciation);
        }

        // 查找英语翻译
        let definitions = [];
        
        // 方法1: 查找包含英语翻译的元素
        let translationBlocks = doc.querySelectorAll('.translation') || 
                               doc.querySelectorAll('.meaning') || 
                               doc.querySelectorAll('[class*="english"]') ||
                               doc.querySelectorAll('li');

        for (const block of translationBlocks) {
            let translation = T(block);
            if (!translation) continue;

            // 过滤掉非英语内容（简单的启发式方法）
            if (this.isLikelyEnglish(translation)) {
                let definition = '';
                
                // 处理词性标注
                let pos = '';
                let posElement = block.querySelector('.pos') || block.querySelector('[class*="type"]');
                if (posElement) {
                    pos = T(posElement);
                    pos = pos ? `<span class="pos">${pos}</span>` : '';
                }

                // 高亮原词
                translation = translation.replace(new RegExp(expression, 'gi'), '<b>$&</b>');
                let translationSpan = `<span class='eng_tran'>${translation}</span>`;
                definition += `${pos}<span class='tran'>${translationSpan}</span>`;

                // 查找例句
                let examples = block.querySelectorAll('.example') || 
                              block.parentElement?.querySelectorAll('.example') || [];
                
                if (examples.length > 0 && this.maxexample > 0) {
                    definition += '<ul class="sents">';
                    for (const [index, example] of examples.entries()) {
                        if (index >= this.maxexample) break;
                        let exampleText = T(example);
                        if (exampleText) {
                            exampleText = exampleText.replace(new RegExp(expression, 'gi'), '<b>$&</b>');
                            definition += `<li class='sent'><span class='eng_sent'>${exampleText}</span></li>`;
                        }
                    }
                    definition += '</ul>';
                }

                if (definition) {
                    definitions.push(definition);
                }
            }
        }

        // 方法2: 如果上面的方法没有找到结果，尝试更通用的方法
        if (definitions.length === 0) {
            // 查找页面中的文本内容，寻找可能的翻译
            let allText = doc.body.innerText;
            let lines = allText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            
            for (let line of lines) {
                if (this.isLikelyEnglish(line) && line.length < 200 && line.length > 2) {
                    // 简单过滤，避免获取导航菜单等内容
                    if (!this.isNavigationText(line)) {
                        let definition = `<span class='tran'><span class='eng_tran'>${line}</span></span>`;
                        definitions.push(definition);
                        if (definitions.length >= 3) break; // 限制数量
                    }
                }
            }
        }

        // 音频文件（Tyda可能提供发音）
        let audios = [];
        let audioElements = doc.querySelectorAll('audio source') || doc.querySelectorAll('[src*=".mp3"]');
        for (let audio of audioElements) {
            let src = audio.src || audio.getAttribute('src');
            if (src) {
                audios.push(src);
                break; // 只取第一个
            }
        }

        let css = this.renderCSS();
        let extrainfo = ''; // 可以用来显示词频或其他信息

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

    // 简单的英语检测方法
    isLikelyEnglish(text) {
        // 检查是否包含常见的英语单词或模式
        const englishPatterns = /\b(the|and|or|to|of|in|for|with|on|at|by|from|as|is|are|was|were|be|been|have|has|had|do|does|did|will|would|could|should|may|might|can|must)\b/i;
        const swedishPatterns = /[åäöé]/; // 瑞典语特殊字符
        
        return englishPatterns.test(text) && text.length > 1 && text.length < 300;
    }

    // 过滤导航和无关文本
    isNavigationText(text) {
        const navPatterns = /^(hem|sök|kontakt|om|hjälp|login|logga in|registrera|search|home|about|help|contact|menu|nav|footer|header)$/i;
        return navPatterns.test(text.trim()) || text.includes('©') || text.includes('cookie');
    }

    renderCSS() {
        let css = `
            <style>
                span.pos  {text-transform:lowercase; font-size:0.9em; margin-right:5px; padding:2px 4px; color:white; background-color:#2196F3; border-radius:3px;}
                span.tran {margin:0; padding:0;}
                span.eng_tran {margin-right:3px; padding:0; color:#1976D2;}
                ul.sents {font-size:0.8em; list-style:square inside; margin:3px 0;padding:5px;background:rgba(33,150,243,0.1); border-radius:5px;}
                li.sent  {margin:0; padding:0;}
                span.eng_sent {margin-right:5px;}
                b {font-weight: bold; color:#1565C0;}
            </style>`;
        return css;
    }
}