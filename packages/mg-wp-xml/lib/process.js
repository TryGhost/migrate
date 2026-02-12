import {URL} from 'node:url';
import * as cheerio from 'cheerio';
import {slugify} from '@tryghost/string';
import errors from '@tryghost/errors';
import MarkdownIt from 'markdown-it';
import MgWpAPI from '@tryghost/mg-wp-api';
import {isSerialized, unserialize} from 'php-serialize';

const processUser = ($xml, $user) => {
    const authorSlug = slugify($xml($user).children('wp\\:author_login').text());
    const bio = $xml($user).children('wp\\:author_description').text() || '';
    const avatar = $xml($user).children('wp\\:author_avatar').text() || '';

    return {
        url: authorSlug,
        data: {
            slug: authorSlug,
            name: $xml($user).children('wp\\:author_display_name').text(),
            email: $xml($user).children('wp\\:author_email').text(),
            bio: bio || undefined,
            profile_image: avatar || undefined
        }
    };
};

const processWPMeta = async ($xml, $post) => {
    let metaData = {};

    let postMeta = $xml($post).children('wp\\:postmeta').map(async (i, meta) => {
        let key = $xml(meta).children('wp\\:meta_key').text();
        let value = $xml(meta).children('wp\\:meta_value').text();

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
const processFeatureImage = ($xml, $post, attachments) => {
    let thumbnailId = null;

    $xml($post).find('wp\\:postmeta').each((i, row) => {
        let key = $xml(row).find('wp\\:meta_key').text();
        let val = $xml(row).find('wp\\:meta_value').text();

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

const processTags = ($xml, $wpTerms, options = {}) => {
    const categories = [];
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

    $wpTerms.each((i, taxonomy) => {
        const domain = $xml(taxonomy).attr('domain');

        // `category` takes priority and is use as the primary tag, so gets added to the list first
        if (domain === 'category') {
            categories.push({
                url: `/tag/${$xml(taxonomy).attr('nicename')}`,
                data: {
                    slug: $xml(taxonomy).attr('nicename').substring(0, 190),
                    name: $xml(taxonomy).text().replace('&amp;', '&').substring(0, 190)
                }
            });
        } else if (includeTags && allowedTerms.includes(domain)) {
            // Only include tags if options.tags is not false
            tags.push({
                url: `/tag/${$xml(taxonomy).attr('nicename')}`,
                data: {
                    slug: $xml(taxonomy).attr('nicename').substring(0, 190),
                    name: $xml(taxonomy).text().replace('&amp;', '&').substring(0, 190)
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

    const $html = cheerio.load(html, {
        xml: {
            xmlMode: false,
            decodeEntities: false
        }
    }, false);

    // 👀 If any XML-specific processing needs to be done, this is the place to do it.

    // Remove empty link elements, typically HTML anchors
    $html('a').each((i, el) => {
        if ($html(el).html().length === 0) {
            $html(el).remove();
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

const processPost = async ($xml, $post, users, options) => {
    const {addTag, url, excerpt, excerptSelector, featureImageCaption} = options;
    const postTypeVal = $xml($post).children('wp\\:post_type').text();
    const postType = (postTypeVal === 'page') ? 'page' : 'post';
    const featureImage = processFeatureImage($xml, $post, options.attachments);
    const dcCreatorSlug = slugify($xml($post).children('dc\\:creator').text());

    // WP XML only provides a published date, we let's use that all dates Ghost expects
    const postDate = new Date($xml($post).children('pubdate').text());

    // This should result in an absolute URL addressable in a browser
    let postUrl = $xml($post).children('link').text();
    let parsedPostUrl = new URL(postUrl, url);
    postUrl = parsedPostUrl.href;

    // Extract authors from Co-Authors Plus format: <category domain="author" nicename="slug">Name</category>
    // This is the most common multi-author plugin for WordPress
    const coAuthors = [];
    const seenSlugs = new Set();
    $xml($post).children('category[domain="author"]').each((i, authorCat) => {
        const authorSlug = $xml(authorCat).attr('nicename');
        const authorName = $xml(authorCat).text();

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
    });

    // Build final authors array - only use for multiple authors (Co-Authors Plus)
    // For single-author posts, we use the `author` field for backwards compatibility
    const authors = coAuthors.length > 1 ? coAuthors : [];

    const post = {
        url: postUrl,
        wpPostType: postTypeVal,
        data: {
            slug: $xml($post).children('wp\\:post_name').text().replace(/(\.html)/i, ''),
            title: stripHtml($xml($post).children('title').text().substring(0, 255)),
            comment_id: $xml($post)?.find('wp\\:post_id')?.text() ?? null,
            status: $xml($post).children('wp\\:status').text() === 'publish' ? 'published' : 'draft',
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

    if (post.data.slug.trim().length === 0) {
        post.data.slug = slugify(post.data.title).substring(0, 185);
    }

    post.data.html = await preProcessContent({
        html: $xml($post).children('content\\:encoded').text(),
        options
    });

    const mdParser = new MarkdownIt({
        html: true,
        breaks: true
    });
    post.data.html = mdParser.render(post.data.html);

    if (excerpt && !excerptSelector) {
        const excerptText = $xml($post).children('excerpt\\:encoded').text();
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

    if ($xml($post).children('category').length >= 1) {
        post.data.tags = processTags($xml, $xml($post).children('category'), options);
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

    // Only set fallback author if we don't have an author and we don't have multiple authors
    if (!post.data.author && !post.data.authors) {
        if ($xml($post).children('dc\\:creator').length >= 1) {
            post.data.author = {
                url: dcCreatorSlug,
                data: {
                    slug: dcCreatorSlug
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
        const postType = $xml(post).children('wp\\:post_type').text();

        let allowedTypes = ['post', 'page'];

        if (options.cpt) {
            allowedTypes = allowedTypes.concat(options.cpt);
        }

        if (allowedTypes.includes(postType)) {
            postsOutput.push(await processPost($xml, post, users, options));
        }
    }).get();

    await Promise.all(posts);

    return postsOutput;
};

const processAttachment = async ($xml, $post) => {
    let attachmentKey = $xml($post).find('wp\\:post_id').text();
    let attachmentUrl = $xml($post).find('wp\\:attachment_url').text() || null;
    let attachmentDesc = $xml($post).find('content\\:encoded').text() || null;
    let attachmentTitle = $xml($post).find('title').text() || null;
    let attachmentAlt = null;

    let meta = await processWPMeta($xml, $post);

    $xml($post).find('wp\\:postmeta').each((i, row) => {
        let metaKey = $xml(row).find('wp\\:meta_key').text();
        let metaVal = $xml(row).find('wp\\:meta_value').text();

        if (metaKey === '_wp_attachment_image_alt') {
            attachmentAlt = metaVal;
        }
    });

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

const processAttachments = async ($xml, options) => {
    let attachmentsOutput = [];

    let posts = $xml('item').map(async (i, post) => {
        const postType = $xml(post).children('wp\\:post_type').text();

        if (['attachment'].includes(postType)) {
            attachmentsOutput.push(await processAttachment($xml, post, options));
        }
    }).get();

    await Promise.all(posts);

    return attachmentsOutput;
};

const processUsers = ($xml) => {
    const usersOutput = [];

    $xml('wp\\:author').each((i, user) => {
        usersOutput.push(processUser($xml, user));
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

    const $xml = cheerio.load(input, {
        xml: {
            decodeEntities: false,
            xmlMode: true,
            scriptingEnabled: false,
            lowerCaseTags: true // needed to find `pubDate` tags
        }
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
