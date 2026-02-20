import url from 'node:url';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import _ from 'lodash';
import MgWebScraper from '@tryghost/mg-webscraper';
import Shortcodes from '@tryghost/mg-shortcodes';
import {slugify} from '@tryghost/string';
import MgFsUtils from '@tryghost/mg-fs-utils';
import {htmlToText} from 'html-to-text';
import {_base as debugFactory} from '@tryghost/debug';
import SimpleDom from 'simple-dom';
import galleryCard from '@tryghost/kg-default-cards/lib/cards/gallery.js';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';
import {domUtils} from '@tryghost/mg-utils';

const {
    parseFragment,
    serializeNode,
    replaceWith,
    insertBefore,
    insertAfter,
    wrap,
    lastParent,
    setStyle,
    isComment,
    getCommentData
} = domUtils;

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);

const debug = debugFactory('migrate:wp-api:processor');

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
};

const getYouTubeID = (videoUrl) => {
    const arr = videoUrl.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const wpCDNToLocal = (imgUrl) => {
    if (!imgUrl) {
        return imgUrl;
    }

    if (!imgUrl.match(/i[0-9]+.wp.com/g)) {
        return imgUrl;
    }

    imgUrl = imgUrl.replace(/i[0-9]+.wp.com\//, '');

    const newUrl = new URL(imgUrl);
    newUrl.searchParams.delete('resize');

    const updatedUrl = `${newUrl.origin}${newUrl.pathname}`;

    return updatedUrl;
};

const largerSrc = (imageSrc) => {
    if (!imageSrc) {
        return imageSrc;
    }

    let newSrc = imageSrc;

    const fileSizeRegExp = new RegExp('-([0-9]{2,}x[0-9]{2,}).([a-zA-Z]{2,4})$');
    const fileSizeMatches = imageSrc.match(fileSizeRegExp);

    if (fileSizeMatches) {
        newSrc = imageSrc.replace(fileSizeRegExp, '.$2');
    }

    return newSrc;
};

const processAuthor = (wpAuthor) => {
    let authorObject = {
        url: wpAuthor.link,
        data: {
            id: wpAuthor.id && wpAuthor.id,
            slug: wpAuthor.slug,
            name: wpAuthor.name,
            email: wpAuthor.email && wpAuthor.email
        }
    };

    if (wpAuthor?.description) {
        authorObject.data.bio = htmlToText(wpAuthor.description, {
            wordwrap: false
        });
    }

    let profileImage = wpAuthor.avatar_urls && wpAuthor.avatar_urls['96'];
    if (profileImage) {
        const imgUrl = new URL(profileImage);
        const params = new URLSearchParams(imgUrl.search);
        params.set('d', 'blank');
        params.set('r', 'g');
        params.set('s', '500');
        imgUrl.search = params.toString();
        authorObject.data.profile_image = imgUrl.href;
    }

    if (wpAuthor.url) {
        try {
            new URL(wpAuthor.url);
            authorObject.data.website = wpAuthor.url;
        } catch (error) {
            // Just silently fail
            // console.log(error);
        }
    }

    return authorObject;
};

const processTerm = (wpTerm) => {
    return {
        url: wpTerm.link,
        data: {
            slug: wpTerm.slug,
            name: _.unescape(wpTerm.name)
        }
    };
};

const processTerms = (wpTerms, fetchTags) => {
    let categories = [];
    let tags = [];

    wpTerms.forEach((taxonomy) => {
        taxonomy.forEach((term) => {
            if (term.taxonomy === 'category') {
                categories.push(processTerm(term));
            }

            if (fetchTags && term.taxonomy === 'post_tag') {
                tags.push(processTerm(term));
            }
        });
    });

    return categories.concat(tags);
};

// Extract co-authors from wp:term data (used by Co-Authors Plus and PublishPress Authors plugins)
// These plugins store authors as a custom taxonomy with taxonomy === 'author'
const processCoAuthors = (wpTerms, users) => {
    const coAuthors = [];
    const seenSlugs = new Set();

    if (!wpTerms || !Array.isArray(wpTerms)) {
        return coAuthors;
    }

    wpTerms.forEach((taxonomy) => {
        if (!Array.isArray(taxonomy)) {
            return;
        }

        taxonomy.forEach((term) => {
            // Co-Authors Plus and PublishPress Authors use 'author' taxonomy
            if (term.taxonomy === 'author' && term.slug && !seenSlugs.has(term.slug)) {
                seenSlugs.add(term.slug);

                // Try to find matching user from the users list (for full user data)
                const matchedUser = users?.find(u => u.data.slug === term.slug);
                if (matchedUser) {
                    coAuthors.push(matchedUser);
                } else {
                    // Create author entry from the term data
                    coAuthors.push({
                        url: term.link,
                        data: {
                            slug: term.slug,
                            name: _.unescape(term.name)
                        }
                    });
                }
            }
        });
    });

    return coAuthors;
};

// Sometimes, the custom excerpt can be part of the post content. If the flag with an selector for the
// custom excerpt class is passed, we use this one to populate the custom excerpt and remove it from the post content
const processExcerpt = (html, excerptSelector = false) => {
    if (!html) {
        return '';
    }

    if (html.indexOf('[&hellip;]') > -1) {
        return '';
    }

    let excerptText;

    // Set the text to convert to either be the supplied string or found text in the supplied HTML chunk
    if (excerptSelector) {
        // TODO: this should be possible by using a pseudo selector as a passed `excerptSelector`, e. g. `h2.excerpt:first-of-type`,
        const parsed = parseFragment(html);
        const excerptEls = parsed.$(excerptSelector);
        excerptText = excerptEls.length > 0 ? excerptEls[0].innerHTML : '';
    } else {
        excerptText = html;
    }

    // Clean up the given text to contain no HTML
    let excerpt = htmlToText(excerptText);

    // Combine lines & trim excess white space
    excerpt = excerpt.split('\n').join(' ').trim();

    // which is officially supported by the underlying css-select library, but not working.
    if (excerpt.length > 0) {
        return excerpt;
    } else {
        return null;
    }
};

const processShortcodes = async ({html, options}) => {
    const shortcodes = new Shortcodes();
    const attachments = options?.attachments ?? null;

    shortcodes.add('vc_btn', ({attrs}) => {
        let buttonHref = attrs?.link ?? false;

        if (!buttonHref) {
            return;
        }

        // Sometimes URLs have a `url:` prefix which we don't want
        if (buttonHref.startsWith('url:')) {
            buttonHref = buttonHref.slice(4);
        }

        buttonHref = decodeURIComponent(buttonHref);

        return `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="${buttonHref}">${attrs.title}</a></div></div>`;
    });

    shortcodes.add('vc_cta', ({attrs}) => {
        let buttonHref = attrs?.btn_link ?? false;

        if (!buttonHref) {
            return;
        }

        // Sometimes URLs have a `url:` prefix which we don't want
        if (buttonHref.startsWith('url:')) {
            buttonHref = buttonHref.slice(4);
        }

        buttonHref = decodeURIComponent(buttonHref);

        return `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="${buttonHref}">${attrs.btn_title}</a></div></div>`;
    });

    shortcodes.add('caption', ({content}) => {
        if (!content) {
            return '';
        }

        const parsed = parseFragment(content);
        const imgEls = parsed.$('img');
        const img = imgEls[0];

        let theImageSrc = img ? (img.getAttribute('src') || '') : '';
        let theImageWidth = img ? (img.getAttribute('width') || '') : '';
        let theImageHeight = img ? (img.getAttribute('height') || '') : '';
        let theImageAlt = img ? (img.getAttribute('alt') || '') : '';
        let theImageTitle = img ? (img.getAttribute('title') || '') : '';

        // Convert $ to entity
        theImageAlt = theImageAlt.replace(/\$/gm, '&#36;');
        theImageTitle = theImageTitle.replace(/\$/gm, '&#36;');

        let theCaption = parsed.text().trim();

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: theImageSrc,
                width: theImageWidth,
                height: theImageHeight,
                alt: theImageAlt,
                title: theImageTitle
            }
        };

        if (theCaption.length) {
            cardOpts.payload.caption = theCaption;
        }

        return serializer.serialize(imageCard.render(cardOpts));
    });

    shortcodes.add('vc_separator', () => {
        return '<hr>';
    });

    shortcodes.add('gravityform', () => {
        return '';
    });

    shortcodes.add('et_pb_text', ({content}) => {
        // CASE: Divi Blog Extras uses these shortcodes for settings with text wrapped in `@ET-DC@..==@`, which should be removed if found
        // Else return the contents
        if (/^@ET-DC@.*==@$/.exec(content)) {
            return ' ';
        } else {
            return content;
        }
    });

    shortcodes.add('advanced_iframe', ({attrs}) => {
        return `<iframe src="${attrs.src}" height="${attrs.height}" style="border:0; width: 100%;" loading="lazy"></iframe>`;
    });

    if (attachments && attachments.length) {
        shortcodes.add('gallery', ({attrs}) => {
            // Convert `ids` param to array of images
            let images = [];

            if (attrs?.ids) {
                // Coerce attrs.ids to string if it isnt a string already
                if (typeof attrs.ids !== 'string') {
                    attrs.ids = attrs.ids.toString();
                }

                images = attrs.ids.split(',').map((i) => {
                    let idInt = parseInt(i.trim());
                    let foundAttachment = _.find(attachments, (item) => {
                        return parseInt(item.id) === idInt;
                    });
                    return foundAttachment;
                });

                // Filter out any undefined values
                images = images.filter((item) => {
                    return item !== undefined;
                });
            }

            const imageChunks = _.chunk(images, 9);

            let galleryHtmlChunks = [];

            imageChunks.forEach((chunk) => {
                let items = [];

                chunk.forEach((item) => {
                    items.push({
                        fileName: basename(item.url),
                        src: item.url,
                        alt: item.alt,
                        width: item.width,
                        height: item.height
                    });
                });

                items = items.map((item, index) => {
                    return {
                        ...item,
                        row: Math.floor(index / 3)
                    };
                });

                let cardOpts = {
                    env: {dom: new SimpleDom.Document()},
                    payload: {
                        images: items
                    }
                };

                galleryHtmlChunks.push(serializer.serialize(galleryCard.render(cardOpts)));
            });

            return galleryHtmlChunks.join('');
        });
    }

    shortcodes.add('sourcecode', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    shortcodes.add('audio', ({attrs}) => {
        const sourceSrc = attrs?.src ?? null;
        const sourceMp3 = attrs?.mp3 ?? null;
        const sourceM4a = attrs?.m4a ?? null;
        const sourceOgg = attrs?.ogg ?? null;
        const sourceWav = attrs?.wav ?? null;
        const sourceWma = attrs?.wma ?? null;

        const firstAudioSrc = sourceSrc || sourceMp3 || sourceM4a || sourceOgg || sourceWav || sourceWma;

        if (firstAudioSrc) {
            return `<!--kg-card-begin: html--><audio controls src="${firstAudioSrc}" preload="metadata"></audio><!--kg-card-end: html-->`;
        }
    });

    shortcodes.add('code', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content?.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    shortcodes.add('vc_custom_heading', ({attrs}) => {
        if (attrs?.font_container?.includes('tag:h1')) {
            return `<h1>${attrs.text}</h1>`;
        } else if (attrs?.font_container?.includes('tag:h2')) {
            return `<h2>${attrs.text}</h2>`;
        } else if (attrs?.font_container?.includes('tag:h3')) {
            return `<h3>${attrs.text}</h3>`;
        }
    });

    shortcodes.add('vc_empty_space', () => {
        return `<br></br>`;
    });

    // We don't want to change these, but only retain what's inside.
    shortcodes.unwrap('row');
    shortcodes.unwrap('column');
    shortcodes.unwrap('vc_row');
    shortcodes.unwrap('vc_row_inner');
    shortcodes.unwrap('vc_column');
    shortcodes.unwrap('vc_column_inner');
    shortcodes.unwrap('vc_column_text');
    shortcodes.unwrap('vc_basic_grid');
    shortcodes.unwrap('et_pb_code_builder_version');
    shortcodes.unwrap('et_pb_section');
    shortcodes.unwrap('et_pb_column');
    shortcodes.unwrap('et_pb_row');

    return shortcodes.parse(html);
};

/**
 * The rationale behind transforming the content is to allow `mg-html-mobiledoc` to do its best job
 * In some cases, transformation isn't needed as the parser handles it correctly.
 * In other cases, we need to *do* change the HTML structure, and this is where that happens.
 */
const processContent = async ({html, excerptSelector, featureImageSrc = false, fileCache = false, options = {}}) => { // eslint-disable-line no-shadow
    let webScraper = new MgWebScraper(fileCache);

    let allowRemoteScraping = !options?.scrape?.includes('none');

    html = await processShortcodes({html, options});

    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    // If rawHtml is set, don't process the HTML and wrap content in a HTML card
    if (options?.rawHtml) {
        return `<!--kg-card-begin: html-->${html}<!--kg-card-end: html-->`;
    }

    const parsed = parseFragment(html);

    // If the first content element is (or contains) an image that matches the feature image, remove it
    if (featureImageSrc) {
        let firstElement = parsed.body.firstElementChild;

        if (firstElement) {
            let isImg = firstElement.tagName.toLowerCase() === 'img';
            let hasImg = firstElement.querySelector('img');

            if (isImg || hasImg) {
                let theElementItself = isImg ? firstElement : firstElement.querySelector('img');
                let imgSrc = theElementItself ? theElementItself.getAttribute('src') : null;

                if (imgSrc) {
                    // Match largerSrc: strip WordPress size suffix (e.g. -100x100 or -10000x5000) and normalise protocol
                    let imgSrcNoSize = imgSrc.replace('http://', 'https://').replace(/(?:-\d{2,}x\d{2,})(\.\w+)$/gi, '$1');
                    let featureImageSrcNoSize = featureImageSrc.replace('http://', 'https://').replace(/(?:-\d{2,}x\d{2,})(\.\w+)$/gi, '$1');

                    if (featureImageSrcNoSize === imgSrcNoSize) {
                        firstElement.remove();
                    }
                }
            }
        }
    }

    if (options.removeSelectors) {
        for (const el of parsed.$(options.removeSelectors)) {
            el.remove();
        }
    }

    // Handle twitter embeds
    for (const el of parsed.$('p > script[src="https://platform.twitter.com/widgets.js"]')) {
        el.remove();
    }

    for (const toc of parsed.$('#toc_container')) {
        toc.remove();
    }

    // <style> blocks don't belong in content - codeinjection_head is the place for these
    for (const el of parsed.$('style')) {
        el.remove();
    }

    if (excerptSelector) {
        const excerptEls = parsed.$(excerptSelector);
        if (excerptEls.length > 0) {
            excerptEls[0].remove();
        }
    }

    // Basic text cleanup
    // @TODO: Expand on this
    for (const el of parsed.$('[style="font-weight: 400;"], [style="font-weight:400;"], [style="font-weight: 400"], [style="font-weight:400"]')) {
        el.removeAttribute('style');
    }

    // Normalize image elements
    for (const gal of parsed.$('.wp-block-jetpack-tiled-gallery')) {
        replaceWith(gal, gal.innerHTML);
    }

    for (const gal of parsed.$('.tiled-gallery__gallery')) {
        replaceWith(gal, gal.innerHTML);
    }

    for (const gal of parsed.$('.tiled-gallery__row')) {
        replaceWith(gal, gal.innerHTML);
    }

    for (const gal of parsed.$('.tiled-gallery__col')) {
        replaceWith(gal, gal.innerHTML);
    }

    for (const gal of parsed.$('.tiled-gallery__item')) {
        gal.removeAttribute('class');
    }

    // Remove duplicates images in <noscript> tags that have the same src
    for (const el of parsed.$('noscript')) {
        const prevEl = el.previousElementSibling;
        if (prevEl && prevEl.tagName.toLowerCase() === 'img') {
            const prevImgSrc = prevEl.getAttribute('data-src') || prevEl.getAttribute('src');
            const noScriptImg = el.querySelector('img');
            const noScriptImgSrc = noScriptImg ? noScriptImg.getAttribute('src') : null;

            const updatedPrevImgSrc = largerSrc(wpCDNToLocal(prevImgSrc));
            const updatedNoScriptImgSrc = largerSrc(wpCDNToLocal(noScriptImgSrc));

            if (updatedPrevImgSrc === updatedNoScriptImgSrc) {
                el.remove();
            }
        }
    }

    for (const el of parsed.$('div.wp-caption')) {
        const img = el.querySelector('img');

        if (!img) {
            continue;
        }

        const imgSrc = img.getAttribute('src');
        const imgAlt = img.getAttribute('alt');

        const captionEl = el.querySelector('.wp-caption-text');
        const hasCaption = !!captionEl;
        const imgCaption = hasCaption ? captionEl.textContent : '';

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: imgSrc,
                alt: imgAlt,
                caption: imgCaption
            }
        };

        if (hasCaption) {
            cardOpts.payload.caption = imgCaption;
        }

        replaceWith(el, serializer.serialize(imageCard.render(cardOpts)));
    }

    for (const img of parsed.$('img')) {
        img.removeAttribute('decoding');
        img.removeAttribute('data-id');
        img.removeAttribute('data-link');
        img.removeAttribute('data-url');
        img.removeAttribute('data-amp-layout');

        const dataWidth = img.getAttribute('data-width');
        if (dataWidth) {
            img.setAttribute('width', dataWidth);
            img.removeAttribute('data-width');
        }

        const dataHeight = img.getAttribute('data-height');
        if (dataHeight) {
            img.setAttribute('height', dataHeight);
            img.removeAttribute('data-height');
        }

        const nonCDNSrc = wpCDNToLocal(img.getAttribute('src'));
        img.setAttribute('src', nonCDNSrc);
    }

    // (Some) WordPress renders gifs a different way. They use an `img` tag with a `src` for a still image,
    // and a `data-gif` attribute to reference the actual gif. We need `src` to be the actual gif.
    for (const gif of parsed.$('img[data-gif]')) {
        let gifSrc = gif.getAttribute('data-gif');
        gif.removeAttribute('data-gif');
        gif.setAttribute('src', gifSrc);
    }

    // Likewise some images are lazy-loaded using JavaScript & `data-src` attributes
    for (const img of parsed.$('img[data-src]')) {
        let dataSrc = img.getAttribute('data-src');
        img.removeAttribute('data-src');
        img.setAttribute('src', dataSrc);
    }

    let libsynPodcasts = parsed.$('iframe[src*="libsyn.com/embed/"]').map(async (el) => {
        if (!allowRemoteScraping) {
            return;
        }

        let iframeSrc = el.getAttribute('src');
        let libsynIdRegex = new RegExp('/id/([0-9]{1,})/');
        let matches = iframeSrc.match(libsynIdRegex);
        let showId = matches[1];

        let newReqURL = `https://oembed.libsyn.com/embed?item_id=${showId}`;

        let scrapeConfig = {
            title: {
                selector: 'meta[property="og:title"]',
                attr: 'content'
            },
            durationSeconds: {
                selector: 'meta[property="music:duration"]',
                attr: 'content'
            },
            duration: {
                selector: 'meta[property="music:duration"]',
                attr: 'content',
                convert: (data) => {
                    return (data - (data %= 60)) / 60 + (9 < data ? ':' : ':0') + data;
                }
            },
            image: {
                selector: 'meta[property="og:image"]',
                attr: 'content'
            },
            audioSrc: {
                selector: 'meta[name="twitter:player:stream"]',
                attr: 'content'
            }
        };

        let filename = newReqURL.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let {responseData} = await webScraper.scrapeUrl(newReqURL, scrapeConfig, filename);

        let audioHTML = `
            <div class="kg-card kg-audio-card">
                <img src="${responseData.image}" alt="audio-thumbnail" class="kg-audio-thumbnail">
                <div class="kg-audio-player-container">
                    <audio src="${responseData.audioSrc}" preload="metadata"></audio>
                    <div class="kg-audio-title">${responseData.title}</div>
                    <div class="kg-audio-player">
                        <span class="kg-audio-current-time">0:00</span>
                        <div class="kg-audio-time">/<span class="kg-audio-duration">${responseData.duration}</span></div>
                        <input type="range" class="kg-audio-seek-slider" max="${responseData.durationSeconds}" value="0">
                    </div>
                </div>
            </div>
        `;

        replaceWith(el, audioHTML);
    });

    await Promise.all(libsynPodcasts);

    let wpEmbeds = parsed.$('.wp-block-embed.is-type-wp-embed').map(async (el) => {
        const blockquoteLink = el.querySelector('blockquote a');
        const bookmarkHref = blockquoteLink ? blockquoteLink.getAttribute('href') : null;
        const bookmarkTitle = blockquoteLink ? blockquoteLink.textContent : '';

        if (!bookmarkHref || !bookmarkTitle) {
            return;
        }

        const replaceWithLink = () => {
            replaceWith(el, `<p><a href="${bookmarkHref}">${bookmarkTitle}</a></p>`);
        };

        if (!allowRemoteScraping) {
            replaceWithLink();
            return;
        }

        try {
            const iframe = el.querySelector('iframe');
            const iframeHref = iframe ? iframe.getAttribute('src') : null;

            let scrapeConfig = {
                title: {
                    selector: 'meta[property="og:title"]',
                    attr: 'content'
                },
                description: {
                    selector: '.wp-embed-excerpt p',
                    how: 'html'
                },
                image: {
                    selector: '.wp-embed-featured-image img',
                    attr: 'src'
                },
                icon: {
                    selector: '.wp-embed-site-title img',
                    attr: 'src'
                },
                publisher: {
                    selector: '.wp-embed-site-title span',
                    how: 'text'
                }
            };

            let filename = bookmarkHref.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            let {responseData} = await webScraper.scrapeUrl(iframeHref, scrapeConfig, filename);

            let cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    url: bookmarkHref,
                    metadata: {
                        url: bookmarkHref,
                        title: bookmarkTitle
                    }
                }
            };

            if (responseData.image) {
                cardOpts.payload.metadata.thumbnail = responseData.image;
            }

            if (responseData.icon) {
                cardOpts.payload.metadata.icon = responseData.icon;
            }

            if (responseData.publisher) {
                cardOpts.payload.metadata.publisher = responseData.publisher;
            }

            if (responseData.description) {
                cardOpts.payload.metadata.description = stripHtml(responseData.description);
            }

            const bookmarkHtml = serializer.serialize(bookmarkCard.render(cardOpts));

            replaceWith(el, `<!--kg-card-begin: html-->${bookmarkHtml}<!--kg-card-end: html-->`);
        } catch (err) {
            replaceWithLink();
        }
    });

    await Promise.all(wpEmbeds);

    for (const el of parsed.$('.wp-block-syntaxhighlighter-code')) {
        const hasCodeElem = el.querySelector('code');

        if (!hasCodeElem) {
            el.innerHTML = `<code>${el.innerHTML}</code>`;
        }
    }

    for (const el of parsed.$('figure.wp-block-embed.is-provider-twitter')) {
        replaceWith(el, `<blockquote class="twitter-tweet"><a href="${el.textContent}"></a></blockquote>`);
    }

    for (const el of parsed.$('blockquote.twitter-tweet')) {
        let wrapperEl = wrap(el, '<figure class="kg-card kg-embed-card"></figure>');
        if (wrapperEl) {
            const script = parsed.document.createElement('script');
            script.setAttribute('async', '');
            script.setAttribute('src', 'https://platform.twitter.com/widgets.js');
            script.setAttribute('charset', 'utf-8');
            wrapperEl.appendChild(script);
            insertBefore(wrapperEl, '<!--kg-card-begin: embed-->');
            insertAfter(wrapperEl, '<!--kg-card-end: embed-->');
        }
    }

    for (const el of parsed.$('blockquote.twitter-video')) {
        let wrapperEl = wrap(el, '<figure class="kg-card kg-embed-card"></figure>');
        if (wrapperEl) {
            const script = parsed.document.createElement('script');
            script.setAttribute('async', '');
            script.setAttribute('src', 'https://platform.twitter.com/widgets.js');
            script.setAttribute('charset', 'utf-8');
            wrapperEl.appendChild(script);
            insertBefore(wrapperEl, '<!--kg-card-begin: embed-->');
            insertAfter(wrapperEl, '<!--kg-card-end: embed-->');
        }
    }

    // Handle instagram embeds
    for (const el of parsed.$('script[src="//platform.instagram.com/en_US/embeds.js"]')) {
        el.remove();
    }
    for (const el of parsed.$('#fb-root')) {
        const prevEl = el.previousElementSibling;
        if (prevEl && prevEl.tagName.toLowerCase() === 'script') {
            prevEl.remove();
        }
        const nextEl = el.nextElementSibling;
        if (nextEl && nextEl.tagName.toLowerCase() === 'script') {
            nextEl.remove();
        }

        el.remove();
    }

    for (const el of parsed.$('blockquote.instagram-media')) {
        const linkEl = el.querySelector('a');
        let src = linkEl ? linkEl.getAttribute('href') : null;

        if (!src) {
            src = el.getAttribute('data-instgrm-permalink');
        }

        if (!src) {
            continue;
        }

        let parsedUrl = url.parse(src);

        if (parsedUrl.search) {
            // remove possible query params
            parsedUrl.search = null;
        }
        src = url.format(parsedUrl, {search: false});

        // Trim the trailing slash from src if it exists
        if (src.endsWith('/')) {
            src = src.slice(0, -1);
        }

        const figure = parsed.document.createElement('figure');
        figure.setAttribute('class', 'instagram');

        const iframe = parsed.document.createElement('iframe');
        iframe.setAttribute('class', 'instagram-media instagram-media-rendered');
        iframe.setAttribute('id', 'instagram-embed-0');
        iframe.setAttribute('allowtransparency', 'true');
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('frameborder', '0');
        iframe.setAttribute('height', '968');
        iframe.setAttribute('data-instgrm-payload-id', 'instagram-media-payload-0');
        iframe.setAttribute('scrolling', 'no');
        iframe.setAttribute('style', 'background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;');
        iframe.setAttribute('src', `${src}/embed/captioned/`);

        const script = parsed.document.createElement('script');
        script.setAttribute('async', '');
        script.setAttribute('src', '//www.instagram.com/embed.js');

        figure.appendChild(iframe);
        figure.appendChild(script);

        replaceWith(el, serializeNode(figure));
    }

    // Convert <blockquote>s with 2 or more <p> tags into a single <p> tag
    for (const el of parsed.$('blockquote')) {
        const textElements = el.querySelectorAll('p, cite');

        if (textElements.length >= 2) {
            const combinedText = Array.from(textElements).map((element) => {
                return element.innerHTML.trim();
            }).join('<br><br>');
            replaceWith(el, `<blockquote><p>${combinedText}</p></blockquote>`);
        }
    }

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    for (const list of parsed.$('ol, ul')) {
        let parentList = lastParent(list, 'ul, ol');
        let $parent = parentList || list;

        let hasStyle = $parent.getAttribute('style') || $parent.querySelector('[style]');
        let hasType = $parent.getAttribute('type') || $parent.querySelector('[type]');
        let hasValue = $parent.getAttribute('value') || $parent.querySelector('[value]');
        let hasStart = $parent.getAttribute('start') || $parent.querySelector('[start]');
        let hasOLList = $parent.querySelector('ol');
        let hasULList = $parent.querySelector('ul');

        if (hasStyle || hasType || hasValue || hasStart || hasOLList || hasULList) {
            // If parent is not wrapped in a HTML card, wrap it in one
            const prevSibling = $parent.previousSibling;
            if (!isComment(prevSibling) || getCommentData(prevSibling) !== 'kg-card-begin: html') {
                insertBefore($parent, '<!--kg-card-begin: html-->');
                insertAfter($parent, '<!--kg-card-end: html-->');
            }
        }
    }

    // Handle button elements
    for (const el of parsed.$('.wp-block-buttons')) {
        let buttons = [];
        let isCentered = el.classList.contains('is-content-justification-center');
        let positionClass = (isCentered) ? 'kg-align-center' : 'kg-align-left';

        for (const button of el.querySelectorAll('.wp-block-button__link')) {
            let buttonHref = button.getAttribute('href');
            let buttonText = button.textContent;

            buttons.push(`<div class="kg-card kg-button-card ${positionClass}"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
        }

        replaceWith(el, buttons.join(''));
    }

    // Replace spacers with horizontal rules
    for (const el of parsed.$('.wp-block-spacer')) {
        replaceWith(el, '<hr>');
    }

    // Handle YouTube embeds
    for (const el of parsed.$('.wp-block-embed.is-provider-youtube')) {
        const iframe = el.querySelector('iframe');
        const videoUrl = iframe ? iframe.getAttribute('src') : el.textContent;
        const videoID = getYouTubeID(videoUrl);
        const figcaptionEl = el.querySelector('figcaption');
        const videoCaption = figcaptionEl ? figcaptionEl.textContent.trim() : false;

        if (videoUrl && videoID && videoID.length) {
            replaceWith(el, `<figure class="kg-card kg-embed-card"><iframe width="160" height="90"
            src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen=""></iframe>${videoCaption ? `<figcaption>${videoCaption}</figcaption>` : ''}</figure>`);
        }
    }

    // Handle list-based galleries
    for (const el of parsed.$('.wp-block-gallery')) {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                images: []
            }
        };

        for (const figureEl of el.querySelectorAll('figure')) {
            let img = figureEl.querySelector('img');

            if (img && img.getAttribute('src')) {
                cardOpts.payload.images.push({
                    row: 0,
                    fileName: basename(img.getAttribute('src')),
                    src: img.getAttribute('data-full') || img.getAttribute('src'),
                    width: img.getAttribute('width'),
                    height: img.getAttribute('height')
                });
            }
        }

        const galleryHtml = serializer.serialize(galleryCard.render(cardOpts));

        replaceWith(el, galleryHtml);
    }

    // Unwrap WP gallery blocks
    // Case: WP gallery blocks have figures in figures which trips up the HTML to mobiledoc conversion
    for (const el of parsed.$('.wp-block-gallery')) {
        replaceWith(el, el.innerHTML);
    }

    // Wrap inline styled tags in HTML card
    for (const styled of parsed.$('div[style], p[style], a[style], span[style]')) {
        // Get direct img children (not nested) that don't have data-gif
        let imgChildren = Array.from(styled.children).filter((child) => {
            return child.tagName && child.tagName.toLowerCase() === 'img' && !child.hasAttribute('data-gif');
        });

        if (imgChildren.length === 0) {
            insertBefore(styled, '<!--kg-card-begin: html-->');
            insertAfter(styled, '<!--kg-card-end: html-->');
        }
    }

    // Remove links around images that link to the same file
    for (const img of parsed.$('a > img')) {
        // <img> src
        let imageSrc = img.getAttribute('src');
        let largeSrc = largerSrc(imageSrc);

        // <a> href
        let link = img.parentElement;
        if (link && link.tagName.toLowerCase() === 'a') {
            let linkHref = link.getAttribute('href');
            let largeHref = largerSrc(linkHref);

            if (largeSrc === largeHref) {
                replaceWith(link, link.innerHTML);
            }
        }
    }

    // Some header elements contain span children to use custom inline styling. Wrap 'em in HTML cards.
    for (const styledSpan of parsed.$('h1 > span[style], h2 > span[style], h3 > span[style], h4 > span[style], h5 > span[style], h6 > span[style]')) {
        let heading = styledSpan.parentElement;
        if (heading && heading.matches('h1, h2, h3, h4, h5, h6')) {
            insertBefore(heading, '<!--kg-card-begin: html-->');
            insertAfter(heading, '<!--kg-card-end: html-->');
        }
    }

    // Convert videos to HTML cards and report as errors
    for (const el of parsed.$('video')) {
        const parent = el.parentElement;
        const isInFigure = parent && parent.tagName.toLowerCase() === 'figure';

        setStyle(el, 'width', '100%');

        if (isInFigure) {
            insertBefore(parent, '<!--kg-card-begin: html-->');
            insertAfter(parent, '<!--kg-card-end: html-->');
        } else {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        }
    }

    for (const el of parsed.$('audio')) {
        const parent = el.parentElement;
        const isInFigure = parent && parent.tagName.toLowerCase() === 'figure';

        setStyle(el, 'width', '100%');

        if (isInFigure) {
            insertBefore(parent, '<!--kg-card-begin: html-->');
            insertAfter(parent, '<!--kg-card-end: html-->');
        } else {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        }
    }

    for (const img of parsed.$('img')) {
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        let imageSrc = img.getAttribute('src');
        let newSrc = largerSrc(imageSrc);
        img.setAttribute('src', newSrc);
    }

    // Detect full size images
    // TODO: add more classes that are used within WordPress to determine full-width images
    for (const img of parsed.$('img.full.size-full')) {
        // Ignore images, that are already wrapped in a figure tag or are linked
        const parent = img.parentElement;
        const parentTag = parent ? parent.tagName.toLowerCase() : '';
        if (parentTag !== 'figure' && parentTag !== 'a') {
            img.classList.add('kg-image');

            if (img.getAttribute('srcset')) {
                img.removeAttribute('width');
                img.removeAttribute('height');
                img.removeAttribute('srcset');
                img.removeAttribute('sizes');
            }

            wrap(img, '<figure class="kg-card kg-image-card kg-width-wide"></figure>');
        }
    }

    // convert HTML back to a string
    html = parsed.html();

    return html;
};

/**
 * Convert data to the intermediate format of
 * {
 *   posts: [
 *      {
 *          url: 'http://something',
 *          data: {
 *             title: 'blah',
*              ...
 *          }
 *      }
 *   ]
 * }
 */
const processPost = async (wpPost, users, options = {}, errors, fileCache) => { // eslint-disable-line no-shadow
    let {tags: fetchTags, addTag, excerptSelector, excerpt, featureImageCaption} = options;

    let slug = wpPost.slug;
    let titleText = parseFragment(wpPost.title.rendered).text();

    // @note: we don't copy excerpts because WP generated excerpts aren't better than Ghost ones but are often too long.
    const post = {
        url: wpPost.link,
        data: {
            slug: slug,
            title: titleText,
            comment_id: wpPost.id,
            html: wpPost.content.rendered,
            type: wpPost.type === 'page' ? 'page' : 'post',
            status: wpPost.status === 'publish' ? 'published' : 'draft',
            created_at: wpPost.date_gmt,
            published_at: wpPost.date_gmt,
            updated_at: wpPost.modified_gmt,
            tags: []
        }
    };

    if (options.featureImage === 'featuredmedia' && wpPost.featured_media && wpPost._embedded['wp:featuredmedia'] && !post.data.feature_image) {
        const wpImage = wpPost._embedded['wp:featuredmedia'][0];
        try {
            post.data.feature_image = wpCDNToLocal(wpImage.source_url);
            post.data.feature_image_alt = wpImage.alt_text || null;
            post.data.feature_image_caption = (featureImageCaption !== false && wpImage.caption) ? stripHtml(wpImage.caption.rendered) : null;
        } catch (error) {
            console.log(error, wpPost); // eslint-disable-line no-console
        }
    }

    // Check for co-authors from Co-Authors Plus or PublishPress Authors plugins
    // These store authors as terms in wp:term with taxonomy === 'author'
    const coAuthors = wpPost._embedded && wpPost._embedded['wp:term']
        ? processCoAuthors(wpPost._embedded['wp:term'], users)
        : [];

    // Handle author assignment based on co-authors
    if (wpPost?.parsely?.meta?.author && wpPost.parsely.meta.author.length > 0) {
        wpPost.parsely.meta.author.forEach((author) => {
            post.data.author = processAuthor({name: author.name});
        });
    } else if (coAuthors.length > 1) {
        // Multiple co-authors: use authors array
        post.data.authors = coAuthors;
    } else if (coAuthors.length === 1) {
        // Single co-author: use author field for backwards compatibility
        post.data.author = coAuthors[0];
    } else {
        // No co-authors found, fall back to standard WordPress author
        post.data.author = users ? users.find((user) => {
            return user.data.id === wpPost.author;
        }) : null;

        // If no author was found from users list…
        if (!post.data.author) {
            // … but an embedded author is defined, use that
            if (wpPost._embedded && wpPost._embedded.author) {
                const wpAuthor = wpPost._embedded.author[0];
                post.data.author = processAuthor(wpAuthor);
            // … else, use the first user in the `users` object
            } else if (users && users.length > 0) {
                post.data.author = processAuthor(users[0].data);
            }
        }
    }

    if (wpPost._embedded && wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = processTerms(wpTerms, fetchTags);

        post.data.tags.push({
            url: 'migrator-added-tag',
            data: {
                slug: 'hash-wp',
                name: '#wp'
            }
        });
    }

    if (addTag) {
        post.data.tags.push({
            url: 'migrator-added-tag-custom',
            data: {
                slug: slugify(addTag),
                name: addTag
            }
        });
    }

    if (options.cpt) {
        if (!['post', 'page'].includes(wpPost.type)) {
            post.data.tags.push({
                url: 'migrator-added-tag-cpt',
                data: {
                    slug: `hash-${slugify(wpPost.type)}`,
                    name: `#${wpPost.type}`
                }
            });
        } else if (wpPost.type === 'post') {
            post.data.tags.push({
                url: 'migrator-added-tag-post',
                data: {
                    slug: `hash-wp-post`,
                    name: `#wp-post`
                }
            });
        }
    }

    if (excerpt && !excerptSelector) {
        post.data.custom_excerpt = processExcerpt(wpPost.excerpt.rendered);
    }

    if (!excerpt && excerptSelector) {
        post.data.custom_excerpt = processExcerpt(post.data.html, excerptSelector);
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = await processContent({
        html: post.data.html,
        excerptSelector: (!excerpt && excerptSelector) ? excerptSelector : false,
        featureImageSrc: post.data.feature_image,
        fileCache,
        options
    });

    return post;
};

