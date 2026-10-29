import {basename} from 'node:path';
import url from 'node:url';
import {domUtils, cardUtils, stringUtils} from '@tryghost/mg-utils';
import SimpleDom from 'simple-dom';
import {decode} from 'html-entities';
import {parseSrcset} from 'srcset';
import {_base as debugFactory} from '@tryghost/debug';
import escapeStringRegexp from 'escape-string-regexp';
import type {ContentOptions, ContentPost} from './types.js';

const {parseFragment, serializeChildren, replaceWith, insertBefore, insertAfter, attr, parents} = domUtils;
const {escapeHTML} = stringUtils;

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
const serialize = (node: unknown): string => serializer.serialize(node as any);
const debug = debugFactory('migrate:substack:process');
const imageCard = cardUtils.getCard('image');
const audioCard = cardUtils.getCard('audio');
const galleryCard = cardUtils.getCard('gallery');
const bookmarkCard = cardUtils.getCard('bookmark');
const fileCard = cardUtils.getCard('file');

const largeImageUrl = (path: string): string => {
    const substackCdnUrl = URL.parse(path);
    if (substackCdnUrl?.hostname === 'substackcdn.com' && substackCdnUrl.pathname.startsWith('/image/fetch/')) {
        path = decodeURIComponent(path.split('/').pop()!);
    }

    const bucketeerUrl = URL.parse(path);
    if (bucketeerUrl?.hostname.startsWith('bucketeer-')) {
        path = path.replace(/https:\/\/[^/]*\.s3\.amazonaws\.com/gim, 'https://substack-post-media.s3.amazonaws.com');
    }

    return path;
};

const getUnsizedImageName = (str: string): string => {
    // Match the size suffix (e.g. `_1200x800.jpg`) directly rather than with a
    // leading `(.*)` capture, which is vulnerable to polynomial backtracking.
    const sizeSuffixRegex = /_[0-9]{1,4}x[0-9]{1,4}.[a-z]{2,4}/gi;
    let srcParts = str.split(/\/|%2F/);
    let last = srcParts.slice(-1)[0];

    // Greedy `(.*)` settled on the last occurrence, so mirror that here
    let lastMatch: RegExpExecArray | null = null;
    for (const match of last.matchAll(sizeSuffixRegex)) {
        lastMatch = match;
    }

    if (lastMatch) {
        return last.slice(0, lastMatch.index);
    } else {
        return str;
    }
};

const getImageDimensions = (str: string): {width: number; height: number} | false => {
    const imageSizeRegexp = /_([0-9]{2,5})x([0-9]{2,5}).[a-zA-Z]{2,4}/;
    const matches = str.match(imageSizeRegexp);

    if (matches) {
        return {
            width: parseInt(matches[1]),
            height: parseInt(matches[2])
        };
    } else {
        return false;
    }
};

const largestSrc = (imageElem: Element | null): string => {
    const src = attr(imageElem, 'src');
    const srcset = attr(imageElem, 'srcset');

    if (!src) {
        return '';
    }

    let srcToUse = src;

    if (srcset) {
        const parsedSrcset = parseSrcset(srcset);

        if (parsedSrcset.length > 0) {
            srcToUse = parsedSrcset[0].url;
        }
    }

    // Remove the width from the image URL
    srcToUse = srcToUse.replace(/w_[0-9]{2,4},c_limit,/, '');

    return srcToUse;
};

/** Strip the query string from a URL, as the legacy `url.format()` round trip does. */
const withoutSearch = (src: string): string => {
    const parsedUrl = url.parse(src);
    parsedUrl.search = null;
    return url.format(parsedUrl);
};

/**
 * Convert Substack's export HTML into Ghost-compatible HTML, in place on `post.data`.
 *
 * Reads `post.data.html`, the optional scraped `og_image` and `podcast_audio_src`, and `post.substackPodcastURL`
 * (from `posts.csv`). Writes `post.data.html`, and `feature_image`/`feature_image_caption` when the first image
 * becomes the feature image.
 */
