const url = require('url');
const $ = require('cheerio');
const {slugify} = require('@tryghost/string');
const {parse} = require('date-fns');
const errors = require('@tryghost/errors');
const MarkdownIt = require('markdown-it');
const {process} = require('@tryghost/mg-wp-api');
const processContent = process.processContent;

module.exports.processUser = ($user) => {
    const authorSlug = slugify($($user).children('wp\\:author_login').text());

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $($user).children('wp\\:author_display_name').text(),
            email: $($user).children('wp\\:author_email').text()
        }
    };
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
module.exports.processFeatureImage = ($post, attachments) => {
    let thumbnailId = null;

    $($post).find('wp\\:postmeta').each((i, row) => {
        let key = $(row).find('wp\\:meta_key').text();
        let val = $(row).find('wp\\:meta_value').text();

        if (key === '_thumbnail_id') {
            thumbnailId = val;
        }
    });

    if (!thumbnailId) {
        return false;
    }

    const attachmentData = attachments.find(item => item.id === thumbnailId);

    return attachmentData;
};

module.exports.processTags = ($wpTerms, fetchTags) => {
    const categories = [];
    const tags = [];

    $wpTerms.each((i, taxonomy) => {
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

module.exports.preProcessContent = async ({html}) => { // eslint-disable-line no-shadow
    // Drafts can have empty post bodies
    if (!html) {
        return html;
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // 👀 If any processing needs to be done, this is the place to do it.

    // convert HTML back to a string
    html = $html.html();

    return html;
};

module.exports.processHTMLContent = async (args) => {
    return await processContent({
        html: args.html,
        postUrl: args.postUrl,
        options: args.options
    });
};

module.exports.processPost = async ($post, users, options) => {
    const {addTag, tags: fetchTags, siteUrl} = options;
    const postType = $($post).children('wp\\:post_type').text();
    const featureImage = this.processFeatureImage($post, options.attachments);
    const authorSlug = slugify($($post).children('dc\\:creator').text());
    let postSlug = $($post).children('link').text();

    if (!postSlug || postSlug.indexOf('null') >= 0) {
        postSlug = 'untitled';
    }

    // WP XML only provides a published date, we let's use that all dates Ghost expects
    const postDate = parse($($post).children('pubDate').text(), 'EEE, d MMM yyyy HH:mm:ss xx', new Date());

    let postUrl = $($post).children('link').text();
    if (!url.parse(postUrl).host) {
        postUrl = new URL(postUrl, siteUrl).href;
    }

    const post = {
        url: postUrl,
        data: {
            slug: $($post).children('wp\\:post_name').text().replace(/(\.html)/i, ''),
            title: $($post).children('title').text(),
            status: $($post).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
            published_at: postDate,
            created_at: postDate,
            updated_at: postDate,
            feature_image: featureImage?.url ?? null,
            type: postType,
            author: users ? users.find(user => user.data.slug === authorSlug) : null,
            tags: []
        }
    };

    post.data.html = await this.preProcessContent({
        html: $($post).children('content\\:encoded').text()
    });

    const mdParser = new MarkdownIt({
        html: true
    });
    post.data.html = mdParser.render(post.data.html);

    post.data.html = await this.processHTMLContent({
        html: post.data.html,
        postUrl: post.url,
        options: options
    });

    if ($($post).children('category').length >= 1) {
        post.data.tags = this.processTags($($post).children('category'), fetchTags);
    }

    if (addTag) {
        const addTagSlug = slugify(addTag);

        post.data.tags.push({
            url: `migrator-added-tag-${addTagSlug}`,
            data: {
                slug: addTagSlug,
                name: addTag
            }
        });
    }

    post.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-wp',
            name: '#wp'
        }
    });

    if (!post.data.author) {
        if ($($post).children('dc\\:creator').length >= 1) {
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
};

module.exports.processPosts = async ($xml, users, options) => {
    let postsOutput = [];

    let posts = $xml('item').map(async (i, post) => {
        const postType = $(post).children('wp\\:post_type').text();

        if (['post', 'page'].includes(postType)) {
            postsOutput.push(await this.processPost(post, users, options));
        }
    }).get();

    await Promise.all(posts);

    return postsOutput;
};

module.exports.processAttachment = async ($post) => {
    let attachmentKey = $($post).find('wp\\:post_id').text();
    let attachmentUrl = $($post).find('wp\\:attachment_url').text() || null;
    let attachmentDesc = $($post).find('content\\:encoded').text() || null;
    let attachmentAlt = null;

    $($post).find('wp\\:postmeta').each((i, row) => {
        let metaKey = $(row).find('wp\\:meta_key').text();
        let metaVal = $(row).find('wp\\:meta_value').text();

        if (metaKey === '_wp_attachment_image_alt') {
            attachmentAlt = metaVal;
        }
    });

    return {
        id: attachmentKey,
        url: attachmentUrl,
        description: attachmentDesc,
        alt: attachmentAlt
    };
};

module.exports.processAttachments = async ($xml, options) => {
    let attachmentsOutput = [];

    let posts = $xml('item').map(async (i, post) => {
        const postType = $(post).children('wp\\:post_type').text();

        if (['attachment'].includes(postType)) {
            attachmentsOutput.push(await this.processAttachment(post, options));
        }
    }).get();

    await Promise.all(posts);

    return attachmentsOutput;
};

module.exports.processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, user) => {
        usersOutput.push(this.processUser(user));
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
        return new errors.NoContentError({message: 'Input file is empty'});
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

    options.attachments = await this.processAttachments($xml, options);
    output.posts = await this.processPosts($xml, output.users, options);

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
