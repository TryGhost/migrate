import url from 'node:url';
import _ from 'lodash';
import $ from 'cheerio';
import MgWebScraper from '@tryghost/mg-webscraper';
import Shortcodes from '@tryghost/mg-shortcodes';
import {slugify} from '@tryghost/string';
import {htmlToText} from 'html-to-text';
import {formatISO, parseISO, isBefore, isAfter, add} from 'date-fns';

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
};

const largerSrc = (imageSrc) => {
    if (!imageSrc) {
        return imageSrc;
    }

    let newSrc = imageSrc;

    const fileSizeRegExp = new RegExp('-([0-9]+x[0-9]+).([a-zA-Z]{2,4})$');
    const fileSizeMatches = imageSrc.match(fileSizeRegExp);

    if (fileSizeMatches) {
        newSrc = imageSrc.replace(fileSizeRegExp, '.$2');
    }

    return newSrc;
};

const processAuthor = (wpAuthor) => {
    let profileImage = wpAuthor.avatar_urls && wpAuthor.avatar_urls['96'];
    profileImage = profileImage ? profileImage.replace(/s=96/, 's=3000') : undefined;

    return {
        url: wpAuthor.link,
        data: {
            id: wpAuthor.id && wpAuthor.id,
            slug: wpAuthor.slug,
            name: wpAuthor.name,
            bio: wpAuthor.description,
            profile_image: profileImage,
            email: wpAuthor.email && wpAuthor.email,
            website: wpAuthor.url && wpAuthor.url
        }
    };
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

    let excerptText;

    // Set the text to convert to either be the supplied string or found text in the supplied HTML chunk
    if (excerptSelector) {
        // TODO: this should be possible by using a pseudo selector as a passed `excerptSelector`, e. g. `h2.excerpt:first-of-type`,
        const $html = $.load(html, {
            decodeEntities: false
        });

        excerptText = $html(excerptSelector).first().html();
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

const processShortcodes = async ({html}) => {
    const shortcodes = new Shortcodes();

    shortcodes.add('vc_btn', ({attrs}) => {
        let buttonHref = attrs.link;

        // Sometimes URLs have a `url:` prefix which we don't want
        if (buttonHref.startsWith('url:')) {
            buttonHref = buttonHref.slice(4);
        }

        buttonHref = decodeURIComponent(buttonHref);

        return `<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="${buttonHref}">${attrs.title}</a></div></div>`;
    });

    shortcodes.add('caption', ({content}) => {
        const $html = $.load(content, {
            decodeEntities: false
        });

        let theImage = $html('img');
        let theCaption = $html.text().trim();

        let $figure = $('<figure class="wp-block-image"></figure>');

        $figure.append(theImage);

        if (theCaption && theCaption.length) {
            $figure.append(`<figcaption>${theCaption.trim()}</figcaption>`);
        }

        return $.html($figure);
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

    shortcodes.add('sourcecode', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    shortcodes.add('code', ({attrs, content}) => {
        let captionString = (attrs?.title) ? `<figcaption>${attrs.title}</figcaption>` : '';
        let classString = (attrs?.language) ? `language-${attrs.language}` : '';
        let theContent = content.trim();
        return `<figure><pre class="${classString}"><code>${theContent}</code></pre>${captionString}</figure>`;
    });

    // We don't want to change these, but only retain what's inside.
    shortcodes.unwrap('row');
    shortcodes.unwrap('column');
    shortcodes.unwrap('vc_row');
    shortcodes.unwrap('vc_column');
    shortcodes.unwrap('vc_column_text');
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

    let allowRemoteScraping = false;
    if (options?.scrape?.includes('all') || options.scrape?.includes('media')) {
        allowRemoteScraping = true;
    }

    html = await processShortcodes({html});

    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // If the first element in the content is an image, and is the same as the feature image, remove it
    if (featureImageSrc) {
        let firstElement = $html('*').first();

        if (firstElement.tagName === 'img' || $(firstElement).find('img').length) {
            let theElementItself = (firstElement.tagName === 'img') ? firstElement : $(firstElement).find('img');

            // Ensure the feature image and first image both are HTTPS with no size attributes
            let imgSrcNoSize = $(theElementItself).attr('src').replace('http://', 'https://').replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
            let featureImageSrcNoSize = featureImageSrc.replace('http://', 'https://').replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');

            if (featureImageSrcNoSize === imgSrcNoSize) {
                $(firstElement).remove();
            }
        }
    }

    if (options.removeSelectors) {
        $html(options.removeSelectors).each((i, el) => {
            $(el).remove();
        });
    }

    // Handle twitter embeds
    $html('p > script[src="https://platform.twitter.com/widgets.js"]').remove();

    $html('#toc_container').each((i, toc) => {
        $(toc).remove();
    });

    if (excerptSelector) {
        $html(excerptSelector).first().each((i, excerpt) => {
            $(excerpt).remove();
        });
    }

    // Basic text cleanup
    // @TODO: Expand on this
    $html('[style="font-weight: 400;"], [style="font-weight:400;"], [style="font-weight: 400"], [style="font-weight:400"]').each((i, el) => {
        $(el).removeAttr('style');
    });

    // Normalize image elements
    $html('.wp-block-jetpack-tiled-gallery').each((i, gal) => {
        $(gal).replaceWith($(gal).html());
    });

    $html('.tiled-gallery__gallery').each((i, gal) => {
        $(gal).replaceWith($(gal).html());
    });

    $html('.tiled-gallery__row').each((i, gal) => {
        $(gal).replaceWith($(gal).html());
    });

    $html('.tiled-gallery__col').each((i, gal) => {
        $(gal).replaceWith($(gal).html());
    });

    $html('.tiled-gallery__item').each((i, gal) => {
        $(gal).removeAttr('class');
    });

    // Remove duplicates images in <noscript> tags that have the same src
    $html('img + noscript img').each((i, el) => {
        let noScriptImgSrc = $(el).attr('src');
        let prevImg = $(el).parent('noscript').prev('img');
        let prevImgSrc = prevImg.attr('data-src') || prevImg.attr('src');

        if (noScriptImgSrc === prevImgSrc) {
            $(el).parent('noscript').remove();
        }
    });

    $html('img').each((i, img) => {
        $(img).removeAttr('decoding');
        $(img).removeAttr('data-id');
        $(img).removeAttr('data-link');
        $(img).removeAttr('data-url');
        $(img).removeAttr('data-amp-layout');

        if ($(img).attr('data-width')) {
            $(img).attr('width', $(img).attr('data-width'));
            $(img).removeAttr('data-width');
        }

        if ($(img).attr('data-height')) {
            $(img).attr('height', $(img).attr('data-height'));
            $(img).removeAttr('data-height');
        }
    });

    // (Some) WordPress renders gifs a different way. They use an `img` tag with a `src` for a still image,
    // and a `data-gif` attribute to reference the actual gif. We need `src` to be the actual gif.
    $html('img[data-gif]').each((i, gif) => {
        let gifSrc = $(gif).attr('data-gif');
        $(gif).removeAttr('data-gif');
        $(gif).attr('src', gifSrc);
    });

    // Likewise some images are lazy-loaded using JavaScript & `data-src` attributes
    $html('img[data-src]').each((i, img) => {
        let dataSrc = $(img).attr('data-src');
        $(img).removeAttr('data-src');
        $(img).attr('src', dataSrc);
    });

    let libsynPodcasts = $html('iframe[src*="libsyn.com/embed/"]').map(async (i, el) => {
        if (!allowRemoteScraping) {
            return;
        }

        let iframeSrc = $(el).attr('src');
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

        $(el).replaceWith(audioHTML);
    }).get();

    await Promise.all(libsynPodcasts);

    $html('blockquote.twitter-tweet').each((i, el) => {
        let $figure = $('<figure class="kg-card kg-embed-card"></figure>');
        let $script = $('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $(el).wrap($figure);
        $figure.append($script);
        $figure.before('<!--kg-card-begin: embed-->');
        $figure.after('<!--kg-card-end: embed-->');
    });

    $html('blockquote.twitter-video').each((i, el) => {
        let $figure = $('<figure class="kg-card kg-embed-card"></figure>');
        let $script = $('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $(el).wrap($figure);
        $figure.append($script);
        $figure.before('<!--kg-card-begin: embed-->');
        $figure.after('<!--kg-card-end: embed-->');
    });

    // Handle instagram embeds
    $html('script[src="//platform.instagram.com/en_US/embeds.js"]').remove();
    $html('#fb-root').each((i, el) => {
        if ($(el).prev().get(0) && $(el).prev().get(0).name === 'script') {
            $(el).prev().remove();
        }
        if ($(el).next().get(0) && $(el).next().get(0).name === 'script') {
            $(el).next().remove();
        }

        $(el).remove();
    });

    $html('blockquote.instagram-media').each((i, el) => {
        let src = $(el).find('a').attr('href');
        let parsed = url.parse(src);

        if (parsed.search) {
            // remove possible query params
            parsed.search = null;
        }
        src = url.format(parsed, {search: false});

        let $iframe = $('<iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;"></iframe>');
        let $script = $('<script async="" src="//www.instagram.com/embed.js"></script>');
        let $figure = $('<figure class="instagram"></figure>');

        $iframe.attr('src', `${src}embed/captioned/`);
        $figure.append($iframe);
        $figure.append($script);

        $(el).replaceWith($figure);
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    $html('ol, ul').each((i, list) => {
        let $parent = ($(list).parents('ul, ol').last().length) ? $(list).parents('ul, ol').last() : $(list);

        let hasStyle = ($($parent).attr('style') || $($parent).find('[style]').length) ? true : false;
        let hasType = ($($parent).attr('type') || $($parent).find('[type]').length) ? true : false;
        let hasValue = ($($parent).attr('value') || $($parent).find('[value]').length) ? true : false;
        let hasStart = ($($parent).attr('start') || $($parent).find('[start]').length) ? true : false;
        let hasOLList = ($($parent).find('ol').length) ? true : false;
        let hasULList = ($($parent).find('ul').length) ? true : false;

        if (hasStyle || hasType || hasValue || hasStart || hasOLList || hasULList) {
            // If parent is not wrapped ina  HTML card, wrap it in one
            if ($parent.get(0)?.prev?.data !== 'kg-card-begin: html') {
                $($parent).before('<!--kg-card-begin: html-->');
                $($parent).after('<!--kg-card-end: html-->');
            }
        }
    });

    // Handle button elements
    $html('.wp-block-buttons').each((i, el) => {
        let buttons = [];
        let isCentered = $(el).hasClass('is-content-justification-center');
        let positionClass = (isCentered) ? 'kg-align-center' : 'kg-align-left';

        $(el).find('.wp-block-button__link').each((ii, button) => {
            let buttonHref = $(button).attr('href');
            let buttonText = $(button).text();

            buttons.push(`<div class="kg-card kg-button-card ${positionClass}"><a href="${buttonHref}" class="kg-btn kg-btn-accent">${buttonText}</a></div>`);
        });

        $(el).replaceWith(buttons.join(''));
    });

    // Replace spacers with horizontal rules
    $html('.wp-block-spacer').each((i, el) => {
        $(el).replaceWith('<hr>');
    });

    // Unwrap WP gallery blocks
    // Case: WP gallery blocks have figures in figures which trips up the HTML to mobiledoc conversion
    $html('.wp-block-gallery').each((i, el) => {
        $(el).replaceWith($(el).html());
    });

    // Wrap inline styled tags in HTML card
    $html('div[style], p[style], a[style], span[style]').each((i, styled) => {
        let imgChildren = $(styled).children('img:not([data-gif])');

        if ($(imgChildren).length === 0) {
            $(styled).before('<!--kg-card-begin: html-->');
            $(styled).after('<!--kg-card-end: html-->');
        }
    });

    // Remove links around images that link to the same file
    $html('a > img').each((l, img) => {
        // <img> src
        let $image = $(img);
        let imageSrc = $(img).attr('src');
        let largeSrc = largerSrc(imageSrc);

        // <a> href
        let $link = $($image).parent('a');
        let linkHref = $($link).attr('href');
        let largeHref = largerSrc(linkHref);

        if (largeSrc === largeHref) {
            $($link).replaceWith($($link).html());
        }
    });

    // Some header elements contain span children to use custom inline styling. Wrap 'em in HTML cards.
    $html('h1 > span[style], h2 > span[style], h3 > span[style], h4 > span[style], h5 > span[style], h6 > span[style]').each((i, styledSpan) => {
        let $heading = $(styledSpan).parent('h1, h2, h3, h4, h5, h6');
        $heading.before('<!--kg-card-begin: html-->');
        $heading.after('<!--kg-card-end: html-->');
    });

    // Convert videos to HTML cards and report as errors
    $html('video').each((i, el) => {
        const isInFigure = el?.parent?.name === 'figure' || false;

        $(el).css('width', '100%');

        if (isInFigure) {
            $(el.parent).before('<!--kg-card-begin: html-->');
            $(el.parent).after('<!--kg-card-end: html-->');
        } else {
            $(el).before('<!--kg-card-begin: html-->');
            $(el).after('<!--kg-card-end: html-->');
        }
    });

    $html('audio').each((i, el) => {
        const isInFigure = el?.parent?.name === 'figure' || false;

        $(el).css('width', '100%');

        if (isInFigure) {
            $(el.parent).before('<!--kg-card-begin: html-->');
            $(el.parent).after('<!--kg-card-end: html-->');
        } else {
            $(el).before('<!--kg-card-begin: html-->');
            $(el).after('<!--kg-card-end: html-->');
        }
    });

    $html('img').each((i, img) => {
        let $image = $(img);
        $($image).removeAttr('srcset');
        $($image).removeAttr('sizes');
        let imageSrc = $($image).attr('src');
        let newSrc = largerSrc(imageSrc);
        $($image).attr('src', newSrc);
    });

    // Detect full size images
    // TODO: add more classes that are used within WordPress to determine full-width images
    $html('img.full.size-full').each((i, img) => {
        // Ignore images, that are already wrapped in a figure tag or are linked
        if ($(img).parent('figure').length <= 0 && $(img).parent('a').length <= 0) {
            let $figure = $('<figure class="kg-card kg-image-card kg-width-wide"></figure>');

            $(img).addClass('kg-image');

            if ($(img).attr('srcset')) {
                $(img).removeAttr('width');
                $(img).removeAttr('height');
                $(img).removeAttr('srcset');
                $(img).removeAttr('sizes');
            }

            $(img).wrap($figure);
        }
    });

    // convert HTML back to a string
    html = $html.html();

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
    let {tags: fetchTags, addTag, excerptSelector, excerpt} = options;

    let slug = wpPost.slug;
    let titleText = $.load(wpPost.title.rendered).text();

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
            post.data.feature_image = wpImage.source_url;
            post.data.feature_image_alt = wpImage.alt_text || null;
            post.data.feature_image_caption = (wpImage.caption) ? stripHtml(wpImage.caption.rendered) : null;
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
    if (options.postsBefore && options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });

        posts = posts.filter((post) => {
            if (isAfter(parseISO(post.date_gmt), startDate) && isBefore(parseISO(post.date_gmt), endDate)) {
                return post;
            } else {
                return false;
            }
        });
    } else if (options.postsAfter) {
        const startDate = parseISO(formatISO(new Date(options.postsAfter)));

        posts = posts.filter((post) => {
            if (isAfter(parseISO(post.date_gmt), startDate)) {
                return post;
            } else {
                return false;
            }
        });
    } else if (options.postsBefore) {
        const endDate = add(parseISO(formatISO(new Date(options.postsBefore))), {
            days: 1
        });

        posts = posts.filter((post) => {
            if (isBefore(parseISO(post.date_gmt), endDate)) {
                return post;
            } else {
                return false;
            }
        });
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
