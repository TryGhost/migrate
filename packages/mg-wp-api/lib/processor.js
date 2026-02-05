import url from 'node:url';
import {readFileSync} from 'node:fs';
import {basename} from 'node:path';
import _ from 'lodash';
import * as cheerio from 'cheerio';
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
        const $excerpt = cheerio.load(html, {
            xml: {
                xmlMode: false,
                decodeEntities: false,
                scriptingEnabled: false
            }
        }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

        excerptText = $excerpt(excerptSelector).first().html();
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

        const $caption = cheerio.load(content, {}, false);

        let theImageSrc = $caption('img').attr('src') ?? '';
        let theImageWidth = $caption('img').attr('width') ?? '';
        let theImageHeight = $caption('img').attr('height') ?? '';
        let theImageAlt = $caption('img').attr('alt') ?? '';
        let theImageTitle = $caption('img').attr('title') ?? '';

        // Convert $ to entity
        theImageAlt = theImageAlt.replace(/\$/gm, '&#36;');
        theImageTitle = theImageTitle.replace(/\$/gm, '&#36;');

        let theCaption = $caption.text().trim();

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

    const $html = cheerio.load(html, {
        xml: {
            xmlMode: false,
            decodeEntities: false,
            scriptingEnabled: false
        }
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    // If the first element in the content is an image, and is the same as the feature image, remove it
    if (featureImageSrc) {
        let firstElement = $html('*').first();

        if (firstElement.tagName === 'img' || $html(firstElement).find('img').length) {
            let theElementItself = (firstElement.tagName === 'img') ? firstElement : $html(firstElement).find('img');

            if ($html(theElementItself).attr('src')) {
                // Ensure the feature image and first image both are HTTPS with no size attributes
                let imgSrcNoSize = $html(theElementItself).attr('src').replace('http://', 'https://').replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
                let featureImageSrcNoSize = featureImageSrc.replace('http://', 'https://').replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');

                if (featureImageSrcNoSize === imgSrcNoSize) {
                    $html(firstElement).remove();
                }
            }
        }
    }

    if (options.removeSelectors) {
        $html(options.removeSelectors).each((i, el) => {
            $html(el).remove();
        });
    }

    // Handle twitter embeds
    $html('p > script[src="https://platform.twitter.com/widgets.js"]').remove();

    $html('#toc_container').each((i, toc) => {
        $html(toc).remove();
    });

    // <style> blocks don't belong in content - codeinjection_head is the place for these
    $html('style').each((i, el) => {
        $html(el).remove();
    });

    if (excerptSelector) {
        $html(excerptSelector).first().each((i, excerpt) => {
            $html(excerpt).remove();
        });
    }

    // Basic text cleanup
    // @TODO: Expand on this
    $html('[style="font-weight: 400;"], [style="font-weight:400;"], [style="font-weight: 400"], [style="font-weight:400"]').each((i, el) => {
        $html(el).removeAttr('style');
    });

    // Normalize image elements
    $html('.wp-block-jetpack-tiled-gallery').each((i, gal) => {
        $html(gal).replaceWith($html(gal).html());
    });

    $html('.tiled-gallery__gallery').each((i, gal) => {
        $html(gal).replaceWith($html(gal).html());
    });

    $html('.tiled-gallery__row').each((i, gal) => {
        $html(gal).replaceWith($html(gal).html());
    });

    $html('.tiled-gallery__col').each((i, gal) => {
        $html(gal).replaceWith($html(gal).html());
    });

    $html('.tiled-gallery__item').each((i, gal) => {
        $html(gal).removeAttr('class');
    });

    // Remove duplicates images in <noscript> tags that have the same src
    $html('noscript').each((i, el) => {
        if (el?.prev?.name === 'img') {
            const prevImgSrc = el.prev.attribs['data-src'] ?? el.prev.attribs.src;
            const noScriptImgSrc = $html(el).find('img').attr('src');

            const updatedPrevImgSrc = largerSrc(wpCDNToLocal(prevImgSrc));
            const updatedNoScriptImgSrc = largerSrc(wpCDNToLocal(noScriptImgSrc));

            if (updatedPrevImgSrc === updatedNoScriptImgSrc) {
                $html(el).remove();
            }
        }
    });

    $html('div.wp-caption').each((i, el) => {
        const hasImage = $html(el).find('img').length > 0;

        if (!hasImage) {
            return;
        }

        const imgSrc = $html(el).find('img').attr('src');
        const imgAlt = $html(el).find('img').attr('alt');

        const hasCaption = $html(el).find('.wp-caption-text').length > 0;
        const imgCaption = hasCaption ? $html(el).find('.wp-caption-text').text() : '';

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

        $html(el).replaceWith(serializer.serialize(imageCard.render(cardOpts)));
    });

    $html('img').each((i, img) => {
        $html(img).removeAttr('decoding');
        $html(img).removeAttr('data-id');
        $html(img).removeAttr('data-link');
        $html(img).removeAttr('data-url');
        $html(img).removeAttr('data-amp-layout');

        if ($html(img).attr('data-width')) {
            $html(img).attr('width', $html(img).attr('data-width'));
            $html(img).removeAttr('data-width');
        }

        if ($html(img).attr('data-height')) {
            $html(img).attr('height', $html(img).attr('data-height'));
            $html(img).removeAttr('data-height');
        }

        const nonCDNSrc = wpCDNToLocal($html(img).attr('src'));
        $html(img).attr('src', nonCDNSrc);
    });

    // (Some) WordPress renders gifs a different way. They use an `img` tag with a `src` for a still image,
    // and a `data-gif` attribute to reference the actual gif. We need `src` to be the actual gif.
    $html('img[data-gif]').each((i, gif) => {
        let gifSrc = $html(gif).attr('data-gif');
        $html(gif).removeAttr('data-gif');
        $html(gif).attr('src', gifSrc);
    });

    // Likewise some images are lazy-loaded using JavaScript & `data-src` attributes
    $html('img[data-src]').each((i, img) => {
        let dataSrc = $html(img).attr('data-src');
        $html(img).removeAttr('data-src');
        $html(img).attr('src', dataSrc);
    });

    let libsynPodcasts = $html('iframe[src*="libsyn.com/embed/"]').map(async (i, el) => {
        if (!allowRemoteScraping) {
            return;
        }

        let iframeSrc = $html(el).attr('src');
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

        $html(el).replaceWith(audioHTML);
    }).get();

    await Promise.all(libsynPodcasts);

    let wpEmbeds = $html('.wp-block-embed.is-type-wp-embed').map(async (i, el) => {
        const bookmarkHref = $html(el).find('blockquote a').attr('href');
        const bookmarkTitle = $html(el).find('blockquote a').text();

        if (!bookmarkHref || !bookmarkTitle) {
            return;
        }

        const replaceWithLink = () => {
            $html(el).replaceWith(`<p><a href="${bookmarkHref}">${bookmarkTitle}</a></p>`);
        };

        if (!allowRemoteScraping) {
            replaceWithLink();
            return;
        }

        try {
            const iframeHref = $html(el).find('iframe').attr('src');

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

            $html(el).replaceWith(`<!--kg-card-begin: html-->${bookmarkHtml}<!--kg-card-end: html-->`);
        } catch (err) {
            replaceWithLink();
        }
    }).get();

    await Promise.all(wpEmbeds);

    $html('.wp-block-syntaxhighlighter-code').each((i, el) => {
        const hasCodeElem = $html(el).find('code').length;

        if (!hasCodeElem) {
            $html(el).html(`<code>${$html(el).html()}</code>`);
        }
    });

    $html('figure.wp-block-embed.is-provider-twitter').each((i, el) => {
        $html(el).replaceWith(`<blockquote class="twitter-tweet"><a href="${$html(el).text()}"></a></blockquote>`);
    });

    $html('blockquote.twitter-tweet').each((i, el) => {
        let $figure = $html('<figure class="kg-card kg-embed-card"></figure>');
        let $script = $html('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $html(el).wrap($figure);
        $figure.append($script);
        $figure.before('<!--kg-card-begin: embed-->');
        $figure.after('<!--kg-card-end: embed-->');
    });

    $html('blockquote.twitter-video').each((i, el) => {
        let $figure = $html('<figure class="kg-card kg-embed-card"></figure>');
        let $script = $html('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $html(el).wrap($figure);
        $figure.append($script);
        $figure.before('<!--kg-card-begin: embed-->');
        $figure.after('<!--kg-card-end: embed-->');
    });

    // Handle instagram embeds
    $html('script[src="//platform.instagram.com/en_US/embeds.js"]').remove();
    $html('#fb-root').each((i, el) => {
        if ($html(el).prev().get(0) && $html(el).prev().get(0).name === 'script') {
            $html(el).prev().remove();
        }
        if ($html(el).next().get(0) && $html(el).next().get(0).name === 'script') {
            $html(el).next().remove();
        }

        $html(el).remove();
    });

    $html('blockquote.instagram-media').each((i, el) => {
        let src = $html(el).find('a').attr('href');

        if (!src) {
            src = $html(el).attr('data-instgrm-permalink');
        }

        if (!src) {
            return;
        }

        let parsed = url.parse(src);

        if (parsed.search) {
            // remove possible query params
            parsed.search = null;
        }
        src = url.format(parsed, {search: false});

        let $iframe = $html('<iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;"></iframe>');
        let $script = $html('<script async="" src="//www.instagram.com/embed.js"></script>');
        let $figure = $html('<figure class="instagram"></figure>');

        // Trim the trailing slash from src if it exists
        if (src.endsWith('/')) {
            src = src.slice(0, -1);
        }

        $iframe.attr('src', `${src}/embed/captioned/`);
        $figure.append($iframe);
        $figure.append($script);

        $html(el).replaceWith($figure);
    });

    // Convert <blockquote>s with 2 or more <p> tags into a single <p> tag
    $html('blockquote').each((i, el) => {
        const textElements = $html(el).find('p, cite');

        if (textElements.length >= 2) {
            const combinedText = textElements.map((index, element) => $html(element).html()).get().join('<br><br>');
            const newParagraph = $html('<p>').html(combinedText);
            $html(el).replaceWith(`<blockquote>${newParagraph}</blockquote>`);
        }
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    $html('ol, ul').each((i, list) => {
        let $parent = ($html(list).parents('ul, ol').last().length) ? $html(list).parents('ul, ol').last() : $html(list);

        let hasStyle = ($html($parent).attr('style') || $html($parent).find('[style]').length) ? true : false;
        let hasType = ($html($parent).attr('type') || $html($parent).find('[type]').length) ? true : false;
        let hasValue = ($html($parent).attr('value') || $html($parent).find('[value]').length) ? true : false;
        let hasStart = ($html($parent).attr('start') || $html($parent).find('[start]').length) ? true : false;
        let hasOLList = ($html($parent).find('ol').length) ? true : false;
        let hasULList = ($html($parent).find('ul').length) ? true : false;

        if (hasStyle || hasType || hasValue || hasStart || hasOLList || hasULList) {
            // If parent is not wrapped ina  HTML card, wrap it in one
            if ($parent.get(0)?.prev?.data !== 'kg-card-begin: html') {
                $html($parent).before('<!--kg-card-begin: html-->');
                $html($parent).after('<!--kg-card-end: html-->');
            }
        }
    });

    // Handle button elements
    $html('.wp-block-buttons').each((i, el) => {
        let buttons = [];
        let isCentered = $html(el).hasClass('is-content-justification-center');
        let positionClass = (isCentered) ? 'kg-align-center' : 'kg-align-left';

        $html(el).find('.wp-block-button__link').each((ii, button) => {
            let buttonHref = $html(button).attr('href');
            let buttonText = $html(button).text();

            buttons.push(`<div class="kg-card kg-button-card ${positionClass}"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
        });

        $html(el).replaceWith(buttons.join(''));
    });

    // Replace spacers with horizontal rules
    $html('.wp-block-spacer').each((i, el) => {
        $html(el).replaceWith('<hr>');
    });

    // Handle YouTube embeds
    $html('.wp-block-embed.is-provider-youtube').each((i, el) => {
        const videoUrl = $html(el).find('iframe').attr('src') ?? $html(el).text();
        const videoID = getYouTubeID(videoUrl);
        const videoCaption = $html(el).find('figcaption')?.text()?.trim() ?? false;

        if (videoUrl && videoID && videoID.length) {
            $html(el).replaceWith(`<figure class="kg-card kg-embed-card"><iframe width="160" height="90"
            src="https://www.youtube.com/embed/${videoID}?feature=oembed" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowfullscreen=""></iframe>${videoCaption ? `<figcaption>${videoCaption}</figcaption>` : ''}</figure>`);
        }
    });

    // Handle list-based galleries
    $html('.wp-block-gallery').each((i, el) => {
        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                images: []
            }
        };

        $html(el).find('figure').each((iii, elll) => { // eslint-disable-line no-shadow
            let img = $html(elll).find('img');

            if (img && img.attr('src')) {
                cardOpts.payload.images.push({
                    row: 0,
                    fileName: basename(img.attr('src')),
                    src: img.attr('data-full') ?? img.attr('src'),
                    width: img.attr('width'),
                    height: img.attr('height')
                });
            }
        });

        const galleryHtml = serializer.serialize(galleryCard.render(cardOpts));

        $html(el).replaceWith(galleryHtml);
    });

    // Unwrap WP gallery blocks
    // Case: WP gallery blocks have figures in figures which trips up the HTML to mobiledoc conversion
    $html('.wp-block-gallery').each((i, el) => {
        $html(el).replaceWith($html(el).html());
    });

    // Wrap inline styled tags in HTML card
    $html('div[style], p[style], a[style], span[style]').each((i, styled) => {
        let imgChildren = $html(styled).children('img:not([data-gif])');

        if ($html(imgChildren).length === 0) {
            $html(styled).before('<!--kg-card-begin: html-->');
            $html(styled).after('<!--kg-card-end: html-->');
        }
    });

    // Remove links around images that link to the same file
    $html('a > img').each((l, img) => {
        // <img> src
        let $image = $html(img);
        let imageSrc = $html(img).attr('src');
        let largeSrc = largerSrc(imageSrc);

        // <a> href
        let $link = $html($image).parent('a');
        let linkHref = $html($link).attr('href');
        let largeHref = largerSrc(linkHref);

        if (largeSrc === largeHref) {
            $html($link).replaceWith($html($link).html());
        }
    });

    // Some header elements contain span children to use custom inline styling. Wrap 'em in HTML cards.
    $html('h1 > span[style], h2 > span[style], h3 > span[style], h4 > span[style], h5 > span[style], h6 > span[style]').each((i, styledSpan) => {
        let $heading = $html(styledSpan).parent('h1, h2, h3, h4, h5, h6');
        $heading.before('<!--kg-card-begin: html-->');
        $heading.after('<!--kg-card-end: html-->');
    });

    // Convert videos to HTML cards and report as errors
    $html('video').each((i, el) => {
        const isInFigure = el?.parent?.name === 'figure' || false;

        $html(el).css('width', '100%');

        if (isInFigure) {
            $html(el.parent).before('<!--kg-card-begin: html-->');
            $html(el.parent).after('<!--kg-card-end: html-->');
        } else {
            $html(el).before('<!--kg-card-begin: html-->');
            $html(el).after('<!--kg-card-end: html-->');
        }
    });

    $html('audio').each((i, el) => {
        const isInFigure = el?.parent?.name === 'figure' || false;

        $html(el).css('width', '100%');

        if (isInFigure) {
            $html(el.parent).before('<!--kg-card-begin: html-->');
            $html(el.parent).after('<!--kg-card-end: html-->');
        } else {
            $html(el).before('<!--kg-card-begin: html-->');
            $html(el).after('<!--kg-card-end: html-->');
        }
    });

    $html('img').each((i, img) => {
        let $image = $html(img);
        $html($image).removeAttr('srcset');
        $html($image).removeAttr('sizes');
        let imageSrc = $html($image).attr('src');
        let newSrc = largerSrc(imageSrc);
        $html($image).attr('src', newSrc);
    });

    // Detect full size images
    // TODO: add more classes that are used within WordPress to determine full-width images
    $html('img.full.size-full').each((i, img) => {
        // Ignore images, that are already wrapped in a figure tag or are linked
        if ($html(img).parent('figure').length <= 0 && $html(img).parent('a').length <= 0) {
            let $figure = $html('<figure class="kg-card kg-image-card kg-width-wide"></figure>');

            $html(img).addClass('kg-image');

            if ($html(img).attr('srcset')) {
                $html(img).removeAttr('width');
                $html(img).removeAttr('height');
                $html(img).removeAttr('srcset');
                $html(img).removeAttr('sizes');
            }

            $html(img).wrap($figure);
        }
    });

    $html('img').each((i, img) => {
        const oldBase = /https?:\/\/deceleration.news\/wp-content\//;
        const newBase = 'https://d3l0i86vhnepo5.cloudfront.net/wp-content/';
        const currentSrc = $html(img).attr('src');

        if (!currentSrc) {
            return;
        }

        const updatedSrc = currentSrc.replace(oldBase, newBase);
        $html(img).attr('src', updatedSrc);
    });

    // convert HTML back to a string
    html = $html.html();

    // Remove empty attributes
    html = html.replace(/=""/g, '');

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
    let titleText = cheerio.load(wpPost.title.rendered).text();

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
            author: users ? users.find((user) => {
                // Try to use the user data returned from the API
                return user.data.id === wpPost.author;
            }) : null,
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

    // We no author was defined…
    if (!post.data.author) {
        // … but a global author is defined, use that
        if (wpPost._embedded && wpPost._embedded.author) {
            // use the data passed along the post if we couldn't match the user from the API
            const wpAuthor = wpPost._embedded.author[0];
            post.data.author = processAuthor(wpAuthor);
        // … else, use the first user in the `users` object
        } else {
            post.data.author = processAuthor(users[0].data);
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
    processExcerpt,
    processShortcodes,
    processContent,
    processPost,
    processPosts,
    processAuthors,
    all
};