const processContent = (post: ContentPost, siteUrl: string, options: ContentOptions): ContentPost => {
    const {substackPodcastURL} = post;
    const {useMetaImage, useFirstImage} = options;

    let html = post.data.html;

    // If there's no HTML, exit & return an empty string to avoid errors
    if (!html) {
        debug(`Post ${post.data.slug} has no HTML content`);
        post.data.html = '';
        return post;
    }

    // Parse the HTML inside a wrapper element so we have a global wrapper to target later on
    const parsed = parseFragment(`<div class="migrate-substack-wrapper">${html}</div>`);

    // Change paywall card to comment
    parsed.$('.paywall-jump').forEach(el => {
        replaceWith(el, '<!--members-only-->');
    });

    // Empty text elements are commonplace and are not needed
    parsed.$('p').forEach(el => {
        let content = serializeChildren(el).trim();

        if (content.length === 0) {
            el.remove();
        }
    });

    parsed
        .$('h1 strong, h2 strong, h3 strong, h4 strong, h5 strong, h6 strong, h1 b, h2 b, h3 b, h4 b, h5 b, h6 b')
        .forEach(el => {
            replaceWith(el, serializeChildren(el));
        });

    // Wrap these in a HTML card so they can be handled by publishers as needed
    parsed.$('div.latex-rendered').forEach(el => {
        insertBefore(el, '<!--kg-card-begin: html-->');
        insertAfter(el, '<!--kg-card-end: html-->');
    });

    // We don't currently handle these, so remove them to clean up the document
    parsed.$('div.native-video-embed').forEach(el => {
        el.remove();
    });

    parsed.$('div.poll-embed').forEach(el => {
        el.remove();
    });

    parsed.$('.image3').forEach(el => {
        const attrsObj = JSON.parse(attr(el, 'data-attrs')!);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: largeImageUrl(attrsObj.src),
                alt: attrsObj.title,
                caption: attrsObj.title
            }
        };

        replaceWith(el, serialize(imageCard.render(cardOpts)));
    });

    // We use the `'og:image` as the feature image. If the first item in the content is an image and is the same as the `og:image`, remove it
    if (post.data.og_image) {
        if (useMetaImage) {
            post.data.feature_image = largeImageUrl(post.data.og_image);
        }

        let firstElement = parsed.$('.migrate-substack-wrapper *')[0];

        if (firstElement) {
            const isImg = firstElement.tagName === 'IMG';
            const hasImg = !isImg && parsed.$('img', firstElement).length > 0;

            if (isImg || hasImg) {
                let theElementItself = isImg ? firstElement : parsed.$('img', firstElement)[0];
                let firstImgSrc = attr(theElementItself, 'src')!;

                if (firstImgSrc.length > 0) {
                    let unsizedFirstSrc = getUnsizedImageName(firstImgSrc);

                    let ogImgSrc = post.data.og_image;
                    let unsizedOgSrc = getUnsizedImageName(ogImgSrc);

                    if (unsizedFirstSrc === unsizedOgSrc) {
                        if (parsed.$('figcaption', firstElement).length) {
                            post.data.feature_image_caption = serializeChildren(
                                parsed.$('figcaption', firstElement)[0]
                            );
                        }

                        firstElement.remove();
                    }
                }
            }
        }
    }

    if (useFirstImage && !post.data.feature_image) {
        let firstElement = parsed.$('.migrate-substack-wrapper *')[0];

        if (firstElement) {
            const isImg = firstElement.tagName === 'IMG';
            const hasImg = !isImg && parsed.$('img', firstElement).length > 0;

            if (isImg || hasImg) {
                let theElementItself = isImg ? firstElement : parsed.$('img', firstElement)[0];
                let firstImgSrc = attr(theElementItself, 'src')!;

                const unsizedFirstSrc = firstImgSrc.length > 0 ? largeImageUrl(firstImgSrc) : '';

                if (unsizedFirstSrc) {
                    post.data.feature_image = unsizedFirstSrc;

                    if (parsed.$('figcaption', firstElement).length) {
                        post.data.feature_image_caption = serializeChildren(parsed.$('figcaption', firstElement)[0]);
                    }

                    firstElement.remove();
                }
            }
        }
    }

    // If we have a podcast URL `posts.csv`, embed an audio card at the start of the document
    // Else, if we have scraped a podcast URL, embed that instead
    const audioSrc = substackPodcastURL || post.data.podcast_audio_src;
    if (audioSrc) {
        debug(`Post ${post.data.slug} has podcast episode from ${substackPodcastURL ? 'CSV' : 'scrape'}`);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: audioSrc,
                title: post.data.title
            }
        };

        const cardHTML = audioCard.render(cardOpts).nodeValue!;

        const wrapper = parsed.$('.migrate-substack-wrapper')[0];
        wrapper.insertAdjacentHTML('afterbegin', cardHTML);
    }

    parsed.$('div.tweet').forEach(el => {
        let childAnchors = parsed.$(':scope > a', el);
        let src = withoutSearch(attr(childAnchors[0], 'href')!);

        const tweetTextEl = parsed.$('.tweet-text', el)[0];
        let tweetText = tweetTextEl ? serializeChildren(tweetTextEl).replace(/(?:\r\n|\r|\n)/g, '<br>') : false;
        const tweetAuthorNameEl = parsed.$('.tweet-author-name', el)[0];
        let tweetAuthorName = tweetAuthorNameEl ? serializeChildren(tweetAuthorNameEl).trim() : false;
        const tweetAuthorHandleEl = parsed.$('.tweet-author-handle', el)[0];
        let tweetAuthorHandle = tweetAuthorHandleEl ? serializeChildren(tweetAuthorHandleEl).trim() : false;
        const tweetDateTimeEl = parsed.$('.tweet-date', el)[0];
        let tweetDateTime = tweetDateTimeEl ? tweetDateTimeEl.textContent!.trim() : false;
        const tweetLinkEl = parsed.$('.tweet-link-top', el)[0];
        let tweetURL = tweetLinkEl ? attr(tweetLinkEl, 'href') : false;

        let theHtml = [];

        if (tweetText) {
            theHtml.push(`<p lang="en" dir="ltr">${tweetText}</p>`);
        }

        theHtml.push(`&mdash;`);

        if (tweetAuthorName) {
            theHtml.push(`${tweetAuthorName}`);
        }

        if (tweetAuthorHandle) {
            theHtml.push(`(${tweetAuthorHandle})`);
        }

        if (tweetURL) {
            theHtml.push(`<a href="${tweetURL}">`);
        }

        if (tweetDateTime) {
            theHtml.push(`${tweetDateTime}`);
        }

        theHtml.push(`</a>`);

        const tweetHtml = `<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet">${theHtml.join(' ')}<a href="${src}"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>`;
        replaceWith(el, tweetHtml);
    });

    parsed.$('.image-gallery-embed').forEach(el => {
        const attrsObj = JSON.parse(attr(el, 'data-attrs')!);

        const items = attrsObj.gallery.images.map((item: {src: string}, index: number) => {
            const dimensions = getImageDimensions(item.src);

            return {
                fileName: basename(item.src),
                src: largeImageUrl(item.src),
                width: dimensions ? dimensions.width : '100',
                height: dimensions ? dimensions.height : '100',
                row: Math.floor(index / 3)
            };
        });

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                images: items,
                caption: attrsObj.gallery.caption
            }
        };

        replaceWith(el, serialize(galleryCard.render(cardOpts)));
    });

    parsed.$('[class*="ImageGallery-module__imageGallery"]').forEach(el => {
        const rows = parsed.$('[class*="ImageGallery-module__imageRow"]', el);
        const figcaptionEl = parsed.$('figcaption', el)[0];
        const caption = figcaptionEl ? serializeChildren(figcaptionEl) : null;

        const items: Record<string, unknown>[] = [];

        rows.forEach(row => {
            parsed.$('picture', row).forEach(picture => {
                const src = largestSrc(parsed.$('img', picture)[0]);
                const dimensions = getImageDimensions(src);

                items.push({
                    fileName: basename(src),
                    src: src,
                    width: dimensions ? dimensions.width : '100',
                    height: dimensions ? dimensions.height : '100',
                    row: Math.floor(items.length / 3)
                });
            });
        });

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                images: items,
                caption: caption
            }
        };

        replaceWith(el, serialize(galleryCard.render(cardOpts)));
    });

    parsed.$('.captioned-image-container').forEach(div => {
        const imgAltEl = parsed.$('img[alt]', div)[0];
        const imgAlt = imgAltEl ? attr(imgAltEl, 'alt') : '';
        const linkEl = parsed.$('a.image-link', div)[0];
        const linkHref = linkEl ? attr(linkEl, 'href') : false;
        const figcaptionEl = parsed.$('figcaption', div)[0];
        const imgCaption = figcaptionEl ? serializeChildren(figcaptionEl) : false;
        const imgEl = parsed.$('img', div)[0];
        const imageSrc = largestSrc(imgEl);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: imageSrc,
                alt: imgAlt,
                caption: imgCaption
            } as Record<string, unknown>
        };

        if (imageSrc !== linkHref) {
            cardOpts.payload.href = linkHref;
        }

        replaceWith(div, serialize(imageCard.render(cardOpts)));
    });

    parsed.$('.image-link').forEach(anchor => {
        const imgAltEl = parsed.$('img[alt]', anchor)[0];
        const imgAlt = imgAltEl ? attr(imgAltEl, 'alt') : '';
        const linkHref = attr(anchor, 'href')!;
        const imgEl = parsed.$('img', anchor)[0];
        const imageSrc = largestSrc(imgEl);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: imageSrc,
                alt: imgAlt
            } as Record<string, unknown>
        };

        // If the anchor links to the image itself
        const splitRegexp = /public\/images\/|public%2Fimages%2F/;
        if (imageSrc.split(splitRegexp)[1] !== linkHref.split(splitRegexp)[1]) {
            cardOpts.payload.href = linkHref;
        }

        replaceWith(anchor, serialize(imageCard.render(cardOpts)));
    });

    parsed.$('.file-embed-wrapper').forEach(el => {
        const fileSrcEl = parsed.$('.file-embed-button', el)[0];
        const fileSrc = attr(fileSrcEl, 'href');
        const fileTitleEl = parsed.$('.file-embed-details-h1', el)[0];
        const fileTitle = fileTitleEl ? fileTitleEl.textContent : '';
        const fileDetailsEl = parsed.$('.file-embed-details-h2', el)[0];
        const fileDetails = fileDetailsEl ? fileDetailsEl.textContent! : '';

        const fileSizeMatch = fileDetails.match(/([\d.]+)([KMGT]B)/i);
        let fileSizeBytes = 0;

        if (fileSizeMatch) {
            const size = parseFloat(fileSizeMatch[1]);
            const unit = fileSizeMatch[2].toUpperCase();
            const powers: Record<string, number> = {KB: 1, MB: 2, GB: 3, TB: 4};

            fileSizeBytes = size * 1024 ** powers[unit];
        }

        const cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: fileSrc,
                fileTitle: fileTitle,
                fileName: fileTitle,
                fileSize: fileSizeBytes
            }
        };

        replaceWith(el, serialize(fileCard.render(cardOpts)));
    });

    parsed.$('.comment').forEach(el => {
        el.remove();
    });

    parsed.$('.mention-wrap').forEach(el => {
        let attrs;

        try {
            attrs = JSON.parse(attr(el, 'data-attrs')!);
        } catch {
            return;
        }

        const name = attrs.name;
        const id = attrs.id;

        if (name && id) {
            replaceWith(
                el,
                `<a href="https://open.substack.com/users/${escapeHTML(String(id))}">${escapeHTML(String(name))}</a>`
            );
        }
    });

    parsed.$('.digest-post-embed').forEach(el => {
        let attrs;

        // Return early if JSON is invalid
        try {
            attrs = JSON.parse(attr(el, 'data-attrs')!);
        } catch {
            return;
        }

        const postUrl = attrs.canonical_url;

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                url: postUrl,
                metadata: {
                    url: postUrl,
                    title: attrs.title,
                    description: attrs.caption,
                    icon: largeImageUrl(attrs.publication_logo_url),
                    thumbnail: attrs.cover_image,
                    publisher: attrs.publication_name,
                    author: attrs?.publishedBylines[0]?.name ?? null
                },
                caption: null
            }
        };

        replaceWith(el, serialize(bookmarkCard.render(cardOpts)));
    });

    parsed.$('a > style').forEach(style => {
        style.remove();
    });

    parsed.$('ul, ol').forEach(list => {
        if (parsed.$('img, div, figure, blockquote, .button-wrapper', list).length) {
            insertBefore(list, '<!--kg-card-begin: html-->');
            insertAfter(list, '<!--kg-card-end: html-->');
        }
    });

    // Remove Substack share buttons
    parsed.$('p.button-wrapper').forEach(button => {
        let shareLinks = parsed.$(':scope > a.button', button);
        if (shareLinks.length === 1 && siteUrl) {
            let search = url.parse(attr(shareLinks[0], 'href')!).search;

            // If it's a share or gift button, there's no use for it, so completely remove the button
            if (search && (search.indexOf('action=share') >= 0 || search.indexOf('gift=true') >= 0)) {
                button.remove();
            }
        }
    });

    // Update button elements
    parsed.$('p.button-wrapper').forEach(button => {
        let buttons = parsed.$(':scope > a.button', button);
        if (buttons.length === 1 && siteUrl) {
            let siteRegex = new RegExp(
                `^(?:${escapeStringRegexp(siteUrl)}(?:\\/?)(?:p\\/)?)([a-zA-Z-_\\d]*)(?:\\/?)`,
                'gi'
            );
            let buttonLink = buttons[0];
            let buttonText = buttonLink.textContent;
            let buttonHref = withoutSearch(attr(buttonLink, 'href')!);

            if (buttonHref.match(siteRegex)) {
                buttonHref = buttonHref.replace(siteRegex, '/$1/');
            }

            if (buttonHref === '/subscribe/') {
                if (options.noSubscribeButtons) {
                    button.remove();
                    return;
                }
                buttonHref = options.subscribeLink || '#/portal/signup';
            }

            if (buttonHref.endsWith('/comments')) {
                buttonHref = options.commentLink || '#ghost-comments-root';

                if (!options.comments) {
                    button.remove();
                    return;
                }
            }

            const card = parsed.document.createElement('div');
            card.className = 'kg-card kg-button-card kg-align-center';
            const link = parsed.document.createElement('a');
            link.className = 'kg-btn kg-btn-accent';
            link.setAttribute('href', buttonHref);
            link.textContent = buttonText;
            card.appendChild(link);
            replaceWith(button, card);
        }
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    parsed.$('ul li ul, ol li ol, ol li ul, ul li ol').forEach(nestedList => {
        const parentList = parents(nestedList, 'ul, ol')[0];
        insertBefore(parentList, '<!--kg-card-begin: html-->');
        insertAfter(parentList, '<!--kg-card-end: html-->');
    });

    // Handle footnotes
    let footnotesItems: string[] = [];
    parsed.$('.footnote').forEach(el => {
        const footnoteAnchor = parsed.$('a', el)[0];
        let footnoteBodyAnchor = attr(footnoteAnchor, 'href');

        let footnoteID = attr(el, 'id') || attr(footnoteAnchor, 'id')!;

        let footnoteNumber = footnoteID.replace('footnote-', '');
        let footnoteContent = parsed.$('.footnote-content', el)[0];

        const pElements = parsed.$('p', footnoteContent);
        const lastP = pElements[pElements.length - 1];
        if (lastP) {
            lastP.insertAdjacentHTML(
                'beforeend',
                ` <a href="${footnoteBodyAnchor}" title="Jump back to footnote ${footnoteNumber} in the text.">↩</a>`
            );
        }

        footnotesItems.push(`<li id="${footnoteID}">${serializeChildren(footnoteContent)}</li>`);
        el.remove();
    });

    if (footnotesItems.length > 0) {
        let footnotedHTML = `<div class="footnotes"><hr><ol>${footnotesItems.join('')}</ol></div>`;
        const wrapper = parsed.$('.migrate-substack-wrapper')[0];
        wrapper.insertAdjacentHTML('beforeend', `<!--kg-card-begin: html-->${footnotedHTML}<!--kg-card-end: html-->`);
    }

    // Wrap content that has footnote anchors in HTML tags to retain the footnote jump anchor
    parsed.$('p, ul, ol').forEach(el => {
        if (parsed.$('a.footnote-anchor', el).length > 0) {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        }
    });

    // Remove or replace subscribe links on the same domain
    if (options.noSubscribeButtons || options.subscribeLink) {
        parsed.$('a').forEach(anchor => {
            let href = attr(anchor, 'href');
            let linkRegex = new RegExp(`^(${escapeStringRegexp(siteUrl)})?(/subscribe)(.*)`, 'gi');

            if (!href) {
                return;
            }

            let matches = href.replace(linkRegex, '$2');

            if (matches === '/subscribe') {
                if (options.noSubscribeButtons) {
                    anchor.remove();
                } else {
                    attr(anchor, 'href', options.subscribeLink!);
                }
            }
        });
    }

    // Remove or replace signup forms with a Portal signup button
    if (options.noSubscribeButtons) {
        parsed.$('.subscription-widget-wrap, .subscription-widget-wrap-editor').forEach(div => {
            div.remove();
        });
    } else if (options.subscribeLink) {
        parsed.$('.subscription-widget-wrap, .subscription-widget-wrap-editor').forEach(div => {
            const hasForm = parsed.$('form', div);

            if (hasForm.length) {
                const submitEl = parsed.$('form input[type="submit"]', div)[0];
                const buttonText = submitEl ? attr(submitEl, 'value')! : '';
                const card = parsed.document.createElement('div');
                card.className = 'kg-card kg-button-card kg-align-center';
                const link = parsed.document.createElement('a');
                link.className = 'kg-btn kg-btn-accent';
                link.setAttribute('href', options.subscribeLink!);
                link.textContent = buttonText;
                card.appendChild(link);
                replaceWith(div, card);
            }
        });
    }

    parsed.$('.embedded-post-wrap').forEach(div => {
        const attrs = attr(div, 'data-attrs');

        if (!attrs) {
            return;
        }

        // CASE: Some embedded posts are double-encoded, so we need to decode twice
        let bookmarkJSON = JSON.parse(decode(decode(attrs)));

        // The fields are decoded text, so they are escaped before they go back into HTML.
        const field = (name: string) => escapeHTML(String(bookmarkJSON[name]));
        let bookmarkLink = field('url');
        let bookmarkPubName = field('publication_name');
        let bookmarkPubIcon = field('publication_logo_url');
        let bookmarkTitle = field('title');
        let bookmarkContent = field('truncated_body_text');

        const embeddedHtml = `<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="${bookmarkLink}"><div class="kg-bookmark-content"><div class="kg-bookmark-title">${bookmarkTitle}</div><div class="kg-bookmark-description">${bookmarkContent}</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="${bookmarkPubIcon}"><span class="kg-bookmark-author">${bookmarkPubName}</span></div></div></a></figure>`;

        replaceWith(div, `<!--kg-card-begin: html-->${embeddedHtml}<!--kg-card-end: html-->`);
    });

    parsed.$('div.instagram').forEach(el => {
        const instagramLink = parsed.$('a.instagram-image', el)[0];
        let src = instagramLink ? attr(instagramLink, 'href') : '';

        if (!src) {
            return;
        }

        src = withoutSearch(src);

        // Trim the trailing slash from src if it exists
        if (src.endsWith('/')) {
            src = src.slice(0, -1);
        }

        const instagramHtml = `<figure class="instagram"><iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;" src="${src}/embed/captioned/"></iframe><script async="" src="//www.instagram.com/embed.js"></script></figure>`;
        replaceWith(el, instagramHtml);
    });

    // For each image and link, alter the path to remove cropping & sizing for image paths
    parsed.$('img[src], a[href]').forEach(el => {
        const src = attr(el, 'src');
        const href = attr(el, 'href');

        if (src) {
            attr(el, 'src', largeImageUrl(src));
        }

        if (href) {
            attr(el, 'href', largeImageUrl(href));
        }
    });

    // convert HTML back to a string
    const wrapper = parsed.$('.migrate-substack-wrapper')[0];
    html = serializeChildren(wrapper);

    // Remove empty attributes
    html = html.replace(/=""/g, '');

    // Apply our new HTML back to the post object
    post.data.html = html.trim();

    return post;
};

export {processContent, getImageDimensions, largeImageUrl};
