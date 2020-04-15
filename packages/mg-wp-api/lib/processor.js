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
            email: wpAuthor.email && wpAuthor.email
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

module.exports.processContent = (html, postUrl, errors) => {
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
            $blockquote.children('p').each((i, p) => {
                if (i < $blockquote.children('p').length - 1) {
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

    // When a heading has a custom id, we destroy links by auto-generating a new id when converting to mobiledoc.
    // Wrapping it in an HTML card prevent the id from being lost
    $html('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]').each((i, heading) => {
        $(heading).before('<!--kg-card-begin: html-->');
        $(heading).after('<!--kg-card-end: html-->');
    });

    // Wrap inline styled tags in HTML card
    $html('div[style], p[style], a[style], span[style]').each((i, styled) => {
        let imgChildren = $(styled).children('img:not([data-gif])');
        if ($(imgChildren).length > 0) {
            // We don't convert images into image cards when they're wrapped in an HTML card
            // To prevent visual issues, we need to delete `srcset` (we don't scrape those images anyway),
            // `sizes`, and dimensions (for `srcset` images).
            $(imgChildren).each((i, img) => {
                if ($(img).attr('srcset')) {
                    $(img).removeAttr('width');
                    $(img).removeAttr('height');
                }
                $(img).removeAttr('srcset');
                $(img).removeAttr('sizes');
            });
        }
        $(styled).before('<!--kg-card-begin: html-->');
        $(styled).after('<!--kg-card-end: html-->');
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

    /* Buffer specific parser
    ****************************************************/

    // Handle Crayon plugin
    $html('div.crayon-syntax').each((i, div) => {
        let lines = [];
        $(div).find('.crayon-line').each((i, line) => {
            let chars = [];
            $(line).find('span').each((i, span) => {
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
module.exports.processPost = (wpPost, users, fetchTags, errors) => {
    // @note: we don't copy excerpts because WP generated excerpts aren't better than Ghost ones but are often too long.
    const post = {
        url: wpPost.link,
        data: {
            slug: wpPost.slug,
            title: wpPost.title.rendered,
            comment_id: wpPost.id,
            html: wpPost.content.rendered,
            type: wpPost.type === 'post' ? 'post' : 'page',
            status: wpPost.status === 'publish' ? 'published' : 'draft',
            published_at: wpPost.date_gmt,
            author: users ? users.find((user) => {
                // Try to use the user data returned from the API
                return user.data.id === wpPost.author;
            }) : null
        }
    };

    if (wpPost._embedded['wp:featuredmedia']) {
        const wpImage = wpPost._embedded['wp:featuredmedia'][0];
        post.data.feature_image = wpImage.source_url;
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
            url: 'migrator-added-tag', data: {name: '#wordpress'}
        });
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = this.processContent(post.data.html, post.url, errors);

    return post;
};

module.exports.processPosts = (posts, users, fetchTags, errors) => {
    return posts.map(post => this.processPost(post, users, fetchTags, errors));
};

module.exports.processAuthors = (authors) => {
    return authors.map(author => this.processAuthor(author));
};

module.exports.all = async ({result: input, usersJSON, errors, options}) => {
    let {tags: fetchTags} = options;

    if (usersJSON) {
        const mergedUsers = [];
        try {
            let passedUsers = await fs.readJSON(usersJSON);
            console.log(`Passed a users file with ${passedUsers.length} entries, processing now!`);
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

    output.posts = this.processPosts(input.posts, output.users, fetchTags, errors);

    return output;
};
