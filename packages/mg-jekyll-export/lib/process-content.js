const MarkdownIt = require('markdown-it');
const md = new MarkdownIt();
const fm = require('front-matter');
const $ = require('cheerio');

module.exports = (markdown, options = {}) => {
    const frontmatter = fm(markdown);
    const processedMarkdown = md.render(frontmatter.body);
    const $html = $.load(processedMarkdown, {
        decodeEntities: false
    });

    // Convert relative links and image paths to absolute
    if (options.url) {
        const urlData = new URL(options.url);
        const urlOrigin = urlData.href;

        $html('a').each((i, anchor) => {
            const thisURL = $(anchor).attr('href');

            // If it starts with a slash, append the base URL
            if (thisURL.indexOf('/') === 0) {
                const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisURL.replace(/^\/|\/$/g, '')}`;
                $(anchor).attr('href', updatedURL);
            }
        });

        $html('img').each((i, img) => {
            const thisSrc = $(img).attr('src');

            // If it starts with a slash, append the base URL
            if (thisSrc.indexOf('/') === 0) {
                const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisSrc.replace(/^\/|\/$/g, '')}`;
                $(img).attr('src', updatedURL);
            }
        });
    }

    let html = $html.html().trim();

    return html;
};
