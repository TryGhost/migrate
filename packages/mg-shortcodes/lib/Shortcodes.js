export default class Shortcodes {
    constructor() {
        this.shortcodes = [];
        this.html = '';
    }

    add(name, callback) {
        this.shortcodes.push({name, callback});
    }

    addWitSplit(name, split, target, callback) {
        this.shortcodes.push({name, split, target, callback});
    }

    unwrap(name) {
        this.shortcodes.push({name, callback: ({content}) => {
            return `${content} `;
        }});
    }

    unwrapFromQuotes(string = '') {
        const chars = ['’', '”', '“', '‘', '"', '&quot;'];
        const quoteRegExp = new RegExp(`^(${chars.join('|')})|(${chars.join('|')})$`, 'gm');
        return string.replace(quoteRegExp, '');
    }

    parseAttributes(attributesString) {
        const tagAttrRegExp = new RegExp(`([\\w-]+)\\s*=\\s*"([^"]*)"(?:\\s|$)|([\\w-]+)\\s*=\\s*'([^']*)'(?:\\s|$)|([\\w-]+)\\s*=\\s*([^\\s'"]+)(?:\\s|$)|"([^"]*)"(?:\\s|$)|'([^']*)'(?:\\s|$)|(\\S+)(?:\\s|$)`, 'gmi');

        const tagAttrMatches = [...RegExp.prototype[Symbol.matchAll].call(tagAttrRegExp, attributesString)];

        let attributes = {};

        tagAttrMatches.forEach((item) => {
            let theKey;
            let theValue;
            if (item[1] && item[2] !== 'undefined') {
                // Quoted key="value" pairs
                theKey = item[1];
                theValue = this.typeCast(item[2]);
            } else if (item[5] && item[6] !== 'undefined') {
                // Unquoted key=value pairs
                theKey = item[5];
                theValue = this.typeCast(item[6]);
            } else if (item[9]) {
                // Either a bool `someboolkey` of fallback `Study”="true"`
                if (item[9].includes('=')) {
                    let parts = item[9].split('=');
                    theKey = parts[0];
                    theValue = parts[1];
                } else {
                    theKey = item[9];
                    theValue = true;
                }
            }

            theKey = this.unwrapFromQuotes(theKey);

            if (typeof theValue === 'string') {
                theValue = this.unwrapFromQuotes(theValue);
            }

            attributes[theKey] = this.typeCast(theValue);
        });

        return attributes;
    }

    typeCast(value) {
        // Not supported type values
        if (typeof value !== 'number' && typeof value !== 'boolean' && typeof value !== 'string') {
            return value;
        }

        if (typeof value === 'string' && !value.trim()) {
            return value;
        }

        if (typeof value === 'boolean') {
            return value;
        }

        if (typeof value === 'string' && value.trim() === 'true') {
            return true;
        }

        if (typeof value === 'string' && value.trim() === 'false') {
            return false;
        }

        if (/^\d+$/.test(value)) {
            // Is positive int
            return parseInt(value, 10);
        } else if (/^\d+\.\d+$/.test(value)) {
            // Is positive float
            return parseFloat(value);
        } else if (/^(true|false)$/.test(value)) {
            // Is bool?
            return value === 'true';
        } else if (/^-\d+$/.test(value)) {
            // Is negative int
            return parseFloat(value);
        } else if (/^-\d+\.\d+$/.test(value)) {
            // Is negative float
            return parseFloat(value);
        }

        return value.toString();
    }

    hasKnownShortcode(text) {
        if (!text) {
            return false;
        }

        let result = false;

        this.shortcodes.forEach((shortcode) => {
            if (result && result.length) {
                return result;
            }

            let shortcodeName = shortcode.name;

            let shortcodeRegExp = new RegExp(`\\[${shortcodeName}(?<attrs>\\s[\\s\\S]*?)?\\](?:(?<content>(?!\\\\s*?(?:\\[${shortcodeName}|\\[\\/(?!${shortcodeName})))[\\s\\S]*?)(\\[\\/${shortcodeName}\\]))?`, 'm');

            let match = text.match(shortcodeRegExp);

            if (match && match.length) {
                let sub = this.hasKnownShortcode(match.groups.content);

                if (sub && sub.length) {
                    result = {
                        name: shortcodeName,
                        match: sub
                    };
                } else {
                    result = {
                        name: shortcodeName,
                        match: match
                    };
                }
            }
        });

        return (result) ? result : false;
    }

    getShortcode(name) {
        if (!name) {
            return false;
        }

        let foundShortcode = this.shortcodes.filter(n => n.name === name);

        return foundShortcode[0];
    }

    getCallback(name) {
        if (!name) {
            return false;
        }

        let foundShortcode = this.shortcodes.filter(n => n.name === name);

        return foundShortcode[0].callback;
    }

    process() {
        let text = this.html;

        let knownShortcode = this.hasKnownShortcode(text);

        if (knownShortcode) {
            const thisShortcode = this.getShortcode(knownShortcode.name);
            const theCall = thisShortcode.callback;
            const attrs = this.parseAttributes(knownShortcode.match.groups.attrs);
            let content = knownShortcode.match.groups.content;

            // If the shortcode has a `split` param & is present in the `content`, split the content and return the target
            if (thisShortcode.split && content.includes(`[${thisShortcode.split}]`)) {
                const splitContent = content.split(`[${thisShortcode.split}]`);
                content = splitContent[thisShortcode.target];
            }

            // content = content?.trim();

            if (theCall) {
                text = text.replace(knownShortcode.match[0], theCall({attrs, content}));
                this.html = text;
            }
        }

        return this.html;
    }

    parse(html) {
        this.html = html;

        // Keep looping all the time a known shortcode is found in the content
        while (this.hasKnownShortcode(this.html)) {
            this.process();
        }

        return this.html;
    }
}
