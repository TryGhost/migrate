import {URL} from 'node:url';
import {XMLParser} from 'fast-xml-parser';
import {slugify} from '@tryghost/string';
import errors from '@tryghost/errors';
import MarkdownIt from 'markdown-it';
import MgWpAPI from '@tryghost/mg-wp-api';
import {domUtils} from '@tryghost/mg-utils';
import {isSerialized, unserialize} from 'php-serialize';

const {parseFragment} = domUtils;

// XML Parser configuration
const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false
};

// Helper to ensure value is always an array
const ensureArray = (value) => {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
};

// Helper to get text content from a node (handles both string and object with #text)
const getText = (node) => {
    if (node === undefined || node === null) {
        return '';
    }
    if (typeof node === 'string') {
        return node;
    }
    if (typeof node === 'object' && node['#text'] !== undefined) {
        return String(node['#text']);
    }
    return String(node);
};

const processUser = (user) => {
    const authorSlug = slugify(getText(user['wp:author_login']));
    const bio = getText(user['wp:author_description']) || '';
    const avatar = getText(user['wp:author_avatar']) || '';

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: getText(user['wp:author_display_name']),
            email: getText(user['wp:author_email']),
            bio: bio || undefined,
            profile_image: avatar || undefined
        }
    };
};

const processWPMeta = async (post) => {
    let metaData = {};

    const postMetas = ensureArray(post['wp:postmeta']);

    for (const meta of postMetas) {
        let key = getText(meta['wp:meta_key']);
        let value = getText(meta['wp:meta_value']);

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
    }

    return metaData;
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
const processFeatureImage = (post, attachments) => {
    let thumbnailId = null;

    const postMetas = ensureArray(post['wp:postmeta']);

    for (const meta of postMetas) {
        const key = getText(meta['wp:meta_key']);
        const val = getText(meta['wp:meta_value']);

        if (key === '_thumbnail_id') {
            thumbnailId = val;
        }
    }

    if (!thumbnailId) {
        return false;
    }

    const attachmentData = attachments.find(item => item.id === thumbnailId);

    return attachmentData;
};

const processTags = (categories, options = {}) => {
    const categoriesOutput = [];
    const tags = [];

    // If options.tags is false, skip post_tag (only import categories)
    const includeTags = options.tags !== false;

    let allowedTerms = [
        'post_tag',
        'organization',
        'policy',
        'treaty',
        'region',
        'legal_regulatory'
    ];

    const categoriesArray = ensureArray(categories);

    for (const taxonomy of categoriesArray) {
        const domain = taxonomy['@_domain'];
        const nicename = taxonomy['@_nicename'];
        const name = getText(taxonomy);

        // `category` takes priority and is use as the primary tag, so gets added to the list first
        if (domain === 'category') {
            categoriesOutput.push({
                url: `/tag/${nicename}`,
                data: {
                    slug: nicename.substring(0, 190),
                    name: name.replace('&amp;', '&').substring(0, 190)
                }
            });
        } else if (includeTags && allowedTerms.includes(domain)) {
            // Only include tags if options.tags is not false
            tags.push({
                url: `/tag/${nicename}`,
                data: {
                    slug: nicename.substring(0, 190),
                    name: name.replace('&amp;', '&').substring(0, 190)
                }
            });
        }
    }

    return categoriesOutput.concat(tags);
};

const getYouTubeID = (videoUrl) => {
    const arr = videoUrl.split(/(vi\/|v%3D|v=|\/v\/|youtu\.be\/|\/embed\/)/);
    return undefined !== arr[2] ? arr[2].split(/[^\w-]/i)[0] : arr[0];
};

const stripHtml = (html) => {
    // Remove HTML tags, new line characters, and trim white-space
    return html.replace(/<[^>]+>/g, '').replace(/\r?\n|\r/g, ' ').trim();
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

    const parsed = parseFragment(html);

    // Remove empty link elements, typically HTML anchors
    for (const el of parsed.$('a')) {
        if (el.innerHTML.length === 0) {
            el.remove();
        }
    }

    // convert HTML back to a string
    html = parsed.html();

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
        featureImageSrc: args.featureImageSrc ?? false,
        options: args.options
    });
};

