import {promises as fs} from 'node:fs';
import {join, basename} from 'node:path';
import url from 'node:url';
import {domUtils} from '@tryghost/mg-utils';
import errors from '@tryghost/errors';
import SimpleDom from 'simple-dom';
import imageCard from '@tryghost/kg-default-cards/lib/cards/image.js';
import audioCard from '@tryghost/kg-default-cards/lib/cards/audio.js';
import galleryCard from '@tryghost/kg-default-cards/lib/cards/gallery.js';
import bookmarkCard from '@tryghost/kg-default-cards/lib/cards/bookmark.js';
import fileCard from '@tryghost/kg-default-cards/lib/cards/file.js';
import {decode} from 'html-entities';
import {parseSrcset} from 'srcset';
import {_base as debugFactory} from '@tryghost/debug';
import {slugify} from '@tryghost/string';
import _ from 'lodash';

const {parseFragment, serializeChildren, replaceWith, insertBefore, insertAfter, attr, parents} = domUtils;

const serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
const debug = debugFactory('migrate:substack:process');

const getFiles = async (filePath) => {
    let filenames = await fs.readdir(filePath);

    return filenames.filter(filename => filename.match(/\.html/));
};

const readContent = async (filePath) => {
    return fs.readFile(filePath, 'utf-8');
};

const readFiles = async (files, postsDir) => {
    const postContent = {};
    for (const file of files) {
        const substackId = file.replace(/\.html/, '');

        postContent[substackId] = await readContent(join(postsDir, file));
    }

    return postContent;
};

const largeImageUrl = (path) => {
    if (path.includes('https://substackcdn.com/image/fetch/')) {
        path = decodeURIComponent(path.split('/').pop());
    }

    if (path.includes('https://bucketeer-')) {
        path = path.replace(/https:\/\/.*.s3.amazonaws.com/gmi, 'https://substack-post-media.s3.amazonaws.com');
    }

    return path;
};

const getUnsizedImageName = (str) => {
    const noSizeRegex = /(.*)(_[0-9]{1,4}x[0-9]{1,4}.[a-z]{2,4})/gmi;
    let srcParts = str.split(/\/|%2F/);
    let last = srcParts.slice(-1)[0];
    let matches = noSizeRegex.exec(last);

    if (matches) {
        return matches[1];
    } else {
        return str;
    }
};

const getImageDimensions = (str) => {
    const imageSizeRegexp = /_([0-9]{2,5})x([0-9]{2,5}).[a-zA-Z]{2,4}/;
    const matches = str.match(imageSizeRegexp);

    if (matches && matches[1] && matches[2]) {
        return {
            width: parseInt(matches[1]),
            height: parseInt(matches[2])
        };
    } else {
        return false;
    }
};

const largestSrc = (imageElem) => {
    const src = attr(imageElem, 'src');
    const srcset = attr(imageElem, 'srcset');

    if (!src || !src.length) {
        return '';
    }

    let srcToUse = src;

    if (srcset) {
        const parsedSrcset = parseSrcset(srcset);

        if (parsedSrcset && parsedSrcset.length > 0) {
            srcToUse = parsedSrcset[0].url;
        }
    }

    // Remove the width from the image URL
    srcToUse = srcToUse.replace(/w_[0-9]{2,4},c_limit,/, '');

    return srcToUse;
};

