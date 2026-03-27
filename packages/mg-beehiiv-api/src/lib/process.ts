import {domUtils} from '@tryghost/mg-utils';
import _ from 'lodash';
import sanitizeHtml from 'sanitize-html';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import embedCard from '@tryghost/kg-default-cards/lib/cards/embed.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';

const {parseFragment, serializeChildren, serializeNode, replaceWith, insertAfter, attr, parents} = domUtils;

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const getYouTubeID = (url: string) => {
    const arr = url.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const isURL = (urlString: string | undefined) => {
    if (undefined === urlString) {
        return false;
    }

    try {
        new URL(urlString);
        return true;
    } catch (err) {
        return false;
    }
};

const processHTML = ({post, options}: {post?: mappedDataObject, options?: any}) => {
    // First, clean up the email HTML to remove bits we don't want or change up

    let html = post?.data.html ?? '';

    // Let's do some regexp magic to remove some beehiiv variables
    // https://support.beehiiv.com/hc/en-us/articles/7606088263191
    html = html.replace(/{{subscriber_id}}/g, ' ');
    html = html.replace(/{{rp_refer_url}}/g, '#');
    html = html.replace(/{{rp_refer_url_no_params}}/g, '#');

    const allParsed = parseFragment(html);
    const contentBlocksEl = allParsed.$('#content-blocks')[0];
    const contentBlocksHtml = contentBlocksEl ? serializeChildren(contentBlocksEl) : '';
    const parsed = parseFragment(contentBlocksHtml);

    // Convert divs with no content but a border-top to a HR
    parsed.$('div').forEach((el) => {
        const styleAttr = attr(el, 'style') || '';
        const hasBorderTop = styleAttr.includes('border-top');
        const hasContent = serializeChildren(el).trim().length > 0;

        if (hasBorderTop && !hasContent) {
            replaceWith(el, '<hr>');
        }
    });

    // Convert sponsored content tables to Ghost HTML cards
    parsed.$('table').forEach((el) => {
        const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
        if (/sponsored content/i.test(text)) {
            const tdEl = parsed.$('td', el)[0] || el;

            // Convert text-only inner divs to <p> tags; skip divs containing images
            parsed.$('div', tdEl).forEach((div) => {
                const inner = serializeChildren(div);
                if (parsed.$('img', div).length > 0) {
                    return;
                }
                if (inner.trim().length > 0) {
                    replaceWith(div, `<p>${inner}</p>`);
                } else {
                    div.remove();
                }
            });

            // Remove bare <br> elements that are direct children of td
            parsed.$('br', tdEl).forEach((br) => {
                if (br.parentElement === tdEl) {
                    br.remove();
                }
            });

            const content = serializeChildren(tdEl);
            const wrapper = el.parentElement;
            const target = wrapper && wrapper.tagName === 'DIV' ? wrapper : el;
            replaceWith(target, `<!--kg-card-begin: html--><div class="mg-sponsored" data-mg-skip="image-card">${content}</div><!--kg-card-end: html-->`);
        }
    });

    // Convert images to Ghost image cards
    parsed.$('img').forEach((el) => {
        // Skip images inside generic embeds (handled separately as bookmark cards)
        if (parents(el, '.generic-embed--root').length > 0) {
            return;
        }

        // Skip images inside elements marked to skip image card conversion
        if (parents(el, '[data-mg-skip="image-card"]').length > 0) {
            return;
        }

        const src = attr(el, 'src');
        const altText = attr(el, 'alt') || '';
        const parent = el.parentElement!;

        const cardOpts: any = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src,
                alt: altText,
                caption: null
            }
        };

        if (parent.tagName === 'DIV') {
            const caption = parsed.$('small', parent).map(s => s.textContent!.trim()).filter(Boolean).join('') || null;
            cardOpts.payload.caption = caption;
            const outerDiv = parent.parentElement;
            const target = outerDiv && outerDiv.tagName === 'DIV' ? outerDiv : parent;
            replaceWith(target, serializer.serialize(imageCard.render(cardOpts)));
        } else {
            el.remove();
            insertAfter(parent, serializer.serialize(imageCard.render(cardOpts)));
        }
    });

    // Convert nested padding-left divs to blockquotes
    parsed.$('div[style*="padding-left"] > div[style*="padding-left"]').forEach((el) => {
        const outerDiv = el.parentElement!;
        const paragraphs = parsed.$('p', outerDiv);

        if (paragraphs.length > 0) {
            const content = paragraphs.map(p => serializeNode(p)).join('');
            const citation = parsed.$('small', outerDiv).map(s => s.textContent!.trim()).filter(Boolean).join('');
            const cite = citation ? `<cite>${citation}</cite>` : '';
            replaceWith(outerDiv, `<blockquote>${content}${cite}</blockquote>`);
        }
    });

    // Convert buttons to Ghost buttons
    parsed.$('a > button').forEach((el) => {
        const link = el.parentElement!; // guaranteed by 'a > button' selector
        const wrapper = link.parentElement;
        const buttonText = el.textContent!.trim();
        const buttonHref = attr(link, 'href');
        const target = wrapper && wrapper.tagName === 'DIV' ? wrapper : link;

        replaceWith(target, `<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
    });

    // Rewrite subscribe links to Portal signup
    parsed.$('a[href*="/subscribe"]').forEach((el) => {
        attr(el, 'href', '/#/portal/signup');
    });

    // Handle link embeds
    parsed.$('.generic-embed--root').forEach((el) => {
        const anchorEl = parsed.$('a', el)[0] as Element | undefined;
        const titleEl = parsed.$('.generic-embed--title p', el)[0] as Element | undefined;
        const descEl = parsed.$('.generic-embed--description p', el)[0] as Element | undefined;
        const imageEl = parsed.$('.generic-embed--image img', el)[0] as Element | undefined;

        const href = anchorEl ? attr(anchorEl, 'href') : null;
        const title = titleEl ? _.unescape(titleEl.textContent!) : '';
        const description = descEl ? _.unescape(descEl.textContent!) : '';
        const image = imageEl ? attr(imageEl, 'src') : null;

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                url: href,
                metadata: {
                    url: href,
                    title: title,
                    description: description,
                    icon: null,
                    thumbnail: image,
                    publisher: null
                },
                caption: null
            }
        };

        replaceWith(el, serializer.serialize(bookmarkCard.render(cardOpts)));
    });

    // Unwrap audio iframes from tables
    parsed.$('table iframe[src^="https://audio.beehiiv.com"]').forEach((el) => {
        const tableParent = parents(el, 'table')[0];
        if (tableParent) {
            const iframeHtml = serializeNode(el);
            replaceWith(tableParent, iframeHtml);
        }
    });

    // Convert YouTube iframes to embeds
    parsed.$('iframe[src*="youtube.com/embed"], iframe[src*="youtu.be"]').forEach((el) => {
        const videoID = getYouTubeID(attr(el, 'src') as string);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                caption: null,
                html: `<iframe src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen="" width="160" height="90"></iframe>`
            }
        };

        replaceWith(el, serializer.serialize(embedCard.render(cardOpts)));
    });

    // Remove empty paragraphs
    parsed.$('p').forEach((el) => {
        const text = (el.textContent || '').trim();

        if (text.length === 0) {
            el.remove();
        }
    });

    // Remove style tags
    parsed.$('style').forEach((el) => {
        el.remove();
    });

    // Remove mobile ads
    parsed.$('#pad-mobile').forEach((el) => {
        el.remove();
    });

    // Remove style attributes
    parsed.$('[style]').forEach((el) => {
        el.removeAttribute('style');
    });

    // Unwrap divs, but preserve Ghost card and data-mg-skip divs
    parsed.$('div:not([class*="kg-"]):not([data-mg-skip])').forEach((el) => {
        if (parents(el, '[data-mg-skip]').length > 0) {
            return;
        }
        replaceWith(el, serializeChildren(el));
    });

    // Remove b, strong, i, em tags from headings but allow links inside them
    parsed.$('h1, h2, h3, h4, h5, h6').forEach((el) => {
        parsed.$('b, strong, i, em', el).forEach((ell) => {
            replaceWith(ell, serializeChildren(ell));
        });
    });

    // Get the cleaned HTML
    let bodyHtml = parsed.html();

    return bodyHtml;
};

const removeDuplicateFeatureImage = ({html, featureSrc}: {html: string, featureSrc: string}) => {
    const parsed = parseFragment(html);

    let firstElement = parsed.$('*')[0];

    if (firstElement) {
        const isImg = firstElement.tagName === 'IMG';
        const hasImg = !isImg && parsed.$('img', firstElement).length > 0;

        if (isImg || hasImg) {
            let theElementItself = isImg ? firstElement : parsed.$('img', firstElement)[0];
            let firstImgSrc: any = attr(theElementItself, 'src');

            // Both images usually end in the same way, so we can split the URL and compare the last part
            const firstImageSplit = firstImgSrc.split('/uploads/asset/');
            const featureImageSplit = featureSrc.split('/uploads/asset/');

            if (firstImageSplit[1] !== undefined && featureImageSplit[1] !== undefined && firstImageSplit[1] === featureImageSplit[1]) {
                theElementItself.remove();
            }

            if (featureSrc.length > 0 && firstImgSrc) {
                let normalizedFirstSrc = firstImgSrc.replace('fit=scale-down,format=auto,onerror=redirect,quality=80', 'quality=100');

                if (featureSrc === normalizedFirstSrc) {
                    theElementItself.remove();
                }
            }
        }
    }

    return parsed.html();
};

export {
    getYouTubeID,
    isURL,
    processHTML,
    removeDuplicateFeatureImage
};
