const fs = require('fs-extra');
const _ = require('lodash');
const $ = require('cheerio');
const url = require('url');
const errors = require('@tryghost/errors');
const MgWebScraper = require('@tryghost/mg-webscraper');

const VideoError = ({src, postUrl}) => {
    let error = new errors.UnsupportedMediaTypeError({message: `Unsupported video ${src} in post ${postUrl}`});

    error.errorType = 'VideoError';
    error.src = src;
    error.url = postUrl;

    return error;
};

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
};

module.exports.processAuthor = (wpAuthor) => {
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

module.exports.processTerm = (wpTerm) => {
    return {
        url: wpTerm.link,
        data: {
            slug: wpTerm.slug,
            name: wpTerm.name
        }
    };
};

module.exports.processTerms = (wpTerms, fetchTags) => {
    let categories = [];
    let tags = [];

    wpTerms.forEach((taxonomy) => {
        taxonomy.forEach((term) => {
            if (term.taxonomy === 'category') {
                categories.push(this.processTerm(term));
            }

            if (fetchTags && term.taxonomy === 'post_tag') {
                tags.push(this.processTerm(term));
            }
        });
    });

    return categories.concat(tags);
};

// Sometimes, the custom excerpt can be part of the post content. If the flag with an selector for the
// custom excerpt class is passed, we use this one to populate the custom excerpt and remove it from the post content
module.exports.processExcerpt = (html, excerptSelector) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // TODO: this should be possible by using a pseudo selector as a passed `excerptSelector`, e. g. `h2.excerpt:first-of-type`,
    // which is officially supported by the underlying css-select library, but not working.
    if ($html(excerptSelector).length > 0) {
        return $html(excerptSelector).first().text();
    } else {
        return null;
    }
};

