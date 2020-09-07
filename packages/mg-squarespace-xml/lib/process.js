const $ = require('cheerio');
const url = require('url');

const processContent = (html, siteUrl) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    $html('div.tweet').each((i, el) => {
        let src = $(el).children('a').attr('href');
        let parsed = url.parse(src);

        if (parsed.search) {
            // remove possible query params
            parsed.search = null;
        }
        src = url.format(parsed, {search: false});

        let $figure = $('<figure class="kg-card kg-embed-card"></figure>');
        let $blockquote = $('<blockquote class="twitter-tweet"></blockquote>');
        let $anchor = $(`<a href="${src}"></a>`);
        let $script = $('<script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script>');

        $blockquote.append($anchor);

        $figure.append($blockquote);
        $figure.append($script);

        $(el).replaceWith($figure);
    });

    $html('a > style').each((i, style) => {
        $(style).remove();
    });

    // Replace Substack share and subscribe buttons with normal links
    // External links stay the same, but internal links should be turned into relative ones
    $html('p.button-wrapper').each((i, button) => {
        let shareLinks = $(button).children('a.button');
        if (shareLinks.length === 1 && siteUrl) {
            let siteRegex = new RegExp(`^(?:${siteUrl}(?:\\/?)(?:p\\/)?)([a-zA-Z-_\\d]*)(?:\\/?)`, 'gi');
            let shareLink = $(shareLinks).get(0);
            let src = $(shareLink).attr('href');
            let parsed = url.parse(src);

            if (parsed.search && parsed.search.indexOf('action=share') >= 0) {
                // If it's a share button, there's no use for it and completely remove the button
                $(button).remove();
                return;
            } else if (parsed.search) {
                // remove possible query params
                parsed.search = null;
            }
            src = url.format(parsed, {search: false});

            if (src.match(siteRegex)) {
                src = src.replace(siteRegex, '/$1/');
            }

            $(shareLink).attr('href', src);
            $(button).replaceWith($(shareLink));
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
        output.users = input;
    }

    return output;
};
