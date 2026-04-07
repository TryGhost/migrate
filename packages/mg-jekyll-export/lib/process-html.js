import {domUtils} from '@tryghost/mg-utils';

const {serializeChildren} = domUtils;

/*
Process the HTML of a single Jekyll Post.

Receives raw HTML, returns processed HTML
*/

export default (rawHtml, options = {}) => {
    return domUtils.processFragment(rawHtml, (parsed) => {
        // Convert relative links and image paths to absolute
        if (options.url) {
            const urlData = new URL(options.url);
            // The "origin" the URL truncated to the domain.
            // The difference between the "href" matters for blogs that were hosted
            // in sub-directories so that relative and relative-to-root URLs resolve correctly.
            const urlOrigin = urlData.origin;

            parsed.$('a').forEach((anchor) => {
                const thisURL = anchor.getAttribute('href');

                // If it starts with a slash, append the base URL
                if (thisURL && thisURL.indexOf('/') === 0) {
                    const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisURL.replace(/^\/|\/$/g, '')}`;
                    anchor.setAttribute('href', updatedURL);
                }
            });

            parsed.$('img').forEach((img) => {
                const thisSrc = img.getAttribute('src');

                // If it starts with a slash, append the base URL
                if (thisSrc && thisSrc.indexOf('/') === 0) {
                    const updatedURL = `${urlOrigin.replace(/^\/|\/$/g, '')}/${thisSrc.replace(/^\/|\/$/g, '')}`;
                    img.setAttribute('src', updatedURL);
                }
            });
        }

        // Unwrap <p> tags that are in <li> tags
        parsed.$('li').forEach((li) => {
            const p = li.querySelector('p');

            if (p) {
                li.innerHTML = serializeChildren(p);
            }
        });

        // convert HTML back to a string
        let html = parsed.html();

        // Remove empty attributes
        html = html.replace(/=""/g, '');

        // Trim whitespace
        html = html.trim();

        return html;
    });
};