module.exports.processContent = async (html, postUrl, excerptSelector, errors, featureImageSrc = false, fileCache = false, options) => { // eslint-disable-line no-shadow
    let webScraper = new MgWebScraper(fileCache);

    const allowRemoteScraping = ['all', 'web'].indexOf(options.scrape) > -1;

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

    // Bookmark embeds
    let bookmarks = $html('.wp-block-embed.is-type-wp-embed').map(async (i, el) => {
        let href = $(el).find('blockquote a').attr('href');
        let iframeSrc = $(el).find('iframe').attr('src');

        let scrapeConfig = {
            pageTitle: '.wp-embed-heading a',
            siteTitle: '.wp-embed-site-title a span',
            siteIcon: {
                selector: '.wp-embed-site-title a img',
                attr: 'src'
            },
            image: {
                selector: '.wp-embed-featured-image a img',
                attr: 'src'
            },
            content: {
                selector: '.wp-embed-excerpt p',
                how: 'html',
                convert: (theData) => {
                    const $bookmarkContent = $.load(theData);
                    $bookmarkContent('a').each((i, a) => { // eslint-disable-line no-shadow
                        $(a).remove();
                    });

                    return $bookmarkContent.html();
                }
            }
        };

        // Scrape `iframe` data, and cache it locally
        let filename = iframeSrc.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        let {responseData} = await webScraper.scrapeUrl(iframeSrc, scrapeConfig, filename);

        $(el).replaceWith(`
            <!--kg-card-begin: html-->
            <figure class="kg-card kg-bookmark-card">
                <a class="kg-bookmark-container" href="${href}">
                    <div class="kg-bookmark-content">
                        <div class="kg-bookmark-title">${responseData.pageTitle}</div>
                        <div class="kg-bookmark-description">${responseData.content}</div>
                        <div class="kg-bookmark-metadata">
                            <img class="kg-bookmark-icon" src="${responseData.siteIcon}">
                            <span class="kg-bookmark-author">${responseData.siteTitle}</span>
                        </div>
                    </div>
                    <div class="kg-bookmark-thumbnail">
                        <img src="${responseData.image}" alt="">
                    </div>
                </a>
            </figure>
            <!--kg-card-end: html-->
        `);
    }).get();

    await Promise.all(libsynPodcasts, bookmarks);

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
    $html('ul li ul, ol li ol, ol li ul, ul li ol').each((i, nestedList) => {
        let $parent = $(nestedList).parentsUntil('ul, ol').parent();
        $parent.before('<!--kg-card-begin: html-->');
        $parent.after('<!--kg-card-end: html-->');
    });

    // Wrap lists with offsets in HTML card so the offset doesn't get lost on conversion
    $html('ol[start]').each((i, ol) => {
        $(ol).before('<!--kg-card-begin: html-->');
        $(ol).after('<!--kg-card-end: html-->');
    });

    // Wrap inline styled tags in HTML card
    $html('div[style], p[style], a[style], span[style]').each((i, styled) => {
        let imgChildren = $(styled).children('img:not([data-gif])');

        // If this is a simple element with a single image using src, we aren't going to do anything special
        if ($(imgChildren).length === 1 && $(imgChildren.get(0)).attr('src')) {
            styled.tagName = 'figure';
            let img = $(imgChildren.get(0));
            let caption = $(styled).find('.wp-caption-text').get(0);

            // This is a full width image
            if (img.hasClass('full')) {
                $(styled).addClass('kg-width-wide');
            }

            if (caption) {
                $(styled).addClass('kg-card-hascaption');
                caption.tagName = 'figcaption';
            }
        } else {
            // To prevent visual issues, we need to delete `srcset` (we don't scrape those images anyway),
            // `sizes`, and dimensions (for `srcset` images).
            if ($(imgChildren).length > 0) {
                $(imgChildren).each((k, img) => {
                    if ($(img).attr('srcset')) {
                        $(img).removeAttr('width');
                        $(img).removeAttr('height');
                        $(img).removeAttr('srcset');
                        $(img).removeAttr('sizes');
                    }
                });
            }

            // Ignore the styles, when only the font-weight is set to 400
            if ($(styled).attr('style') !== 'font-weight: 400;') {
                $(styled).before('<!--kg-card-begin: html-->');
                $(styled).after('<!--kg-card-end: html-->');
            }
        }
    });

    // Linked images
    // It's not possible to convert the image to a full kg-image incl. wrapping it in a `figure` tag,
    // as the mobiledoc parser won't leave the figure within the anchor tag, even when it's wrapped in
    // an HTML card. Add relevant classes (kg-card, kg-width-wide) to the wrapping anchor tag instead.
    // TODO: this should be possible within the Mobiledoc parser
    $html('a > img').each((l, linkedImg) => {
        let anchor = $(linkedImg).parent('a').get(0);

        if ($(anchor).attr('href').indexOf($(linkedImg).attr('src') < 0)) {
            $(linkedImg).addClass('kg-image');
            $(anchor).addClass('kg-card kg-image-card');

            if ($(linkedImg).attr('srcset')) {
                $(linkedImg).removeAttr('width');
                $(linkedImg).removeAttr('height');
                $(linkedImg).removeAttr('srcset');
                $(linkedImg).removeAttr('sizes');
            }

            // This is a full width image
            if ($(linkedImg).hasClass('full')) {
                $(anchor).addClass('kg-width-wide');
            }

            // add display block, so the margin bottom from `kg-card` takes effect on the anchor tag
            $(anchor).css({display: 'block'});
            $(anchor).before('<!--kg-card-begin: html-->');
            $(anchor).after('<!--kg-card-end: html-->');
        }
    });

    // Some header elements contain span children to use custom inline styling. Wrap 'em in HTML cards.
    $html('h1 > span[style], h2 > span[style], h3 > span[style], h4 > span[style], h5 > span[style], h6 > span[style]').each((i, styledSpan) => {
        let $heading = $(styledSpan).parent('h1, h2, h3, h4, h5, h6');
        $heading.before('<!--kg-card-begin: html-->');
        $heading.after('<!--kg-card-end: html-->');
    });

    // Convert videos to HTML cards and report as errors
    // TODO make this a parser plugin
    $html('video').each((i, el) => {
        $(el).before('<!--kg-card-begin: html-->');
        $(el).after('<!--kg-card-end: html-->');

        let src = $(el).attr('src') || $(el).find('source').attr('src');

        errors.push(VideoError({src, postUrl}));
    });

    // (Some) WordPress renders gifs a different way. They use an `img` tag with a `src` for a still image,
    // and a `data-gif` attribute to reference the actual gif. We need `src` to be the actual gif.
    $html('img[data-gif]').each((i, gif) => {
        let gifSrc = $(gif).attr('data-gif');
        $(gif).attr('src', gifSrc);
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
module.exports.processPost = async (wpPost, users, options, errors, fileCache) => { // eslint-disable-line no-shadow
    let {tags: fetchTags, addTag, excerptSelector} = options;
    let slug = wpPost.slug;

    // @note: we don't copy excerpts because WP generated excerpts aren't better than Ghost ones but are often too long.
    const post = {
        url: wpPost.link,
        data: {
            slug: slug,
            title: wpPost.title.rendered,
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

    if (options.featureImage === 'featuredmedia' && wpPost.featured_media && wpPost._embedded['wp:featuredmedia']) {
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
            post.data.author = this.processAuthor(wpAuthor);
        // … else, use the first user in the `users` object
        } else {
            post.data.author = this.processAuthor(users[0].data);
        }
    }

    if (wpPost._embedded && wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = this.processTerms(wpTerms, fetchTags);

        post.data.tags.push({
            url: 'migrator-added-tag', data: {slug: 'hash-wp', name: '#wp'}
        });

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag-2', data: {slug: addTag, name: addTag}
            });
        }
    }

    if (options.cpt) {
        if (!['post', 'page'].includes(wpPost.type)) {
            post.data.tags.push({
                url: 'migrator-added-tag-cpt', data: {slug: `hash-${wpPost.type}`, name: `#${wpPost.type}`}
            });
        } else if (wpPost.type === 'post') {
            post.data.tags.push({
                url: 'migrator-added-tag-post', data: {slug: `hash-wp-post`, name: `#wp-post`}
            });
        }
    }

    if (excerptSelector) {
        post.data.custom_excerpt = this.processExcerpt(post.data.html, excerptSelector);
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = await this.processContent(post.data.html, post.url, excerptSelector, errors, post.data.feature_image, fileCache, options);

    return post;
};

module.exports.processPosts = async (posts, users, options, errors, fileCache) => { // eslint-disable-line no-shadow
    return Promise.all(posts.map(post => this.processPost(post, users, options, errors, fileCache)));
};

module.exports.processAuthors = (authors) => {
    return authors.map(author => this.processAuthor(author));
};

module.exports.all = async (ctx) => {
    let {result: input, usersJSON, options, errors, fileCache} = ctx; // eslint-disable-line no-shadow

    if (usersJSON) {
        const mergedUsers = [];
        try {
            let passedUsers = await fs.readJSON(usersJSON);
            console.log(`Passed a users file with ${passedUsers.length} entries, processing now!`); // eslint-disable-line no-console
            await passedUsers.map((passedUser) => {
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
        users: this.processAuthors(input.users)
    };

    output.posts = await this.processPosts(input.posts, output.users, options, errors, fileCache);

    return output;
};
