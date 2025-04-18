import {URL} from 'node:url';
import $ from 'cheerio';
import {slugify} from '@tryghost/string';
import errors from '@tryghost/errors';
import MarkdownIt from 'markdown-it';
import MgWpAPI from '@tryghost/mg-wp-api';
import {isSerialized, unserialize} from 'php-serialize';

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

const processWPMeta = async ($post) => {
    let metaData = {};

    let postMeta = $($post).children('wp\\:postmeta').map(async (i, meta) => {
        let key = $(meta).children('wp\\:meta_key').text();
        let value = $(meta).children('wp\\:meta_value').text();

        try {
            if (isSerialized(value)) {
                value = unserialize(value);
            }
        } catch (error) {
            // If unserializing fails, log the error but don't throw. The serialized data is returned
            console.log(key, value, error); // eslint-disable-line no-console
        }

        // Convert empty serialized arrays to empty arrays, which `php-serialize` doesn't do
        if (value === 'a:0:{}') {
            value = [];
        }

        metaData[key] = value;
    }).get();

    await Promise.all(postMeta);

    return metaData;
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

const getYouTubeID = (videoUrl) => {
    const arr = videoUrl.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const preProcessContent = async ({html, options}) => { // eslint-disable-line no-shadow
    // Drafts can have empty post bodies
    if (!html) {
        return html;
    }

    // Split content by line
    const splitIt = html.split(/\r?\n/);

    // Regexp to find lines that only contain a YouTube link
    const youTubeLine = new RegExp('^((?:https?:)?\\/\\/)?((?:www|m)\\.)?((?:youtube(?:-nocookie)?\\.com|youtu.be))(\\/(?:[\\w\\-]+\\?v=|embed\\/|live\\/|v\\/)?)([\\w\\-]+)(\\S+)?$');

    // For each line, test against the regexp above
    splitIt.forEach((line, index, theArray) => {
        if (youTubeLine.test(line.trim())) {
            const theId = getYouTubeID(line);

            const replaceWith = `<iframe loading="lazy" title="" width="160" height="9" src="https://www.youtube.com/embed/${theId}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe>`;

            return theArray[index] = replaceWith;
        }

        return theArray[index] = line;
    });

    // Join the separated lines
    html = splitIt.join('\n');

    const $html = $.load(html, {
        decodeEntities: false
    }, false);

    // 👀 If any XML-specific processing needs to be done, this is the place to do it.

    // Remove empty link elements, typically HTML anchors
    $html('a').each((i, el) => {
        if ($(el).html().length === 0) {
            $(el).remove();
        }
    });

    // convert HTML back to a string
    html = $html.html();

    // Convert shortcodes here to that they don't accidently get wrapped in <p> tags by MarkdownIt
    html = await MgWpAPI.process.processShortcodes({html, options});

    return html;
};

const processHTMLContent = async (args) => {
    // If rawHtml is set, don't process the HTML and wrap content in a HTML card
    if (args?.options?.rawHtml) {
        return `<!--kg-card-begin: html-->${args.html}<!--kg-card-end: html-->`;
    }

    return await MgWpAPI.process.processContent({
        html: args.html,
        excerptSelector: args.excerptSelector,
        postUrl: args.postUrl,
        options: args.options
    });
};

const processPost = async ($post, users, options) => {
    const {addTag, url, excerpt, excerptSelector} = options;
    const postTypeVal = $($post).children('wp\\:post_type').text();
    const postType = (postTypeVal === 'page') ? 'page' : 'post';
    const featureImage = processFeatureImage($post, options.attachments);
    const authorSlug = slugify($($post).children('dc\\:creator').text());

    // WP XML only provides a published date, we let's use that all dates Ghost expects
    const postDate = new Date($($post).children('pubDate').text());

    // This should result in an absolute URL addressable in a browser
    let postUrl = $($post).children('link').text();
    let parsedPostUrl = new URL(postUrl, url);
    postUrl = parsedPostUrl.href;

    // If you need <wp:postmeta> data, access it here
    // const postMeta = await processWPMeta($post);

    const post = {
        url: postUrl,
        wpPostType: postTypeVal,
        data: {
            slug: $($post).children('wp\\:post_name').text().replace(/(\.html)/i, ''),
            title: $($post).children('title').text().substring(0, 255),
            comment_id: $($post)?.find('wp\\:post_id')?.text() ?? null,
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

    if (post.data.slug.trim().length === 0) {
        post.data.slug = slugify(post.data.title).substring(0, 191);
    }

    post.data.html = await preProcessContent({
        html: $($post).children('content\\:encoded').text(),
        options
    });

    const mdParser = new MarkdownIt({
        html: true,
        breaks: true
    });
    post.data.html = mdParser.render(post.data.html);

    if (excerpt && !excerptSelector) {
        const excerptText = $($post).children('excerpt\\:encoded').text();
        post.data.custom_excerpt = MgWpAPI.process.processExcerpt(excerptText);
    } else if (!excerpt && excerptSelector) {
        post.data.custom_excerpt = MgWpAPI.process.processExcerpt(post.data.html, excerptSelector);
    }

    post.data.html = await processHTMLContent({
        html: post.data.html,
        excerptSelector: (!excerpt && excerptSelector) ? excerptSelector : false,
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

    post.data.tags.push({
        url: `migrator-added-tag-${postTypeVal}`,
        data: {
            slug: `hash-wp-${postTypeVal}`,
            name: `#wp-${postTypeVal}`
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

        let allowedTypes = ['post', 'page'];

        if (options.cpt) {
            allowedTypes = allowedTypes.concat(options.cpt);
        }

        if (allowedTypes.includes(postType)) {
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

    let meta = await processWPMeta($post);

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
        alt: attachmentAlt,
        width: meta?._wp_attachment_metadata?.width,
        height: meta?._wp_attachment_metadata?.height
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
    const {drafts, pages, posts} = options;
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
        scriptingEnabled: false,
        lowerCaseTags: true // needed to find `pubDate` tags
    }, false); // This `false` is `isDocument`. If `true`, <html>, <head>, and <body> elements are introduced

    // grab the URL of the site we're importing
    options.url = $xml('channel > link').text();

    // process users first, as we're using this information
    // to populate the author data for posts
    output.users = processUsers($xml);

    options.attachments = await processAttachments($xml, options);
    output.posts = await processPosts($xml, output.users, options);

    if (options.postsBefore && options.postsAfter) {
        const startDate = new Date(options.postsAfter);
        const endDate = new Date(options.postsBefore).setDate(new Date(options.postsBefore).getDate() + 1);

        output.posts = output.posts.filter((post) => {
            if (new Date(post.data.published_at) > startDate && new Date(post.data.published_at) < endDate) {
                return post;
            } else {
                return false;
            }
        });
    } else if (options.postsAfter) {
        const startDate = new Date(options.postsAfter);

        output.posts = output.posts.filter((post) => {
            if (new Date(post.data.published_at) > startDate) {
                return post;
            } else {
                return false;
            }
        });
    } else if (options.postsBefore) {
        const endDate = new Date(options.postsBefore).setDate(new Date(options.postsBefore).getDate() + 1);

        output.posts = output.posts.filter((post) => {
            if (new Date(post.data.published_at) < endDate) {
                return post;
            } else {
                return false;
            }
        });
    }

    if (!drafts) {
        // remove draft posts
        output.posts = output.posts.filter(post => post.data.status !== 'draft');
    }

    if (!pages) {
        // remove pages
        output.posts = output.posts.filter(post => post.wpPostType !== 'page');
    }

    if (!posts) {
        // remove posts
        output.posts = output.posts.filter(post => post.wpPostType !== 'post');
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
    processWPMeta,
    processHTMLContent
};