const processPosts = async (posts, users, options, errors, fileCache) => { // eslint-disable-line no-shadow
    if (options.onlyURLs) {
        const onlyURLsContent = readFileSync(options.onlyURLs, {encoding: 'utf8'});
        const onlyURLsObj = MgFsUtils.csv.parseString(onlyURLsContent);

        // Filter…
        let foundPosts = [];
        onlyURLsObj.forEach((urlObj) => {
            let foundPost = _.find(posts, {
                link: urlObj.url
            });

            if (foundPost) {
                foundPosts.push(foundPost);
            } else {
                debug(`No post found for ${urlObj.url}`);
            }
        });

        posts = foundPosts;
    }

    return Promise.all(posts.map(post => processPost(post, users, options, errors, fileCache)));
};

const processAuthors = (authors) => {
    return authors.map(author => processAuthor(author));
};

const all = async (ctx) => {
    let {result: input, usersJSON, options, errors, fileCache} = ctx; // eslint-disable-line no-shadow

    if (usersJSON) {
        const mergedUsers = [];
        try {
            let passedUsers = usersJSON;
            console.log(`Passed a users file with ${passedUsers.length} entries, processing now!`); // eslint-disable-line no-console
            await passedUsers.map((passedUser) => { // eslint-disable-line array-callback-return
                const matchedUser = _.find(input.users, (fetchedUser) => {
                    if (fetchedUser.id && passedUser.id && fetchedUser.id === passedUser.id) {
                        return fetchedUser;
                    } else if (fetchedUser.slug && passedUser.slug && fetchedUser.slug === passedUser.slug) {
                        return fetchedUser;
                    } else if (fetchedUser.name && passedUser.name && fetchedUser.name === passedUser.name) {
                        return fetchedUser;
                    } else {
                        return false;
                    }
                });
                mergedUsers.push(Object.assign({}, passedUser, matchedUser));
            });
        } catch (error) {
            throw new errors.InternalServerError({message: 'Unable to process passed users file'});
        }
        input.users = mergedUsers;
    }

    const output = {
        users: processAuthors(input.users)
    };

    output.posts = await processPosts(input.posts, output.users, options, errors, fileCache);

    return output;
};

export default {
    wpCDNToLocal,
    processAuthor,
    processTerm,
    processTerms,
    processCoAuthors,
    processExcerpt,
    processShortcodes,
    processContent,
    processPost,
    processPosts,
    processAuthors,
    all
};
