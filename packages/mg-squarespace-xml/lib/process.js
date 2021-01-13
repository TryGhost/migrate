const $ = require('cheerio');
const {slugify} = require('@tryghost/string');
const {parse} = require('date-fns');

module.exports.processUser = ($sqUser) => {
    const authorSlug = slugify($($sqUser).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $($sqUser).children('wp\\:author_display_name').text(),
            email: $($sqUser).children('wp\\:author_email').text()
        }
    };
};

module.exports.processContent = (html) => {
    if (!html) {
        return '';
    }

    const $html = $.load(html, {
        decodeEntities: false,
        normalizeWhitespace: true
    });

    $html('.newsletter-form-wrapper').each((i, form) => {
        $(form).remove();
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

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
module.exports.processFeatureImage = ($sqPost) => {
    const $nextItem = $($sqPost).next().children('wp\\:attachment_url');

    if ($nextItem.length >= 1) {
        return $nextItem.text();
    }

    return;
};

module.exports.processTags = ($sqCategories, fetchTags) => {
    const categories = [];
    const tags = [];

    $sqCategories.each((i, taxonomy) => {
        if (fetchTags && $(taxonomy).attr('domain') === 'post_tag') {
            tags.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        } else if ($(taxonomy).attr('domain') === 'category') {
            categories.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text()
                }
            });
        }
    });

    return categories.concat(tags);
};

module.exports.processPost = ($sqPost, users, {addTag, tags: fetchTags, siteUrl}) => {
    const postType = $($sqPost).children('wp\\:post_type').text();

    // only grab posts and pages
    if (postType !== 'attachment') {
        const featureImage = this.processFeatureImage($sqPost);
        const authorSlug = slugify($($sqPost).children('dc\\:creator').text());
        let postSlug = $($sqPost).children('link').text();

        if (!postSlug || postSlug.indexOf('null') >= 0) {
            // drafts can have a post slug/link of `/null`
            postSlug = 'untitled';
        }

        // WP XML only provides a published date, we let's use that all dates Ghost expects
        const postDate = parse($($sqPost).children('pubDate').text(), 'EEE, d MMM yyyy HH:mm:ss xx', new Date());

        const post = {
            url: `${siteUrl}${$($sqPost).children('link').text()}`,
            data: {
                slug: $($sqPost).children('wp\\:post_name').text().replace(/(\.html)/i, ''),
                title: $($sqPost).children('title').text(),
                status: $($sqPost).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
                published_at: postDate,
                created_at: postDate,
                updated_at: postDate,
                feature_image: featureImage,
                type: postType,
                author: users ? users.find(user => user.data.slug === authorSlug) : null,
                tags: []
            }
        };

        post.data.html = this.processContent($($sqPost).children('content\\:encoded').text());

        if ($($sqPost).children('category').length >= 1) {
            post.data.tags = this.processTags($($sqPost).children('category'), fetchTags);
        }

        post.data.tags.push({
            url: 'migrator-added-tag', data: {name: '#sqs'}
        });

        if (addTag) {
            post.data.tags.push({
                url: 'migrator-added-tag-2', data: {slug: addTag, name: addTag}
            });
        }

        if (!post.data.author) {
            if ($($sqPost).children('dc\\:creator').length >= 1) {
                post.data.author = {
                    url: authorSlug,
                    data: {
                        slug: authorSlug
                    }
                };
            } else {
                post.data.author = {
                    url: 'migrator-added-author',
                    data: {
                        slug: 'migrator-added-author'
                    }
                };
            }
        }

        return post;
    }
};

module.exports.processPosts = ($xml, users, options) => {
    const postsOutput = [];

    $xml('item').each((i, sqPost) => {
        postsOutput.push(this.processPost(sqPost, users, options));
    });

    // don't return empty post objects
    return postsOutput.filter(post => post);
};

module.exports.processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, sqUser) => {
        usersOutput.push(this.processUser(sqUser));
    });

    return usersOutput;
};

module.exports.all = async (input, {options}) => {
    const {drafts, pages} = options;
    const output = {
        posts: [],
        users: []
    };

    if (input.length < 1) {
        return new Error('Input file is empty');
    }

    const $xml = $.load(input, {
        decodeEntities: false,
        xmlMode: true,
        lowerCaseTags: true // needed to find `pubDate` tags
    });

    // grab the URL of the site we're importing
    options.siteUrl = $xml('channel > link').text();

    // process users first, as we're using this information
    // to populate the author data for posts
    output.users = this.processUsers($xml);

    output.posts = this.processPosts($xml, output.users, options);

    if (!drafts) {
        // remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    if (!pages) {
        // remove pages. absolute not supported by default and not tested!!
        output.posts = output.posts.filter(post => post.data.type !== 'page');
    }

    return output;
};
