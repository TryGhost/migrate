const $ = require('cheerio');
const {slugify} = require('@tryghost/string');

module.exports.processContent = (html, postUrl) => {
    // Drafts can have empty post bodies
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    try {
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

        // convert HTML back to a string
        html = $html.html();

        // Handle Revue embeds
        // This is done with a regex replace, because we have to parse the string

        // Twitter embeds `[twitter <URL>]`
        html = html.replace(/\[tweet (https?:\/\/twitter\.com\/\S*\/\S*\/\d*)\]/g, (m, src) => {
            return `<figure class="kg-card kg-embed-card">
<blockquote class="twitter-tweet"><a href="${src}"></a></blockquote>
<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>
</figure>`;
        });

        // YouTube embeds `[embed <URL>]`
        html = html.replace(/\[embed https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9]*)\]/g, (m, id) => {
            return `<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card">
<iframe src="https://www.youtube.com/embed/${id}?feature=oembed" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen="" frameborder="0"></iframe>
</figure><!--kg-card-end: embed-->`;
        });
    } catch (err) {
        console.log(postUrl); // eslint-disable-line no-console
        err.source = postUrl;
        throw err;
    }

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
module.exports.processPost = (data, {addPrimaryTag, email, pubName}) => {
    const post = {
        url: data.url,
        data: {
            slug: slugify(data.title),
            title: data.title,
            meta_title: data.page_title || data.title,
            status: 'published',
            published_at: data.sent_at,
            tags: []
        }
    };

    if (addPrimaryTag) {
        post.data.tags.push({
            url: `/tag/${slugify(addPrimaryTag)}`,
            data: {
                name: addPrimaryTag
            }
        });
    }

    post.data.tags.push({
        url: 'migrator-added-tag', data: {name: '#revue'}
    });

    if (email) {
        post.data.author = {
            url: `/author/${pubName}`,
            data: {
                email: email,
                slug: pubName
            }
        };
    }

    // Some HTML content needs to be modified so that our parser plugins can interpret it
    post.data.html = this.processContent(data.html, post.url);

    return post;
};

module.exports.processPosts = (posts, options) => {
    return posts.map(post => this.processPost(post, options));
};

module.exports.all = ({result, options}) => {
    const output = {
        posts: this.processPosts(result.posts, options)
    };

    return output;
};
