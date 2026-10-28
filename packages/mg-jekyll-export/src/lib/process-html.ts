import {domUtils} from '@tryghost/mg-utils';

/** Prefix a root-relative path such as `/images/photo.jpg` with the site's origin. */
function absolute(origin: string, path: string | null): string | null {
    return path?.startsWith('/') ? `${origin}/${path.replace(/^\/|\/$/g, '')}` : null;
}

/**
 * Clean the HTML of one Jekyll post. With the live site's `url`, root-relative links and image sources become
 * absolute URLs on the site's origin, so a site hosted in a subdirectory still resolves them. A paragraph inside a
 * list item is unwrapped.
 */
export default function processHtml(rawHtml: string, url?: string | null): string {
    return domUtils.processFragment(rawHtml, parsed => {
        if (url) {
            // The origin, not the full URL: relative-to-root paths ignore the subdirectory a site was hosted in.
            const origin = new URL(url).origin;
            for (const anchor of parsed.$('a')) {
                const href = absolute(origin, anchor.getAttribute('href'));
                if (href) {
                    anchor.setAttribute('href', href);
                }
            }
            for (const img of parsed.$('img')) {
                const src = absolute(origin, img.getAttribute('src'));
                if (src) {
                    img.setAttribute('src', src);
                }
            }
        }

        for (const li of parsed.$('li')) {
            const p = li.querySelector('p');
            if (p) {
                li.replaceChildren(...p.childNodes);
            }
        }

        return parsed.html().trim();
    });
}
