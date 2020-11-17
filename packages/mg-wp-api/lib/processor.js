const fs = require('fs-extra');
const _ = require('lodash');
const $ = require('cheerio');
const url = require('url');

const VideoError = ({src, postUrl}) => {
    let error = new Error(`Unsupported video ${src} in post ${postUrl}`);

    error.errorType = 'VideoError';
    error.src = src;
    error.url = postUrl;

    return error;
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

module.exports.processContent = (html, postUrl, excerptSelector, errors) => {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

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
    // Handle blockquotes with multiple p tags as children and
    // 1. remove the p tags
    // 2. separate them with line breaks
    // This way, mobiledoc treats multiple p tag children correctly as one blockquote
    // instead of creating a blockquote for each one.
    $html('blockquote > p + p').each((i, el) => {
        let $blockquote = $(el).parents('blockquote');

        if ($blockquote.children('p').length > 0) {
            let newBlockquoteContent = '';
            $blockquote.children('p').each((j, p) => {
                if (j < $blockquote.children('p').length - 1) {
                    newBlockquoteContent += `${$(p).html()}</br></br>`;
                } else {
                    newBlockquoteContent += $(p).html();
                }
            });
            $blockquote.html(newBlockquoteContent);
        }
    });

    // TODO: this should be a parser plugin
    $html('table').each((i, table) => {
        if ($(table).parents('table').length < 1) {
            // don't wrap a nested table again
            $(table).before('<!--kg-card-begin: html-->');
            $(table).after('<!--kg-card-end: html-->');
        }
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

    /* TVS specific parser
    ****************************************************/

    // Custom sections w/ round avatar images
    $html('div.blog-highlight-section,div.blog-bio-info').each((i, el) => {
        $(el).before('<!--kg-card-begin: html-->');
        $(el).after('<!--kg-card-end: html-->');
    });

    // The first h2.excerpt is converted into our post custom excerpt. The other ones
    // need to be wrapped in an HTML card, so the styles are migrated over
    if (excerptSelector) {
        $html(excerptSelector).each((i, excerpt) => {
            $(excerpt).before('<!--kg-card-begin: html-->');
            $(excerpt).after('<!--kg-card-end: html-->');
        });
    }

    // Some blockquotes have the quoted person underneath, wrapped in `del` tag
    // The only tags our parser allows is strong, em, or br, so we wrap those
    // in a strong tag and prepend a line break if there is non already to achieve
    // the same result as before
    $html('blockquote del').each((i, del) => {
        if ($(del).prev('br').length <= 0) {
            $(del).prepend('<br>');
        }
        $(del).html($(del).text());
        del.tagName = 'strong';
    });

    /* Buffer specific parser
    ****************************************************/

    // Handle Crayon plugin
    $html('div.crayon-syntax').each((i, div) => {
        let lines = [];
        $(div).find('.crayon-line').each((l, line) => {
            let chars = [];
            $(line).find('span').each((m, span) => {
                chars.push($(span).text());
            });
            lines.push(chars.join(''));
        });
        let code = lines.join('\n');

        let $pre = $('<pre></pre>');
        let $code = $('<code></code>');

        $pre.append($code.text(code));

        $(div).replaceWith($pre);
    });

    // Alert boxes
    $html('p.alert-box').each((i, p) => {
        $(p).attr('class', 'bf-alert-box');
        $(p).before('<!--kg-card-begin: html-->');
        $(p).after('<!--kg-card-end: html-->');
    });

    // Text drop cap
    $html('div.text-drop-cap').each((i, div) => {
        $(div).attr('class', 'bf-text-drop-cap');
        $(div).before('<!--kg-card-begin: html-->');
        $(div).after('<!--kg-card-end: html-->');
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
module.exports.processPost = (wpPost, users, options, errors) => {
    let {tags: fetchTags, addTag, excerptSelector} = options;
    let urlRegexp = new RegExp(`^${options.url}(\\d{4}/\\d{2}/\\d{2}/)?`);
    let slugRegexp = new RegExp(`${wpPost.slug}$`);
    // CASE: post is using a canonical URL and the slug doesn't represent the URL being used
    // When the post slug is different from the post link (ignoring dated permalinks), we fall back
    // to use the post link.
    let slug = slugRegexp.test(wpPost.link) ? wpPost.slug : wpPost.link.replace(urlRegexp, '');

    // @note: we don't copy excerpts because WP generated excerpts aren't better than Ghost ones but are often too long.
    const post = {
        url: wpPost.link,
        data: {
            slug: slug,
            title: wpPost.title.rendered,
            comment_id: wpPost.id,
            html: wpPost.content.rendered,
            type: wpPost.type === 'post' ? 'post' : 'page',
            status: wpPost.status === 'publish' ? 'published' : 'draft',
            created_at: wpPost.date_gmt,
            published_at: wpPost.date_gmt,
            updated_at: wpPost.modified_gmt,
            author: users ? users.find((user) => {
                // Try to use the user data returned from the API
                return user.data.id === wpPost.author;
            }) : null
        }
    };

    if (options.featureImage === 'featuredmedia' && wpPost._embedded['wp:featuredmedia']) {
        const wpImage = wpPost._embedded['wp:featuredmedia'][0];
        post.data.feature_image = wpImage.source_url.replace(/(?:-\d{2,4}x\d{2,4})(.\w+)$/gi, '$1');
    }

    if (wpPost._embedded.author && !post.data.author) {
        // use the data passed along the post if we couldn't match the user from the API
        const wpAuthor = wpPost._embedded.author[0];
        post.data.author = this.processAuthor(wpAuthor);
    }

    if (wpPost._embedded['wp:term']) {
        const wpTerms = wpPost._embedded['wp:term'];
        post.data.tags = this.processTerms(wpTerms, fetchTags);

        post.data.tags.push({
            url: 'migrator-added-tag', data: {name: '#wp'}
        });

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag-2', data: {slug: addTag, name: addTag}
            });
        }
    }

    if (excerptSelector) {
        post.data.custom_excerpt = this.processExcerpt(post.data.html, excerptSelector);
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = this.processContent(post.data.html, post.url, excerptSelector, errors);

    return post;
};

module.exports.processPosts = (posts, users, options, errors) => {
    return posts.map(post => this.processPost(post, users, options, errors));
};

module.exports.processAuthors = (authors) => {
    return authors.map(author => this.processAuthor(author));
};

module.exports.all = async ({result: input, usersJSON, options, errors}) => {
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
            throw new Error('Unable to process passed users file');
        }
        input.users = mergedUsers;
    }

    const output = {
        users: this.processAuthors(input.users)
    };

    output.posts = this.processPosts(input.posts, output.users, options, errors);

    return output;
};