const processPost = async (post, users, options) => {
    const {addTag, url, excerpt, excerptSelector, featureImageCaption} = options;
    const postTypeVal = getText(post['wp:post_type']);
    const postType = (postTypeVal === 'page') ? 'page' : 'post';
    const featureImage = processFeatureImage(post, options.attachments);
    const dcCreatorSlug = slugify(getText(post['dc:creator']));

    // WP XML only provides a published date, we let's use that all dates Ghost expects
    const postDate = new Date(getText(post.pubdate || post.pubDate));

    // This should result in an absolute URL addressable in a browser
    let postUrl = getText(post.link);
    let parsedPostUrl = new URL(postUrl, url);
    postUrl = parsedPostUrl.href;

    // Extract authors from Co-Authors Plus format: <category domain="author" nicename="slug">Name</category>
    // This is the most common multi-author plugin for WordPress
    const coAuthors = [];
    const seenSlugs = new Set();

    const categories = ensureArray(post.category);
    for (const authorCat of categories) {
        if (authorCat['@_domain'] === 'author') {
            const authorSlug = authorCat['@_nicename'];
            const authorName = getText(authorCat);

            // Skip duplicates (Co-Authors Plus sometimes includes multiple entries for same author)
            if (authorSlug && !seenSlugs.has(authorSlug)) {
                seenSlugs.add(authorSlug);

                // Try to find matching user from the XML's wp:author list
                const matchedUser = users?.find(u => u.data.slug === authorSlug);
                if (matchedUser) {
                    coAuthors.push(matchedUser);
                } else {
                    // Create author entry from the category data
                    coAuthors.push({
                        url: authorSlug,
                        data: {
                            slug: authorSlug,
                            name: authorName
                        }
                    });
                }
            }
        }
    }

    // Build final authors array - only use for multiple authors (Co-Authors Plus)
    // For single-author posts, we use the `author` field for backwards compatibility
    const authors = coAuthors.length > 1 ? coAuthors : [];

    const postObj = {
        url: postUrl,
        wpPostType: postTypeVal,
        data: {
            slug: getText(post['wp:post_name']).replace(/(\.html)/i, ''),
            title: stripHtml(getText(post.title).substring(0, 255)),
            comment_id: getText(post['wp:post_id']) || null,
            status: getText(post['wp:status']) === 'publish' ? 'published' : 'draft',
            published_at: postDate,
            created_at: postDate,
            updated_at: postDate,
            feature_image: featureImage?.url ?? null,
            feature_image_alt: featureImage?.alt ?? null,
            feature_image_caption: (featureImageCaption !== false) ? (featureImage?.description ?? featureImage?.title ?? null) : null,
            type: postType,
            // Use authors array only for multiple authors (Co-Authors Plus with 2+ authors)
            // Use single author field for backwards compatibility with single-author posts
            authors: authors.length > 0 ? authors : undefined,
            author: authors.length === 0 ? (coAuthors.length === 1 ? coAuthors[0] : (users ? users.find(user => user.data.slug === dcCreatorSlug) : null)) : undefined,
            tags: []
        }
    };

    if (postObj.data.slug.trim().length === 0) {
        postObj.data.slug = slugify(postObj.data.title).substring(0, 185);
    }

    postObj.data.html = await preProcessContent({
        html: getText(post['content:encoded']),
        options
    });

    const mdParser = new MarkdownIt({
        html: true,
        breaks: true
    });
    postObj.data.html = mdParser.render(postObj.data.html);

    if (excerpt && !excerptSelector) {
        const excerptText = getText(post['excerpt:encoded']);
        postObj.data.custom_excerpt = MgWpAPI.process.processExcerpt(excerptText);
    } else if (!excerpt && excerptSelector) {
        postObj.data.custom_excerpt = MgWpAPI.process.processExcerpt(postObj.data.html, excerptSelector);
    }

    postObj.data.html = await processHTMLContent({
        html: postObj.data.html,
        excerptSelector: (!excerpt && excerptSelector) ? excerptSelector : false,
        postUrl: postObj.url,
        featureImageSrc: featureImage?.url ?? null,
        options: options
    });

    if (categories.length >= 1) {
        postObj.data.tags = processTags(categories, options);
    }

    if (addTag) {
        const addTagSlug = slugify(addTag);

        postObj.data.tags.push({
            url: `migrator-added-tag-${addTagSlug}`,
            data: {
                slug: addTagSlug,
                name: addTag
            }
        });
    }

    postObj.data.tags.push({
        url: 'migrator-added-tag',
        data: {
            slug: 'hash-wp',
            name: '#wp'
        }
    });

    postObj.data.tags.push({
        url: `migrator-added-tag-${postTypeVal}`,
        data: {
            slug: `hash-wp-${postTypeVal}`,
            name: `#wp-${postTypeVal}`
        }
    });

    // Only set fallback author if we don't have an author and we don't have multiple authors
    if (!postObj.data.author && !postObj.data.authors) {
        if (post['dc:creator']) {
            postObj.data.author = {
                url: dcCreatorSlug,
                data: {
                    slug: dcCreatorSlug
                }
            };
        } else {
            postObj.data.author = {
                url: 'migrator-added-author',
                data: {
                    slug: 'migrator-added-author'
                }
            };
        }
    }

    return postObj;
};

