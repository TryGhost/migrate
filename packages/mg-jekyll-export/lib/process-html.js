import $ from 'cheerio';

/*
Process the HTML of a single Jekyll Post.

Receives raw HTML, returns processed HTML
*/

export default (rawHtml, options = {}) => {
    const $html = $.load(rawHtml, {
        decodeEntities: false,
        scriptingEnabled: false
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    // Convert relative links and image paths to absolute
    if (options.url) {
        const urlData = new URL(options.url);
        // The "origin" the URL truncated to the domain.
        // The difference between the "href" matters for blogs that were hosted
        // in sub-directories so that relative and relative-to-root URLs resolve correctly.
        const urlOrigin = urlData.origin;

        $html('a').each((i, anchor) => {
            const thisURL = $(anchor).attr('href');

            // If it starts with a slash, append the base URL
            if (thisURL && thisURL.indexOf('/') === 0) {
                const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisURL.replace(/^\/|\/$/g, '')}`;
                $(anchor).attr('href', updatedURL);
            }
        });

        $html('img').each((i, img) => {
            const thisSrc = $(img).attr('src');

            // If it starts with a slash, append the base URL
            if (thisSrc && thisSrc.indexOf('/') === 0) {
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

    // convert HTML back to a string
    let html = $html.html();

    // Remove empty attributes
    html = html.replace(/=""/g, '');

    // Trim whitespace
    html = html.trim();

    return html;
};
