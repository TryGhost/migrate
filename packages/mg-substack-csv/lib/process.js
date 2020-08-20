const fs = require('fs').promises;
const path = require('path');
const $ = require('cheerio');
const url = require('url');

const getFiles = async (path) => {
    let filenames = await fs.readdir(path);

    return filenames.filter(filename => filename.match(/\.html/));
};

const readContent = async (path) => {
    return fs.readFile(path, 'utf-8');
};

const readFiles = async (files, postsDir) => {
    const postContent = {};
    for (const file of files) {
        const substackId = file.replace(/\.html/, '');

        postContent[substackId] = await readContent(path.join(postsDir, file));
    }

    return postContent;
};

const processContent = (html) => {
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

const processPost = (post) => {
    post.data.html = processContent(post.data.html);

    return post;
};

module.exports = async (input, {postsDir}) => {
    const output = {};

    if (postsDir) {
        try {
            let postFiles = await getFiles(postsDir);
            let postContent = await readFiles(postFiles, postsDir);

            input.posts.map((post) => {
                post.data.html = postContent[post.substackId];
                delete post.substackId;
            });
        } catch (error) {
            return new Error('Couldn\'t read post files');
        }
    }

    if (input.posts && input.posts.length > 0) {
        output.posts = input.posts.map(post => processPost(post));
    }

    return output;
};
