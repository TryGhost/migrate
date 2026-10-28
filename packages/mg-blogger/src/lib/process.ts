import {basename} from 'node:path';
import {domUtils, cardUtils} from '@tryghost/mg-utils';
import autop from 'autop';
import sanitizeHtml from 'sanitize-html';
import SimpleDom from 'simple-dom';

const {serializeChildren, replaceWith, wrap} = domUtils;

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
const imageCard = cardUtils.getCard('image');

export interface ProcessedContent {
    html?: string;
    feature_image?: string | null;
    [key: string]: unknown;
}

export interface ProcessHTMLArgs {
    /** Fields to add `html` (and `feature_image`) to. */
    postData: ProcessedContent;
    html: string;
    options?: {firstImageAsFeatured?: boolean} | null;
}

const cleanExcerpt = (htmlContent: string): string => {
    // Convert to text only
    const cleanedContent = sanitizeHtml(htmlContent, {
        allowedTags: ['b', 'i', 'em', 'strong', 'a'],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target']
        }
    });

    return cleanedContent.trim();
};

const slugFromURL = (url: string): string => {
    return url.split('/').pop()!.replace('.html', '');
};

const increaseImageSize = (src: string): string => {
    // Increases the image size and removes special flags
    // https://developers.google.com/photos/library/guides/access-media-items
    let updatedSrc = src.replace(/\/s[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '/s2000');
    updatedSrc = updatedSrc.replace(/=s[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '=s2000');
    updatedSrc = updatedSrc.replace(/\/w[0-9]{2,5}-h[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '/w2000-h2000');
    updatedSrc = updatedSrc.replace(/=w[0-9]{2,5}-h[0-9]{2,5}(-[a-z0-9#,*]{1,4})?/g, '=w2000-h2000');
    return updatedSrc;
};

/** A Blogger image file name without its size segment, such as `-s320` or `=w640-h480`. */
const withoutSize = (name: string): string =>
    name.replace(/(.*)((-=|-|=)w[0-9]{2,5}-h[0-9]{2,5}|(-=|-|=)s[0-9]{2,5})/, '$1');

/**
 * Use a leading image as the feature image and remove it from the content: an `<img>` that is the first element, or
 * a first element with no text whose image is unlinked or links to the same image at another size.
 */
const handleFirstImage = ({postData, html}: {postData: ProcessedContent; html: string}): ProcessedContent => {
    return domUtils.processFragment(html, parsed => {
        const firstContentElement = parsed.body.children[0];

        if (firstContentElement?.tagName === 'IMG') {
            postData.feature_image = firstContentElement.getAttribute('src');
            firstContentElement.remove();
        } else if (firstContentElement && (firstContentElement.textContent || '').trim() === '') {
            const imgSrc = firstContentElement.querySelector('img')?.getAttribute('src');
            const aHref = firstContentElement.querySelector('a')?.getAttribute('href');

            // A first element without an image, such as an embed, stays in the content.
            if (
                imgSrc &&
                (!aHref ||
                    basename(imgSrc) === basename(aHref) ||
                    withoutSize(basename(imgSrc)) === withoutSize(basename(aHref)))
            ) {
                firstContentElement.remove();
                postData.feature_image = imgSrc;
            }
        }

        postData.html = parsed.html().trim();
        return postData;
    });
};

const processHTMLContent = async ({postData, html, options}: ProcessHTMLArgs): Promise<ProcessedContent> => {
    html = autop(html);

    html = domUtils.processFragment(html, parsed => {
        parsed.$('div.separator').forEach(el => {
            replaceWith(el, `<hr><div>${serializeChildren(el).trim()}</div>`);
        });

        parsed.$('img[src]').forEach(el => {
            const largerSrc = increaseImageSize(el.getAttribute('src')!);

            el.setAttribute('src', largerSrc);
            el.removeAttribute('width');
            el.removeAttribute('height');
        });

        parsed.$('.tr-caption-container').forEach(el => {
            const img = el.querySelector('img');
            const imgParentA = img?.closest('a');
            const href = imgParentA?.getAttribute('href');
            const imgSrc = img?.getAttribute('src');
            const captionEl = el.querySelector('.tr-caption');
            const caption = captionEl ? serializeChildren(captionEl) : '';
            const cleanedExcerpt = cleanExcerpt(caption);

            if (!imgSrc) {
                return;
            }

            // Update image size so we get the biggest image
            const updatedImgSrc = increaseImageSize(imgSrc);

            const cardOpts: any = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    src: updatedImgSrc,
                    caption: cleanedExcerpt
                }
            };

            if (href && updatedImgSrc !== increaseImageSize(href)) {
                cardOpts.payload.href = href;
            }

            const newCard = serializer.serialize(imageCard.render(cardOpts) as any);

            replaceWith(el, newCard);
        });

        parsed.$('a[href] > img[src]').forEach(el => {
            const parentA = el.parentElement!;
            const aHref = parentA.getAttribute('href')!;
            const imgSrc = el.getAttribute('src')!;

            // Don't touch Koenig cards
            if (parentA.getAttribute('class')?.includes('kg-') || el.getAttribute('class')?.includes('kg-')) {
                return;
            }

            if (increaseImageSize(aHref) === increaseImageSize(imgSrc)) {
                replaceWith(parentA, `<img src="${imgSrc}">`);
            }
        });

        // Convert weird lists to real lists
        parsed.$('span[style*="white-space: pre"]').forEach(el => {
            const parentDiv = el.closest('div');
            if (!parentDiv) {
                return;
            }

            const parentHTML = serializeChildren(parentDiv);
            if (parentHTML.includes('•')) {
                // Change div to li by replacing with a new li element
                const newLi = parsed.document.createElement('li');
                // Move the div's child nodes into the li. The div is replaced
                // below, so moving (rather than serializing back into innerHTML)
                // is safe and avoids reinterpreting DOM text as HTML.
                newLi.replaceChildren(...parentDiv.childNodes);
                // Remove the whitespace-pre spans
                newLi.querySelectorAll('span[style*="white-space: pre"]').forEach(span => {
                    span.remove();
                });
                // Trim leading/trailing whitespace from the list item. Merge
                // adjacent text nodes first, then strip whitespace directly from
                // the boundary text nodes so no serialized markup is re-parsed.
                // Only ASCII whitespace is trimmed (matching String.trim over the
                // serialized HTML); non-breaking spaces are left untouched.
                newLi.normalize();
                const firstChild = newLi.firstChild as Text | null;
                if (firstChild && firstChild.nodeType === 3) {
                    firstChild.data = firstChild.data.replace(/^[ \t\n\r\f\v]+/, '');
                    if (firstChild.data === '') {
                        firstChild.remove();
                    }
                }
                const lastChild = newLi.lastChild as Text | null;
                if (lastChild && lastChild.nodeType === 3) {
                    lastChild.data = lastChild.data.replace(/[ \t\n\r\f\v]+$/, '');
                    if (lastChild.data === '') {
                        lastChild.remove();
                    }
                }
                replaceWith(parentDiv, newLi);
            }
        });

        // Wrap <li>s in <ul>
        parsed.$('li').forEach(el => {
            const prevSibling = el.previousElementSibling;
            if (prevSibling && prevSibling.tagName === 'UL') {
                prevSibling.appendChild(el);
            } else {
                wrap(el, '<ul></ul>');
            }
        });

        parsed
            .$('div[style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]')
            .forEach(el => {
                replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
            });

        parsed
            .$(
                'span[style*="background-color"][style*="color"][style*="font-family"][style*="font-size"][style*="white-space: pre-line"]'
            )
            .forEach(el => {
                replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
            });

        parsed.$('div[style="text-align: center;"]').forEach(el => {
            replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
        });

        parsed.$('h1, h2, h3, h4, h5, h6').forEach(el => {
            const styleAttr = el.getAttribute('style');
            if (styleAttr === 'text-align: left;') {
                el.removeAttribute('style');
            }
        });

        parsed.$('h3 b').forEach(el => {
            replaceWith(el, serializeChildren(el));
        });

        parsed.$('div, p').forEach(el => {
            const attrs = el.attributes;
            const children = el.children;

            if (serializeChildren(el).trim() === '' && attrs.length === 0) {
                el.remove();
            } else if (attrs.length === 0 && children.length === 1 && children[0].tagName === 'IMG') {
                replaceWith(el, serializeChildren(el).trim());
            }
        });

        parsed.$('p').forEach(el => {
            const innerHtml = serializeChildren(el);
            if (innerHtml.trim() === '' || innerHtml.trim() === '&nbsp;') {
                el.remove();
            }
        });

        parsed.$('div').forEach(el => {
            const attrs = el.attributes;
            const children = el.children;

            if (attrs.length === 0 && children.length === 0) {
                replaceWith(el, `<p>${serializeChildren(el).trim()}</p>`);
            }
        });

        parsed.$('iframe[src*="youtube.com"]').forEach(el => {
            el.setAttribute('width', '160');
            el.setAttribute('height', '90');
        });

        // Convert back to plain HTML
        return parsed.html();
    });

    // Trim whitespace
    html = html.trim();

    // Remove first element(s) if <hr>
    html = html.replace(/^(<hr\/?> ?)+/gm, '').trim();

    // Remove empty attributes
    html = html.replace(/=""/g, '');

    postData.html = html;

    if (options?.firstImageAsFeatured) {
        postData = handleFirstImage({
            postData,
            html
        });
    }

    return postData;
};

export {cleanExcerpt, slugFromURL, increaseImageSize, processHTMLContent};
