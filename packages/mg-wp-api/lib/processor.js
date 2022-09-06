const _ = require('lodash');
const $ = require('cheerio');
const url = require('url');
const path = require('path');
const MgWebScraper = require('@tryghost/mg-webscraper');
const {slugify} = require('@tryghost/string');
const Muteferrika = require('muteferrika');
const SimpleDom = require('simple-dom');
const fileCard = require('@tryghost/kg-default-cards/lib/cards/file');

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
};

const largerSrc = (imageSrc) => {
    if (!imageSrc || imageSrc.length <= 1) {
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
            name: _.unescape(wpTerm.name)
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

// Some WordPress sites use shortcodes. This is where to handle them.
module.exports.processShortcodes = async ({html}) => {
    const shortcodes = new Muteferrika();

    /**
     * An example. Say you have `[button url="https://ghost.org"]Ghost[/button]`
     * The code below turns it into a button card.
     */
    // shortcodes.add('button', async (attrs, content) => {
    //     return `<div class="kg-card kg-button-card kg-align-center"><a href="${attrs.url}" class="kg-btn kg-btn-accent">${content}</a></div>`;
    // });

    // Match [caption]<a href="https://example.com/newsletter"><img src="https://example.com/my/image.jpg" /></a>[/caption]
    // Match [caption]<img src="https://example.com/my/image.jpg" />[/caption]
    shortcodes.add('caption', async (attrs, content) => {
        let matches = content.match(/(?<openlink><a.*>)? ?(?<image><img [^>]*src=\\?"[^"]*\\?"[^>]*>) ?(?<closelink><\/a.*>)? ?(?<text>.*)/m);

        let newString = [];
        let classes = ['kg-card', 'kg-image-card'];

        if (matches.groups.openlink) {
            newString.push(matches.groups.openlink);
        }

        if (matches.groups.image) {
            newString.push(matches.groups.image);
        }

        if (matches.groups.closelink) {
            newString.push(matches.groups.closelink);
        }

        if (matches.groups.text) {
            newString.push(`<figcaption>${matches.groups.text.trim()}</figcaption>`);
            classes.push('kg-card-hascaption');
        }

        return `<figure class="${classes.join(' ')}">${newString.join('')}</figure>`;
    });

    /**
     * Another example. Say the WP site uses shortcodes for layout, such as `[row][column]Keep this bit[/column][/row]`
     * We don't want to change them as such, but only retain what's inside. TThe below results in `Keep this bit`
     */
    // let toRemove = [
    //     {
    //         name: 'row',
    //         callback: (attrs, content) => {
    //             return content;
    //         }
    //     },
    //     {
    //         name: 'column',
    //         callback: (attrs, content) => {
    //             return content;
    //         }
    //     }
    // ];
    // shortcodes.addRange(toRemove);

    const output = await shortcodes.render(html);

    return output;
};

module.exports.processContent = async ({html, excerptSelector, featureImageSrc = false, fileCache = false, options}) => { // eslint-disable-line no-shadow
    let webScraper = new MgWebScraper(fileCache);

    let allowRemoteScraping = false;
    if (options?.scrape?.includes('all') || options?.scrape?.includes('media')) {
        allowRemoteScraping = true;
    }

    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    html = await this.processShortcodes({html});

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

    $html('[style="font-weight: 400"]').each((i, el) => {
        $(el).removeAttr('style');
    });

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

    await Promise.all(libsynPodcasts);

    // TODO: Need to handle playlist URLs like https://youtube.com/playlist?list=ABCDEFHG12345678B0Og6F_yAXM6jAO-rq
    $html('figure.wp-block-embed-youtube').each((i, el) => {
        const text = $(el).text();
        const videoMatch = text.match(/(?:youtu\.be\/|youtube\.com(?:\/embed\/|\/v\/|\/watch\?v=|\/user\/\S+|\/ytscreeningroom\?v=))([\w\-]{10,12})\b/); // eslint-disable-line no-useless-escape

        if (videoMatch && videoMatch[1]) {
            const linkToUse = `https://www.youtube.com/embed/${videoMatch[1]}?feature=oembed`;

            $(el).replaceWith(`<figure class="kg-card kg-embed-card"><iframe width="480" height="270" src="${linkToUse}" frameborder="0" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></figure>`);
        }
    });

    $html('figure.wp-block-embed-twitter').each((i, el) => {
        const link = $(el).text();

        $(el).replaceWith(`<blockquote class="twitter-tweet"><a href="${link}"></a></blockquote>`);
    });

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

    $html('figure.wp-block-embed-instagram').each((i, el) => {
        const link = $(el).text();

        $(el).replaceWith(`<blockquote class="instagram-media"><a href="${link}"></a></blockquote>`);
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

    $html('.wp-block-file').each((i, el) => {
        let fileUrl = $(el).find('a').eq(0).attr('href');
        let fileName = path.basename(fileUrl);
        let fileTitle = $(el).find('a').eq(0).text();

        let cardOpts = {
            env: {dom: new SimpleDom.Document()},
            payload: {
                fileName: fileName,
                fileTitle: fileTitle,
                src: fileUrl,
                fileSize: 0
            }
        };

        const buildCard = fileCard.render(cardOpts);
        const cardHTML = buildCard.nodeValue;

        $(el).replaceWith(cardHTML);
    });

    // TODO: this should be a parser plugin
    // Wrap nested lists in HTML card
    $html('ul li ul, ol li ol, ol li ul, ul li ol, ul [style], ol [style]').each((i, nestedList) => {
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

    // Remove links around images that link to the same file
    $html('a > img').each((l, img) => {
        let $image = $(img);
        let imageSrc = $(img).attr('src');
        let newSrc = largerSrc(imageSrc);
        let $link = $($image).parent('a');
        let linkHref = $($link).attr('href');
        let newLinkHref = largerSrc(linkHref);

        if (newSrc === newLinkHref) {
            $($link).replaceWith($($link).html());
        }
    });

    // Linked images
    // It's not possible to convert the image to a full kg-image incl. wrapping it in a `figure` tag,
    // as the mobiledoc parser won't leave the figure within the anchor tag, even when it's wrapped in
    // an HTML card. Add relevant classes (kg-card, kg-width-wide) to the wrapping anchor tag instead.
    // TODO: this should be possible within the Mobiledoc parser
    $html('a > img').each((l, linkedImg) => {
        let anchor = $(linkedImg).parent('a').get(0);
        let parentFigure = $(anchor).parent('figure');

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

            if (parentFigure.length) {
                $(parentFigure).before('<!--kg-card-begin: html-->');
                $(parentFigure).after('<!--kg-card-end: html-->');
            } else {
                $(anchor).before('<!--kg-card-begin: html-->');
                $(anchor).after('<!--kg-card-end: html-->');
            }
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

    // (Some) WordPress renders gifs a different way. They use an `img` tag with a `src` for a still image,
    // and a `data-gif` attribute to reference the actual gif. We need `src` to be the actual gif.
    $html('img[data-gif]').each((i, gif) => {
        let gifSrc = $(gif).attr('data-gif');
        $(gif).attr('src', gifSrc);
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

    // Remove empty <p> tags
    $html('p').each((i, p) => {
        let content = $(p).html().trim();

        if (content.length === 0) {
            $(p).remove();
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
module.exports.processPost = async (wpPost, users, options = {}, errors, fileCache) => { // eslint-disable-line no-shadow
    let {tags: fetchTags, addTag, excerptSelector} = options;

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
            post.data.author = this.processAuthor(wpAuthor);
        // … else, use the first user in the `users` object
        } else {
            post.data.author = this.processAuthor(users[0].data);
        }
    }

    if (wpPost._embedded && wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = this.processTerms(wpTerms, fetchTags);
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

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-wp',
            name: '#wp'
        }
    });

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

    if (excerptSelector) {
        post.data.custom_excerpt = this.processExcerpt(post.data.html, excerptSelector);
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    // post.data.html = await this.processContent(post.data.html, post.url, excerptSelector, errors, post.data.feature_image, fileCache, options);
    post.data.html = await this.processContent({
        html: post.data.html,
        excerptSelector: excerptSelector,
        featureImageSrc: post.data.feature_image,
        fileCache: fileCache,
        options: options
    });

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
        users: this.processAuthors(input.users)
    };

    output.posts = await this.processPosts(input.posts, output.users, options, errors, fileCache);

    return output;
};
