const cheerio = require('cheerio');
const processContent = require('./process-content');

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
    $tags.each((i, el) => {
        let $tag = cheerio(el);
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
    let $ = cheerio.load(html, {
        decodeEntities: false
    });
    let post = {
        url: $('.p-canonical').attr('href'),
        data: {
            title: $('.p-name').text(),
            slug: name.match(/_(.*?)-[0-9a-f]+\.html/)[1],
            custom_excerpt: $('.p-summary').text().trim()
        }
    };

    if (/^draft/.test(name)) {
        post.url = $('footer p a').attr('href');
        post.data.status = 'draft';
    } else {
        post.data.status = 'published';
        post.data.published_at = $('.dt-published').attr('datetime');
    }

    // Process content
    post.data.html = processContent($('.e-content'), post);

    // Process author
    if ($('.p-author').length) {
        post.data.author = processAuthor($('.p-author'));
    }

    // @TODO: process tags
    if ($('.p-tags a').length) {
        post.data.tags = processTags($('.p-tags a'));
    }

    return post;
};
