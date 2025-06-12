/* global api */
class sven_Glosbe {
    constructor(options) {
        this.options = options;
        this.maxexample = 2;
        this.word = '';
    }

    async displayName() {
        let locale = await api.locale();
        if (locale.indexOf('CN') != -1) return 'Glosbe 瑞典语-英语词典';
        if (locale.indexOf('TW') != -1) return 'Glosbe 瑞典語-英語詞典';
        return 'Glosbe Swedish-English Dictionary';
    }

    setOptions(options) {
        this.options = options;
        this.maxexample = options.maxexample;
    }

    async findTerm(word) {
        this.word = word;
        let results = await Promise.all([this.findGlosbe(word)]);
        return [].concat(...results).filter(x => x);
    }

    async findGlosbe(word) {
        let notes = [];
        if (!word) return notes;

        function T(node) {
            if (!node) return '';
            return node.innerText.trim();
        }

        let base = 'https://glosbe.com/sv/en/';
        let url = base + encodeURIComponent(word);
        let doc = '';
        
        try {
            let data = await api.fetch(url);
            let parser = new DOMParser();
            doc = parser.parseFromString(data, 'text/html');
        } catch (err) {
            return [];
        }

        if (!doc.querySelector('body')) return notes;

        let expression = word;
        let reading = '';

        // 查找音频
        let audioButton = doc.querySelector('button[data-file]');
        let audios = [];
        if (audioButton) {
            let audioFile = audioButton.getAttribute('data-file');
            if (audioFile) {
                audios = ['https://glosbe.com/fb_aud/mp3/' + audioFile];
            }
        }

        // 处理释义和例句
        let definitions = [];
        let defElements = doc.querySelectorAll('h3.translation__item__pharse');
        let exampleElements = doc.querySelectorAll('div.translation__example');
        
        for (let i = 0; i < defElements.length; i++) {
            let defElement = defElements[i];
            let defText = T(defElement);
            if (!defText) continue;
            
            let definition = '';
            defText = defText.replace(new RegExp(expression, 'gi'), '<b>$&</b>');
            definition = '<span class="tran"><span class="eng_tran">' + defText + '</span></span>';

            // 添加对应的例句
            if (i < exampleElements.length) {
                let exampleElement = exampleElements[i];
                
                let svElement = exampleElement.querySelector('p[lang="sv"]');
                let svText = svElement ? T(svElement) : '';
                
                let allPs = exampleElement.querySelectorAll('p');
                let enText = '';
                if (allPs.length > 1) {
                    enText = T(allPs[allPs.length - 1]);
                }
                
                if (svText && enText) {
                    svText = svText.replace(new RegExp(expression, 'gi'), '<b>$&</b>');
                    definition += '<ul class="sents">';
                    definition += '<li class="sent">';
                    definition += '<span class="sv_sent">' + svText + '</span><br>';
                    definition += '<span class="eng_sent">' + enText + '</span>';
                    definition += '</li>';
                    definition += '</ul>';
                }
            }
            
            if (definition) {
                definitions.push(definition);
            }
        }

        let css = this.renderCSS();
        notes.push({
            css: css,
            expression: expression,
            reading: reading,
            extrainfo: '',
            definitions: definitions,
            audios: audios
        });
        
        return notes;
    }

    renderCSS() {
        let css = '<style>';
        css += 'span.tran {margin:0; padding:0; font-size:1em;}';
        css += 'span.eng_tran {margin-right:3px; padding:0; color:#1565c0; font-size:1em;}';
        css += 'ul.sents {font-size:1em; list-style:none; margin:8px 0; padding:8px; background:rgba(46,125,50,0.1); border-radius:5px;}';
        css += 'li.sent {margin:0 0 8px 0; padding:0; line-height:1.4;}';
        css += 'span.sv_sent {color:#2e7d32; font-weight:500;}';
        css += 'span.eng_sent {color:#1565c0; font-style:italic;}';
        css += '</style>';
        return css;
    }
}