const processPosts = async (xml, users, options) => {
    let postsOutput = [];

    const items = ensureArray(xml?.rss?.channel?.item);

    for (const post of items) {
        const postType = getText(post['wp:post_type']);

        let allowedTypes = ['post', 'page'];

        if (options.cpt) {
            allowedTypes = allowedTypes.concat(options.cpt);
        }

        if (allowedTypes.includes(postType)) {
            postsOutput.push(await processPost(post, users, options));
        }
    }

    return postsOutput;
};

const processAttachment = async (post) => {
    let attachmentKey = getText(post['wp:post_id']);
    let attachmentUrl = getText(post['wp:attachment_url']) || null;
    let attachmentDesc = getText(post['content:encoded']) || null;
    let attachmentTitle = getText(post.title) || null;
    let attachmentAlt = null;

    let meta = await processWPMeta(post);

    const postMetas = ensureArray(post['wp:postmeta']);
    for (const row of postMetas) {
        const metaKey = getText(row['wp:meta_key']);
        const metaVal = getText(row['wp:meta_value']);

        if (metaKey === '_wp_attachment_image_alt') {
            attachmentAlt = metaVal;
        }
    }

    return {
        id: attachmentKey,
        url: attachmentUrl,
        description: attachmentDesc,
        title: attachmentTitle,
        alt: attachmentAlt,
        width: meta?._wp_attachment_metadata?.width,
        height: meta?._wp_attachment_metadata?.height
    };
};

const processAttachments = async (xml) => {
    let attachmentsOutput = [];

    const items = ensureArray(xml?.rss?.channel?.item);

    for (const post of items) {
        const postType = getText(post['wp:post_type']);

        if (postType === 'attachment') {
            attachmentsOutput.push(await processAttachment(post));
        }
    }

    return attachmentsOutput;
};

const processUsers = (xml) => {
    const usersOutput = [];

    const authors = ensureArray(xml?.rss?.channel?.['wp:author']);

    for (const user of authors) {
        usersOutput.push(processUser(user));
    }

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

    const parser = new XMLParser(parserOptions);
    const xml = parser.parse(input);

    // grab the URL of the site we're importing
    options.url = getText(xml?.rss?.channel?.link);

    // process users first, as we're using this information
    // to populate the author data for posts
    output.users = processUsers(xml);

    options.attachments = await processAttachments(xml);
    output.posts = await processPosts(xml, output.users, options);

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
