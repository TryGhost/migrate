const $ = require('cheerio');

/*
Process the HTML of a single Jekyll Post.

Receives raw HTML, returns processed HTML
*/

module.exports = (rawHtml, options = {}) => {
    const $html = $.load(rawHtml, {
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

    // Unwrap <p> tags that are in <li> tags
    $html('li').each((i, li) => {
        const hasP = $(li).find('p').length;

        if (hasP) {
            $(li).html($(li).find('p').html());
        }
    });

    let html = $html.html().trim();

    return html;
};
