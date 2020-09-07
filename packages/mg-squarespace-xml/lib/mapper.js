const $ = require('cheerio');
const {slugify} = require('@tryghost/string');

const processUser = (user) => {
    const authorSlug = slugify($(user).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $(user).children('wp\\:author_display_name').text(),
            email: $(user).children('wp\\:author_email').text()
        }
    };
};

const processPost = (post) => {
    return {
        url: $(post).children('link').text(),
        data: {
            slug: $(post).children('wp\\:post_name').text(),
            title: $(post).children('title').text(),
            html: $(post).children('content\\:encoded'),
            status: $(post).children('wp\\:status') === 'publish' ? 'post' : 'page',
            published_at: $(post).children('wp\\:post_date_gmt')
        }
    };
};

module.exports = async (input, options) => {
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    const $file = $.load(input, {
        decodeEntities: false,
        xmlMode: true
    });

    $file('wp\\:author').each((i, user) => {
        output.users.push(processUser(user));
    });

    $file('item').each((i, post) => {
        output.posts.push(processPost(post));
    });
    console.log('output', output);

    return output;
};
