import {URL} from 'node:url';
import $ from 'cheerio';
import {slugify} from '@tryghost/string';
import {parse} from 'date-fns';
import errors from '@tryghost/errors';
import MarkdownIt from 'markdown-it';
import MgWpAPI from '@tryghost/mg-wp-api';

const processUser = ($user) => {
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
const processFeatureImage = ($post, attachments) => {
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

const processTags = ($wpTerms) => {
    const categories = [];
    const tags = [];

    let allowedTerms = [
        'post_tag',
        'organization',
        'policy',
        'treaty',
        'region',
        'legal_regulatory'
    ];

    $wpTerms.each((i, taxonomy) => {
        // `category` takes priority and is use as the primary tag, so gets added to the list first
        if ($(taxonomy).attr('domain') === 'category') {
            categories.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text().replace('&amp;', '&')
                }
            });
        } else if (allowedTerms.includes($(taxonomy).attr('domain'))) {
            tags.push({
                url: `/tag/${$(taxonomy).attr('nicename')}`,
                data: {
                    slug: $(taxonomy).attr('nicename'),
                    name: $(taxonomy).text().replace('&amp;', '&')
                }
            });
        }
    });

    return categories.concat(tags);
};

const preProcessContent = async ({html}) => { // eslint-disable-line no-shadow
    // Drafts can have empty post bodies
    if (!html) {
        return html;
    }

    const $html = $.load(html, {
        decodeEntities: false
    });

    // 👀 If any XML-specific processing needs to be done, this is the place to do it.

    // convert HTML back to a string
    html = $html.html();

    return html;
};

const processHTMLContent = async (args) => {
    return await MgWpAPI.process.processContent({
        html: args.html,
        postUrl: args.postUrl,
        options: args.options
    });
};

const processPost = async ($post, users, options) => {
    const {addTag, siteUrl} = options;
    const postType = $($post).children('wp\\:post_type').text();
    const featureImage = processFeatureImage($post, options.attachments);
    const authorSlug = slugify($($post).children('dc\\:creator').text());
    let postSlug = $($post).children('link').text();

    if (!postSlug || postSlug.indexOf('null') >= 0) {
        postSlug = 'untitled';
    }

    // WP XML only provides a published date, we let's use that all dates Ghost expects
    const postDate = parse($($post).children('pubDate').text(), 'EEE, d MMM yyyy HH:mm:ss xx', new Date());

    // This should result in an absolute URL addressable in a browser
    let postUrl = $($post).children('link').text();
    let parsedPostUrl = new URL(postUrl, siteUrl);
    postUrl = parsedPostUrl.href;

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

    const excerptText = $($post).children('excerpt\\:encoded').text();

    if (excerptText.length > 0) {
        post.data.custom_excerpt = excerptText;
    }

    post.data.html = await preProcessContent({
        html: $($post).children('content\\:encoded').text()
    });

    const mdParser = new MarkdownIt({
        html: true
    });
    post.data.html = mdParser.render(post.data.html);

    post.data.html = await processHTMLContent({
        html: post.data.html,
        postUrl: post.url,
        options: options
    });

    if ($($post).children('category').length >= 1) {
        post.data.tags = processTags($($post).children('category'));
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

const processPosts = async ($xml, users, options) => {
    let postsOutput = [];

    let posts = $xml('item').map(async (i, post) => {
        const postType = $(post).children('wp\\:post_type').text();

        if (['post', 'page'].includes(postType)) {
            postsOutput.push(await processPost(post, users, options));
        }
    }).get();

    await Promise.all(posts);

    return postsOutput;
};

const processAttachment = async ($post) => {
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

const processAttachments = async ($xml, options) => {
    let attachmentsOutput = [];

    let posts = $xml('item').map(async (i, post) => {
        const postType = $(post).children('wp\\:post_type').text();

        if (['attachment'].includes(postType)) {
            attachmentsOutput.push(await processAttachment(post, options));
        }
    }).get();

    await Promise.all(posts);

    return attachmentsOutput;
};

const processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, user) => {
        usersOutput.push(processUser(user));
    });

    return usersOutput;
};

const all = async (input, {options}) => {
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
    output.users = processUsers($xml);

    options.attachments = await processAttachments($xml, options);
    output.posts = await processPosts($xml, output.users, options);

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

export default {
    processUser,
    processFeatureImage,
    processTags,
    preProcessContent,
    processHTMLContent,
    processPost,
    processPosts,
    processAttachment,
    processAttachments,
    processUsers,
    all
};

export {
    processHTMLContent
};
