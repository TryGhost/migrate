import {URL} from 'node:url';
import {decode} from 'html-entities';
import {
    RecordDataError,
    type WordPressOptions,
    type WordPressRecord,
    type LegacyAuthor,
    type MappedPost
} from './types.js';
import {slugify} from '@tryghost/string';
import MarkdownIt from 'markdown-it';
import {processShortcodes, processContent, processExcerpt} from '@tryghost/mg-wp-api';
import {domUtils, youtubeUtils, stringUtils} from '@tryghost/mg-utils';
import {isSerialized, unserialize} from 'php-serialize';

/**
 * Fix byte counts in PHP serialized strings that may have been altered
 * by XML parsing (e.g. \r\n → \n normalization changes actual byte length
 * but the declared s:N: count still reflects the original).
 */
const fixSerializedLengths = (value: string) => {
    return value.replace(/s:\d+:"([\s\S]*?)";/g, (match, content) => {
        const byteLength = Buffer.byteLength(content, 'utf8');
        return `s:${byteLength}:"${content}";`;
    });
};

const {processFragment} = domUtils;
const {getYouTubeID} = youtubeUtils;

// Helper to ensure value is always an array
const ensureArray = (value: any): any[] => {
    if (!value) {
        return [];
    }
    return Array.isArray(value) ? value : [value];
};

