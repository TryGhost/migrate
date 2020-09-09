const $ = require('cheerio');

const processContent = (html) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false,
        normalizeWhitespace: true
    });

    // squarespace images without src
    $html('img[data-src]').each((i, img) => {
        const src = $(img).attr('data-src');
        if ($(img).hasClass('thumb-image')) {
            // images with the `thumb-image` class might be a duplicate
            // to prevent migrating two images, we have to remove the false node
            if ($($(img).prev('noscript').children('img').get(0)).attr('src') === src) {
                $(img).remove();
            }
        } else {
            $(img).attr('src', $(img).attr('data-src'));
        }
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

    // convert HTML back to a string
    html = $html.html();

    return html;
};

const processPost = (post, siteUrl) => {
    post.data.html = processContent(post.data.html, siteUrl);

    return post;
};

module.exports = async (input, ctx) => {
    let {options} = ctx;
    let {url: siteUrl} = options;
    const output = {};

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post, siteUrl));
        output.users = input.users;
    }

    return output;
};
