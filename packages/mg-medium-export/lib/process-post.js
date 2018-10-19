const cheerio = require('cheerio');
const processContent = require('./process-content');

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
        post.data.author = {
            url: $('.p-author').attr('href'),
            data: {
                name: $('.p-author').text()
            }
        };
    }

    post.data.html = processContent($('.e-content'), post);

    return post;
};
