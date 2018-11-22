const $ = require('cheerio');
const processContent = require('./process-content');

const processMeta = (name, $post) => {
    const post = {
        url: $post('.p-canonical').attr('href'),
        data: {
            title: $post('.p-name').text(),
            slug: name.match(/_(.*?)-[0-9a-f]+\.html/)[1],
            custom_excerpt: $post('.p-summary').text().trim()
        }
    };

    if (/^draft/.test(name)) {
        post.url = $post('footer p a').attr('href');
        post.data.status = 'draft';
    } else {
        post.data.status = 'published';
        post.data.published_at = $post('.dt-published').attr('datetime');
    }

    return post;
};

const processAuthor = ($author) => {
    return {
        url: $author.attr('href'),
        data: {
            name: $author.text(),
            slug: $author.attr('href').replace(/.*?@(.*?)$/, (m, p) => p.toLowerCase())
        }
    };
};

const processTags = ($tags) => {
    const tags = [];
    $tags.each((i, tag) => {
        let $tag = $(tag);
        tags.push({
            url: $tag.attr('href'),
            data: {
                name: $tag.text(),
                slug: $tag.attr('href').replace(/.*\/(.*?)$/, (m, p) => p.toLowerCase())
            }
        });
    });
    return tags;
};

module.exports = (name, html) => {
    const $post = $.load(html, {
        decodeEntities: false
    });

    const post = processMeta(name, $post);

    // Process content
    post.data.html = processContent($post('.e-content'), post);

    // Process author
    if ($post('.p-author').length) {
        post.data.author = processAuthor($post('.p-author'));
    }

    // Process tags
    if ($post('.p-tags a').length) {
        post.data.tags = processTags($post('.p-tags a'));
    }

    return post;
};