// Helper to get text content from a node (handles both string and object with #text)
const getText = (node: any): string => {
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

const processUser = (user: WordPressRecord): LegacyAuthor => {
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

const processWPMeta = async (
    post: WordPressRecord,
    onWarning?: WordPressOptions['onWarning']
): Promise<Record<string, any>> => {
    let metaData: Record<string, any> = {};

    const postMetas = ensureArray(post['wp:postmeta']);

    for (const meta of postMetas) {
        let key = getText(meta['wp:meta_key']);
        let value: any = getText(meta['wp:meta_value']);

        try {
            if (isSerialized(value)) {
                value = unserialize(value, {}, {strict: false});
            }
        } catch (error) {
            // XML parsing can alter byte counts (e.g. \r\n → \n), causing
            // PHP serialized string length mismatches. Try fixing and retrying.
            try {
                value = unserialize(fixSerializedLengths(value), {}, {strict: false});
            } catch (retryError) {
                onWarning?.({key, reason: (retryError as Error).message});
            }
        }

        // Convert empty serialized arrays to empty arrays, which `php-serialize` doesn't do
        if (value === 'a:0:{}') {
            value = [];
        }

        metaData[key] = value;
    }

    return metaData;
};

const processEnclosureAudio = (metaData: Record<string, any>) => {
    const enclosure = metaData.enclosure;
    if (!enclosure || typeof enclosure !== 'string') {
        return null;
    }

    const lines = enclosure.split('\n');
    if (lines.length < 3) {
        return null;
    }

    const audioUrl = lines[0].trim();
    const mimeType = lines[2].trim();

    if (!mimeType.startsWith('audio/')) {
        return null;
    }

    const fileName = audioUrl.split('/').pop();

    return `<!--kg-card-begin: html--><audio controls style="width: 100%"><source src="${audioUrl}" type="${mimeType}"><p>Download <a href="${audioUrl}" download="${fileName}">${fileName}</a></p></audio><!--kg-card-end: html-->`;
};

// The feature images is not "connected" to the post, other than it's located
// in the sibling `<item>` node.
const processFeatureImage = (post: WordPressRecord, attachments: any[] = []) => {
    let thumbnailId = null;

    const postMetas = ensureArray(post['wp:postmeta']);

    for (const meta of postMetas) {
        const key = getText(meta['wp:meta_key']);
        const val = getText(meta['wp:meta_value']);

        if (key === '_thumbnail_id') {
            thumbnailId = val.trim();
        }
    }

    if (!thumbnailId) {
        return false;
    }

    const attachmentData = attachments.find(item => item.id === thumbnailId);

    return attachmentData;
};

const processTags = (categories: any, options: WordPressOptions = {}) => {
    const categoriesOutput: any[] = [];
    const tags: any[] = [];

    // If options.tags is false, skip post_tag (only import categories)
    const includeTags = options.tags !== false;

    let allowedTerms = ['post_tag', 'organization', 'policy', 'treaty', 'region', 'legal_regulatory'];

    if (options.customTaxonomies && Array.isArray(options.customTaxonomies)) {
        allowedTerms = allowedTerms.concat(options.customTaxonomies);
    }

    const categoriesArray = ensureArray(categories);

    for (const taxonomy of categoriesArray) {
        const domain = taxonomy['@_domain'];
        const nicename = taxonomy['@_nicename'] || slugify(getText(taxonomy));
        const name = getText(taxonomy);

        // `category` takes priority and is use as the primary tag, so gets added to the list first
        if (domain === 'category') {
            categoriesOutput.push({
                url: `/tag/${nicename}`,
                sourceKey: `${domain}:${nicename}`,
                data: {
                    slug: nicename,
                    name: decode(name)
                }
            });
        } else if (includeTags && allowedTerms.includes(domain)) {
            tags.push({
                url: `/tag/${nicename}`,
                sourceKey: `${domain}:${nicename}`,
                data: {
                    slug: nicename,
                    name: decode(name)
                }
            });
        }
    }

    return categoriesOutput.concat(tags);
};

const {stripHtml} = stringUtils;

const preProcessContent = async ({html, options = {}}: {html: string; options?: WordPressOptions}) => {
    // eslint-disable-line no-shadow
    // Drafts can have empty post bodies
    if (!html) {
        return html;
    }

    // Split content by line
    const splitIt = html.split(/\r?\n/);

    // Regexp to find lines that only contain a YouTube link
    const youTubeLine = new RegExp(
        '^((?:https?:)?\\/\\/)?((?:www|m)\\.)?((?:youtube(?:-nocookie)?\\.com|youtu\\.be))(\\/(?:[\\w\\-]+\\?v=|embed\\/|live\\/|v\\/)?)([\\w\\-]+)(\\S+)?$'
    );

    // For each line, test against the regexp above
    splitIt.forEach((line, index, theArray) => {
        if (youTubeLine.test(line.trim())) {
            const theId = getYouTubeID(line);

            const replaceWith = `<iframe loading="lazy" title="" width="160" height="9" src="https://www.youtube.com/embed/${theId}?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen=""></iframe>`;

            return (theArray[index] = replaceWith);
        }

        return (theArray[index] = line);
    });

    // Join the separated lines
    html = splitIt.join('\n');

    html = processFragment(html, parsed => {
        // Remove empty link elements, typically HTML anchors
        for (const el of parsed.$('a')) {
            if (el.innerHTML.length === 0) {
                el.remove();
            }
        }

        return parsed.html();
    });

    // Convert shortcodes here to that they don't accidently get wrapped in <p> tags by MarkdownIt
    html = await processShortcodes({html, options});

    return html;
};

const processHTMLContent = async (args: any) => {
    // If rawHtml is set, don't process the HTML and wrap content in a HTML card
    if (args?.options?.rawHtml) {
        return `<!--kg-card-begin: html-->${args.html}<!--kg-card-end: html-->`;
    }

    return await processContent({
        html: args.html,
        excerptSelector: args.excerptSelector,
        postUrl: args.postUrl,
        featureImageSrc: args.featureImageSrc ?? false,
        options: args.options,
        fileCache: args.fileCache
    });
};

const mdParser = new MarkdownIt({html: true, breaks: true});

const processPost = async (
    post: WordPressRecord,
    users: LegacyAuthor[],
    options: WordPressOptions,
    fileCache?: any
): Promise<MappedPost> => {
    const {addTag, url, excerpt, excerptSelector, featureImageCaption} = options;
    const postTypeVal = getText(post['wp:post_type']);
    const postType = postTypeVal === 'page' ? 'page' : 'post';
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
    const coAuthors: LegacyAuthor[] = [];
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
                        sourceKey: `login:${authorSlug}`,
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

    const postObj: MappedPost = {
        url: postUrl,
        wpPostType: postTypeVal,
        data: {
            slug: getText(post['wp:post_name']).replace(/(\.html)/i, ''),
            title: decode(stripHtml(getText(post.title))),
            comment_id: getText(post['wp:post_id']) || null,
            status: getText(post['wp:status']) === 'publish' ? 'published' : 'draft',
            published_at: postDate,
            created_at: postDate,
            updated_at: postDate,
            feature_image: featureImage?.url ?? null,
            feature_image_alt: featureImage?.alt ?? null,
            feature_image_caption: featureImageCaption !== false ? (featureImage?.description ?? null) : null,
            type: postType,
            // Use authors array only for multiple authors (Co-Authors Plus with 2+ authors)
            // Use single author field for backwards compatibility with single-author posts
            authors: authors.length > 0 ? authors : undefined,
            author:
                authors.length === 0
                    ? coAuthors.length === 1
                        ? coAuthors[0]
                        : users.find(user => user.data.slug === dcCreatorSlug)
                    : undefined,
            tags: []
        }
    };

    if (postObj.data.slug.trim().length === 0) {
        postObj.data.slug = slugify(postObj.data.title);
    }

    postObj.data.html = await preProcessContent({
        html: getText(post['content:encoded']),
        options
    });

    postObj.data.html = mdParser.render(postObj.data.html);

    if (excerpt && !excerptSelector) {
        const excerptText = getText(post['excerpt:encoded']);
        postObj.data.custom_excerpt = processExcerpt(excerptText);
    } else if (!excerpt && excerptSelector) {
        postObj.data.custom_excerpt = processExcerpt(postObj.data.html, excerptSelector);
    }

    postObj.data.html = await processHTMLContent({
        html: postObj.data.html,
        excerptSelector: !excerpt && excerptSelector ? excerptSelector : false,
        postUrl: postObj.url,
        featureImageSrc: featureImage?.url ?? null,
        options: {...options, skipShortcodes: true},
        fileCache: fileCache
    });

    // Check for audio enclosure in post metadata and prepend audio card
    const metaData = await processWPMeta(post, options.onWarning);
    const audioCardHTML = processEnclosureAudio(metaData);
    const hasLibsynEmbed = processFragment(postObj.data.html, p => p.$('iframe[src*="libsyn.com"]').length > 0);
    if (audioCardHTML && !hasLibsynEmbed) {
        postObj.data.html = `${audioCardHTML}${postObj.data.html}`;
    }

    // Extract Yoast SEO meta title and description
    for (const field of ['_yoast_wpseo_title', '_yoast_wpseo_metadesc']) {
        if (metaData[field] !== undefined && typeof metaData[field] !== 'string') {
            throw new RecordDataError(`WordPress metadata ${field} must be text`);
        }
    }
    if (metaData._yoast_wpseo_title) {
        postObj.data.meta_title = metaData._yoast_wpseo_title;
    }

    if (metaData._yoast_wpseo_metadesc) {
        postObj.data.meta_description = metaData._yoast_wpseo_metadesc;
    }

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
                sourceKey: `login:${getText(post['dc:creator'])}`,
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

const processAttachment = async (post: WordPressRecord) => {
    let attachmentKey = getText(post['wp:post_id']).trim();
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
        width: meta._wp_attachment_metadata?.width,
        height: meta._wp_attachment_metadata?.height
    };
};

export {
    ensureArray,
    getText,
    processUser,
    processPost,
    processWPMeta,
    processAttachment,
    processFeatureImage,
    processTags,
    preProcessContent,
    processHTMLContent
};
