import * as cheerio from 'cheerio';

/*
Process the HTML of a single Jekyll Post.

Receives raw HTML, returns processed HTML
*/

export default (rawHtml, options = {}) => {
    const $html = cheerio.load(rawHtml, {
        xml: {
            xmlMode: false,
            decodeEntities: false,
            scriptingEnabled: false
        }
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    // Convert relative links and image paths to absolute
    if (options.url) {
        const urlData = new URL(options.url);
        // The "origin" the URL truncated to the domain.
        // The difference between the "href" matters for blogs that were hosted
        // in sub-directories so that relative and relative-to-root URLs resolve correctly.
        const urlOrigin = urlData.origin;

        $html('a').each((i, anchor) => {
            const thisURL = $html(anchor).attr('href');

            // If it starts with a slash, append the base URL
            if (thisURL && thisURL.indexOf('/') === 0) {
                const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisURL.replace(/^\/|\/$/g, '')}`;
                $html(anchor).attr('href', updatedURL);
            }
        });

        $html('img').each((i, img) => {
            const thisSrc = $html(img).attr('src');

            // If it starts with a slash, append the base URL
            if (thisSrc && thisSrc.indexOf('/') === 0) {
                const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisSrc.replace(/^\/|\/$/g, '')}`;
                $html(img).attr('src', updatedURL);
            }
        });
    }

    // Unwrap <p> tags that are in <li> tags
    $html('li').each((i, li) => {
        const hasP = $html(li).find('p').length;

        if (hasP) {
            $html(li).html($html(li).find('p').html());
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