const processContent = (post, siteUrl, options) => {
    const {substackPodcastURL} = post;
    const {useMetaImage, useFirstImage} = options;

    let html = post.data?.html;

    // If there's no HTML, exit & return an empty string to avoid errors
    if (!html) {
        debug(`Post ${post.data.slug} has no HTML content`);
        post.data.html = '';
        return post;
    }

    // Parse the HTML inside a wrapper element so we have a global wrapper to target later on
    const parsed = parseFragment(`<div class="migrate-substack-wrapper">${html}</div>`);

    // Change paywall card to comment
    parsed.$('.paywall-jump').forEach((el) => {
        replaceWith(el, '<!--members-only-->');
    });

    // Empty text elements are commonplace and are not needed
    parsed.$('p').forEach((el) => {
        let content = serializeChildren(el).trim();

        if (content.length === 0) {
            el.remove();
        }
    });

    // Wrap these in a HTML card so they can be handled by publishers as needed
    parsed.$('div.latex-rendered').forEach((el) => {
        insertBefore(el, '<!--kg-card-begin: html-->');
        insertAfter(el, '<!--kg-card-end: html-->');
    });

    // We don't currently handle these, so remove them to clean up the document
    parsed.$('div.native-video-embed').forEach((el) => {
        el.remove();
    });

    parsed.$('div.poll-embed').forEach((el) => {
        el.remove();
    });

    parsed.$('.image3').forEach((el) => {
        const attrs = attr(el, 'data-attrs');
        const attrsObj = JSON.parse(attrs);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: largeImageUrl(attrsObj.src),
                alt: attrsObj.title,
                caption: attrsObj.title
            }
        };

        replaceWith(el, serializer.serialize(imageCard.render(cardOpts)));
    });

    // We use the `'og:image` as the feature image. If the first item in the content is an image and is the same as the `og:image`, remove it
    if (post.data?.og_image) {
        if (useMetaImage) {
            post.data.feature_image = largeImageUrl(post.data.og_image);
        }

        let firstElement = parsed.$('.migrate-substack-wrapper *')[0];

        if (firstElement) {
            const isImg = firstElement.tagName === 'IMG';
            const hasImg = !isImg && parsed.$('img', firstElement).length > 0;

            if (isImg || hasImg) {
                let theElementItself = isImg ? firstElement : parsed.$('img', firstElement)[0];
                let firstImgSrc = attr(theElementItself, 'src');

                if (firstImgSrc.length > 0) {
                    let unsizedFirstSrc = getUnsizedImageName(firstImgSrc);

                    let ogImgSrc = post.data.og_image;
                    let unsizedOgSrc = getUnsizedImageName(ogImgSrc);

                    if (unsizedFirstSrc === unsizedOgSrc) {
                        if (parsed.$('figcaption', firstElement).length) {
                            post.data.feature_image_caption = serializeChildren(parsed.$('figcaption', firstElement)[0]);
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
                let firstImgSrc = attr(theElementItself, 'src');

                if (firstImgSrc.length > 0) {
                    let unsizedFirstSrc = largeImageUrl(firstImgSrc);

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
    }

    // If we have a podcast URL `posts.csv`, embed an audio card at the start of the document
    // Else, if we have scraped a podcast URL, embed that instead
    if (substackPodcastURL || post.data?.podcast_audio_src) {
        let audioSrc = '';

        if (substackPodcastURL) {
            debug(`Post ${post.data.slug} has podcast episode from CSV`);
            audioSrc = substackPodcastURL;
        } else if (post.data?.podcast_audio_src) {
            debug(`Post ${post.data.slug} has podcast episode from scrape`);
            audioSrc = post.data.podcast_audio_src;
        }

        if (audioSrc && audioSrc.length > 0) {
            let cardOpts = {
                env: {dom: new SimpleDom.Document()},
                payload: {
                    src: audioSrc,
                    title: post.data.title
                }
            };

            const buildCard = audioCard.render(cardOpts);
            const cardHTML = buildCard.nodeValue;

            const wrapper = parsed.$('.migrate-substack-wrapper')[0];
            wrapper.insertAdjacentHTML('afterbegin', cardHTML);
        }
    }

    parsed.$('div.tweet').forEach((el) => {
        let childAnchors = parsed.$(':scope > a', el);
        let src = attr(childAnchors[0], 'href');
        let parsedUrl = url.parse(src);

        if (parsedUrl.search) {
            // remove possible query params
            parsedUrl.search = null;
        }
        src = url.format(parsedUrl, {search: false});

        const tweetTextEl = parsed.$('.tweet-text', el)[0];
        let tweetText = tweetTextEl ? serializeChildren(tweetTextEl).replace(/(?:\r\n|\r|\n)/g, '<br>') : false;
        const tweetAuthorNameEl = parsed.$('.tweet-author-name', el)[0];
        let tweetAuthorName = tweetAuthorNameEl ? serializeChildren(tweetAuthorNameEl).trim() : false;
        const tweetAuthorHandleEl = parsed.$('.tweet-author-handle', el)[0];
        let tweetAuthorHandle = tweetAuthorHandleEl ? serializeChildren(tweetAuthorHandleEl).trim() : false;
        const tweetDateTimeEl = parsed.$('.tweet-date', el)[0];
        let tweetDateTime = tweetDateTimeEl ? (tweetDateTimeEl.textContent || '').trim() : false;
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

    parsed.$('.image-gallery-embed').forEach((el) => {
        const attrs = attr(el, 'data-attrs');
        const attrsObj = JSON.parse(attrs);

        let items = [];

        attrsObj.gallery.images.forEach((item) => {
            const dimensions = getImageDimensions(item.src);

            items.push({
                fileName: basename(item.src),
                src: largeImageUrl(item.src),
                width: (dimensions) ? dimensions.width : '100',
                height: (dimensions) ? dimensions.height : '100'
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
                images: items,
                caption: attrsObj.gallery.caption
            }
        };

        replaceWith(el, serializer.serialize(galleryCard.render(cardOpts)));
    });

    parsed.$('[class*="ImageGallery-module__imageGallery"]').forEach((el) => {
        const rows = parsed.$('[class*="ImageGallery-module__imageRow"]', el);
        const figcaptionEl = parsed.$('figcaption', el)[0];
        const caption = figcaptionEl ? serializeChildren(figcaptionEl) : null;

        let items = [];

        rows.forEach((row) => {
            const pictures = parsed.$('picture', row);

            pictures.forEach((picture) => {
                const img = parsed.$('img', picture)[0];
                const src = largestSrc(img);
                const dimensions = getImageDimensions(src);

                items.push({
                    fileName: basename(src),
                    src: src,
                    width: (dimensions) ? dimensions.width : '100',
                    height: (dimensions) ? dimensions.height : '100'
                });
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
                images: items,
                caption: caption
            }
        };

        replaceWith(el, serializer.serialize(galleryCard.render(cardOpts)));
    });

    parsed.$('.captioned-image-container').forEach((div) => {
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
            }
        };

        if (imageSrc !== linkHref) {
            cardOpts.payload.href = linkHref;
        }

        replaceWith(div, serializer.serialize(imageCard.render(cardOpts)));
    });

    parsed.$('.image-link').forEach((anchor) => {
        const imgAltEl = parsed.$('img[alt]', anchor)[0];
        const imgAlt = imgAltEl ? attr(imgAltEl, 'alt') : '';
        const linkHref = attr(anchor, 'href');
        const imgEl = parsed.$('img', anchor)[0];
        const imageSrc = largestSrc(imgEl);

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                src: imageSrc,
                alt: imgAlt
            }
        };

        // If the anchor links to the image itself
        const splitRegexp = /public\/images\/|public%2Fimages%2F/;
        if (imageSrc.split(splitRegexp)[1] !== linkHref.split(splitRegexp)[1]) {
            cardOpts.payload.href = linkHref;
        }

        replaceWith(anchor, serializer.serialize(imageCard.render(cardOpts)));
    });

    parsed.$('.file-embed-wrapper').forEach((el) => {
        const fileSrcEl = parsed.$('.file-embed-button', el)[0];
        const fileSrc = attr(fileSrcEl, 'href');
        const fileTitleEl = parsed.$('.file-embed-details-h1', el)[0];
        const fileTitle = fileTitleEl ? fileTitleEl.textContent : '';
        const fileDetailsEl = parsed.$('.file-embed-details-h2', el)[0];
        const fileDetails = fileDetailsEl ? fileDetailsEl.textContent : '';

        const fileSizeMatch = fileDetails.match(/([\d.]+)([KMGT]B)/i);
        let fileSizeBytes = 0;

        if (fileSizeMatch) {
            const size = parseFloat(fileSizeMatch[1]);
            const unit = fileSizeMatch[2].toUpperCase();

            switch (unit) {
            case 'KB':
                fileSizeBytes = size * 1024;
                break;
            case 'MB':
                fileSizeBytes = size * 1024 * 1024;
                break;
            case 'GB':
                fileSizeBytes = size * 1024 * 1024 * 1024;
                break;
            case 'TB':
                fileSizeBytes = size * 1024 * 1024 * 1024 * 1024;
                break;
            default:
                fileSizeBytes = size;
            }
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

        replaceWith(el, serializer.serialize(fileCard.render(cardOpts)));
    });

    parsed.$('.comment').forEach((el) => {
        el.remove();
    });

    parsed.$('.digest-post-embed').forEach((el) => {
        const attrsRaw = attr(el, 'data-attrs');

        let attrs;

        // Return early if JSON is invalid
        try {
            attrs = JSON.parse(attrsRaw);
        } catch (error) {
            return;
        }

        const postUrl = attrs.canonical_url;
        const postTitle = attrs.title;
        const postCaption = attrs.caption;
        const postImage = attrs.cover_image;
        const postIcon = attrs.publication_logo_url;
        const postAuthor = attrs?.publishedBylines[0]?.name ?? null;
        const postPubName = attrs.publication_name;

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                url: postUrl,
                metadata: {
                    url: postUrl,
                    title: postTitle,
                    description: postCaption,
                    icon: largeImageUrl(postIcon),
                    thumbnail: postImage,
                    publisher: postPubName,
                    author: postAuthor
                },
                caption: null
            }
        };

        const bookmarkHtml = serializer.serialize(bookmarkCard.render(cardOpts));

        replaceWith(el, bookmarkHtml);
    });

    parsed.$('a > style').forEach((style) => {
        style.remove();
    });

    parsed.$('ul, ol').forEach((list) => {
        if (parsed.$('img, div, figure, blockquote, .button-wrapper', list).length) {
            insertBefore(list, '<!--kg-card-begin: html-->');
            insertAfter(list, '<!--kg-card-end: html-->');
        }
    });

    // Remove Substack share buttons
    parsed.$('p.button-wrapper').forEach((button) => {
        let shareLinks = parsed.$(':scope > a.button', button);
        if (shareLinks.length === 1 && siteUrl) {
            let shareLink = shareLinks[0];
            let src = attr(shareLink, 'href');
            let parsedUrl = url.parse(src);

            // If it's a share button, there's no use for it and completely remove the button
            if (parsedUrl.search && parsedUrl.search.indexOf('action=share') >= 0) {
                button.remove();
                return;
            }

            // If it's a gift button, there's no use for it and completely remove the button
            if (parsedUrl.search && parsedUrl.search.indexOf('gift=true') >= 0) {
                button.remove();
                return;
            }
        }
    });

    // Update button elements
    parsed.$('p.button-wrapper').forEach((button) => {
        let buttons = parsed.$(':scope > a.button', button);
        if (buttons.length === 1 && siteUrl) {
            let siteRegex = new RegExp(`^(?:${siteUrl}(?:\\/?)(?:p\\/)?)([a-zA-Z-_\\d]*)(?:\\/?)`, 'gi');
            let buttonLink = buttons[0];
            let buttonHref = attr(buttonLink, 'href');
            let buttonText = buttonLink.textContent;
            let parsedUrl = url.parse(buttonHref);

            // remove possible query params
            parsedUrl.search = null;

            buttonHref = url.format(parsedUrl, {search: false});

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

            replaceWith(button, `<div class="kg-card kg-button-card kg-align-center"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
        }
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    parsed.$('ul li ul, ol li ol, ol li ul, ul li ol').forEach((nestedList) => {
        const parentList = parents(nestedList, 'ul, ol')[0];
        if (parentList) {
            insertBefore(parentList, '<!--kg-card-begin: html-->');
            insertAfter(parentList, '<!--kg-card-end: html-->');
        }
    });

    // Handle footnotes
    let footnotesItems = [];
    let footnotesCount = 0;
    parsed.$('.footnote').forEach((el) => {
        const footnoteAnchor = parsed.$('a', el)[0];
        let footnoteBodyAnchor = attr(footnoteAnchor, 'href');

        let footnoteID = attr(el, 'id') || attr(footnoteAnchor, 'id');

        let footnoteNumber = footnoteID.replace('footnote-', '');
        let footnoteContent = parsed.$('.footnote-content', el)[0];

        const pElements = parsed.$('p', footnoteContent);
        const lastP = pElements[pElements.length - 1];
        if (lastP) {
            lastP.insertAdjacentHTML('beforeend', ` <a href="${footnoteBodyAnchor}" title="Jump back to footnote ${footnoteNumber} in the text.">↩</a>`);
        }

        footnotesItems.push(`<li id="${footnoteID}">${serializeChildren(footnoteContent)}</li>`);
        el.remove();

        footnotesCount = footnotesCount + 1;
    });

    if (footnotesCount > 0) {
        let footnotedHTML = `<div class="footnotes"><hr><ol>${footnotesItems.join('')}</ol></div>`;
        const wrapper = parsed.$('.migrate-substack-wrapper')[0];
        wrapper.insertAdjacentHTML('beforeend', `<!--kg-card-begin: html-->${footnotedHTML}<!--kg-card-end: html-->`);
    }

    // Wrap content that has footnote anchors in HTML tags to retain the footnote jump anchor
    parsed.$('p, ul, ol').forEach((el) => {
        if (parsed.$('a.footnote-anchor', el).length > 0) {
            insertBefore(el, '<!--kg-card-begin: html-->');
            insertAfter(el, '<!--kg-card-end: html-->');
        }
    });

    // Remove or replace subscribe links on the same domain
    if (options.noSubscribeButtons) {
        parsed.$('a').forEach((anchor) => {
            let href = attr(anchor, 'href');
            let linkRegex = new RegExp(`^(${siteUrl})?(/subscribe)(.*)`, 'gi');

            if (!href) {
                return;
            }

            let matches = href.replace(linkRegex, '$2');

            if (matches === '/subscribe') {
                anchor.remove();
            }
        });
    } else if (options.subscribeLink) {
        parsed.$('a').forEach((anchor) => {
            let href = attr(anchor, 'href');
            let linkRegex = new RegExp(`^(${siteUrl})?(/subscribe)(.*)`, 'gi');

            if (!href) {
                return;
            }

            let matches = href.replace(linkRegex, '$2');

            if (matches === '/subscribe') {
                attr(anchor, 'href', options.subscribeLink);
            }
        });
    }

    // Remove or replace signup forms with a Portal signup button
    if (options.noSubscribeButtons) {
        parsed.$('.subscription-widget-wrap, .subscription-widget-wrap-editor').forEach((div) => {
            div.remove();
        });
    } else if (options.subscribeLink) {
        parsed.$('.subscription-widget-wrap, .subscription-widget-wrap-editor').forEach((div) => {
            const hasForm = parsed.$('form', div);

            if (hasForm.length) {
                const submitEl = parsed.$('form input[type="submit"]', div)[0];
                const buttonText = submitEl ? attr(submitEl, 'value') : '';
                replaceWith(div, `<div class="kg-card kg-button-card kg-align-center"><a href="${options.subscribeLink}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
            }
        });
    }

    parsed.$('.embedded-post-wrap').forEach((div) => {
        const attrs = attr(div, 'data-attrs') || false;

        if (!attrs) {
            return;
        }

        // CASE: Some embedded posts are double-encoded, so we need to decode twice
        let bookmarkJSON = JSON.parse(decode(decode(attrs)));

        let bookmarkLink = bookmarkJSON.url;
        let bookmarkPubName = bookmarkJSON.publication_name;
        let bookmarkPubIcon = bookmarkJSON.publication_logo_url;
        let bookmarkTitle = bookmarkJSON.title;
        let bookmarkContent = bookmarkJSON.truncated_body_text;

        const embeddedHtml = `<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="${bookmarkLink}"><div class="kg-bookmark-content"><div class="kg-bookmark-title">${bookmarkTitle}</div><div class="kg-bookmark-description">${bookmarkContent}</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="${bookmarkPubIcon}"><span class="kg-bookmark-author">${bookmarkPubName}</span></div></div></a></figure>`;

        replaceWith(div, `<!--kg-card-begin: html-->${embeddedHtml}<!--kg-card-end: html-->`);
    });

    parsed.$('div.instagram').forEach((el) => {
        const instagramLink = parsed.$('a.instagram-image', el)[0];
        let src = instagramLink ? attr(instagramLink, 'href') : '';

        if (!src) {
            return;
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

        const instagramHtml = `<figure class="instagram"><iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;" src="${src}/embed/captioned/"></iframe><script async="" src="//www.instagram.com/embed.js"></script></figure>`;
        replaceWith(el, instagramHtml);
    });

    // For each image and link, alter the path to remove cropping & sizing for image paths
    parsed.$('img[src], a[href]').forEach((el) => {
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

const processPost = (post, siteUrl, options) => {
    // Add tags to the post
    const typeSlug = slugify(post.substackData.type);
    const visibilitySlug = slugify(post.substackData.audience);
    const {addTag, addPlatformTag, addTypeTag, addAccessTag} = options;

    // Add a type tag, e.g. Newsletter, Podcast, etc.
    const typeSlugSlugify = slugify(typeSlug);
    post.data.tags.push({
        url: `${siteUrl}/tag/${typeSlugSlugify}`,
        data: {
            slug: typeSlugSlugify,
            name: _.startCase(typeSlug)
        }
    });

    // Add a custom tag if one is provided
    if (addTag) {
        let trimmedTag = addTag.trim();
        let trimmedTagSlug = slugify(trimmedTag);
        post.data.tags.push({
            url: `${siteUrl}/tag/${trimmedTagSlug}`,
            data: {
                slug: trimmedTagSlug,
                name: trimmedTag
            }
        });
    }

    // Add a platform tag
    if (addPlatformTag) {
        post.data.tags.push({
            url: `migrator-added-tag`,
            data: {
                slug: `hash-substack`,
                name: `#substack`
            }
        });
    }

    // Add an internal tag based on the type of post
    if (addTypeTag) {
        post.data.tags.push({
            url: `migrator-added-tag-substack-type-${typeSlug}`,
            data: {
                slug: `hash-substack-type-${typeSlug}`,
                name: `#substack-type-${typeSlug}`
            }
        });
    }

    // Add tags based on post visibility
    if (addAccessTag) {
        post.data.tags.push({
            url: `migrator-added-tag-substack-access-${visibilitySlug}`,
            data: {
                slug: `hash-substack-access-${visibilitySlug}`,
                name: `#substack-access-${visibilitySlug}`
            }
        });
    }

    // And now process the HTML
    post = processContent(post, siteUrl, options);

    return post;
};

export default async (input, ctx) => {
    let {postsDir, options} = ctx;
    let {url: siteUrl} = options;
    const output = {};

    // console.log('in default');
    // console.log(input.posts);

    if (postsDir) {
        try {
            let postFiles = await getFiles(postsDir);
            let postContent = await readFiles(postFiles, postsDir);

            input.posts.map((post) => { // eslint-disable-line array-callback-return
                post.data.html = postContent[post.substackId];
            });
        } catch (error) {
            return new errors.InternalServerError({message: 'Couldn\'t read post files'});
        }
    }

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map((post) => {
            return processPost(post, siteUrl, options);
        });
    }

    return output;
};

export {
    processContent,
    getImageDimensions,
    largeImageUrl
};
