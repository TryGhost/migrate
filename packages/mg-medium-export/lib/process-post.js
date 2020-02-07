const $ = require('cheerio');
const string = require('@tryghost/string');
const processContent = require('./process-content');
const sectionTags = ['aside', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'img'];

const processMeta = (name, $post) => {
    let urlInfo;

    const post = {
        url: $post('.p-canonical').attr('href'),
        data: {
            title: $post('.p-name').text(),
            custom_excerpt: $post('.p-summary').text().trim()
        }
    };

    if (/^(?:posts\/)?draft/.test(name)) {
        urlInfo = name.match(/_(.*?)-([0-9a-f]+)\.html/);
        post.url = $post('footer p a').attr('href');
        post.data.status = 'draft';
    } else {
        urlInfo = post.url.match(/([^/]*?)-([0-9a-f]+)$/);
        post.data.status = 'published';
        post.data.published_at = $post('.dt-published').attr('datetime');
    }

    $('img').map(async (i, el) => {
        let $image = $(el);
        let type = $image.attr('src') === undefined ? 'data-src' : 'src';
        let newSrc = await this.downloadImage($image.attr(type));
        $image.attr(type, newSrc);
    }).get();

    // Ensure the slug is clean and valid according to Ghost
    post.data.slug = string.slugify(urlInfo[1]);
    // Store the medium ID in the comment ID legacy field - not sure if this is useful
    post.data.comment_id = urlInfo[2];

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

const processFeatureImage = (html, post) => {
    const $html = $.load(html, {
        decodeEntities: false
    });

    // Look for data-is-featured
    let featured = $html('[data-is-featured]')[0];

    // Look for an image that appears before content
    let allSections = $html(sectionTags.join(','));
    let foundImg = false;
    let preImageTags = [];

    allSections.each((i, el) => {
        if (!foundImg) {
            preImageTags.push(el.tagName);
        }

        if (!foundImg && el.tagName === 'img') {
            return foundImg = el;
        }
    });

    // We don't have a designated feature image, but there's an image above the content so use that image instead
    if (!featured && !preImageTags.includes('p')) {
        featured = foundImg;
        // tag it with #auto-feature-image so we can tell the difference
        post.data.tags.push({
            data: {
                name: '#auto-feature-image'
            }
        });
    }

    if (featured) {
        post.data.feature_image = $(featured).attr('src');
    }
};

module.exports = (name, html, globalUser) => {
    const $post = $.load(html, {
        decodeEntities: false
    });

    const post = processMeta(name, $post);

    // Process content
    post.data.html = processContent($post('.e-content'), post);

    // Process author
    if ($post('.p-author').length) {
        post.data.author = processAuthor($post('.p-author'));
        // @TODO check if this is the global user and use that?
    } else if (globalUser) {
        post.data.author = globalUser;
    }

    // Process tags
    if ($post('.p-tags a').length) {
        post.data.tags = processTags($post('.p-tags a'));
    } else {
        post.data.tags = [];
    }

    post.data.tags.push({
        url: 'migrator-added-tag', data: {name: '#medium'}
    });

    // Grab the featured image
    // Do this last so that we can add tags to indicate feature image style
    processFeatureImage(post.data.html, post);

    return post;
};
