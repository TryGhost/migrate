import {domUtils} from '@tryghost/mg-utils';
import string from '@tryghost/string';
import processContent from './process-content.js';

const sectionTags = ['aside', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'img'];

const processMeta = ({name, parsed, options}) => {
    const mediumAsCanonical = options?.mediumAsCanonical ?? false;

    let urlInfo;

    const dateNow = new Date();

    const post = {
        url: parsed.$('.p-canonical')[0]?.getAttribute('href'),
        data: {
            title: parsed.$('.p-name')[0]?.textContent || '',
            custom_excerpt: (parsed.$('.p-summary')[0]?.textContent || '').trim()
        }
    };

    if (/^(?:posts\/)?draft/.test(name)) {
        urlInfo = name.match(/_(.*?)-([0-9a-f]+)\.html/);
        const footerLink = parsed.$('footer p a')[0];
        post.url = footerLink?.getAttribute('href');
        post.data.status = 'draft';
        post.data.created_at = dateNow;
        post.data.updated_at = dateNow;
    } else {
        urlInfo = post.url.match(/([^/]*?)-([0-9a-f]+)$/);

        // urlInfo can be null if the canonical url is a profile url followed by ID, without a post title slug
        // i.e. https://medium.com/@username/1234567890, instead of https://medium.com/@username/post-title-1234567890
        if (urlInfo === null) {
            urlInfo = name.match(/_(.*?)-([0-9a-f]+)\.html/);
        }

        post.data.status = 'published';
        const publishedDatetime = parsed.$('.dt-published')[0]?.getAttribute('datetime');
        post.data.created_at = publishedDatetime || dateNow;
        post.data.published_at = publishedDatetime || dateNow;
        post.data.updated_at = publishedDatetime || dateNow;
    }

    if (mediumAsCanonical) {
        const canonicalUrl = parsed.$('.p-canonical')[0]?.getAttribute('href');
        post.data.canonical_url = canonicalUrl;
    }

    // Ensure the slug is clean and valid according to Ghost
    post.data.slug = string.slugify(urlInfo[1]);
    // Store the medium ID in the comment ID legacy field - not sure if this is useful
    post.data.comment_id = urlInfo[2];

    return post;
};

const processAuthor = ({pAuthor}) => {
    const href = pAuthor.getAttribute('href');
    return {
        url: href,
        data: {
            name: pAuthor.textContent,
            slug: href.replace(/.*?@(.*?)$/, (m, p) => p.toLowerCase()),
            roles: [
                'Contributor'
            ]
        }
    };
};

const processTags = ({tagLinks}) => {
    return tagLinks.map((tag) => {
        const href = tag.getAttribute('href');
        return {
            url: href,
            data: {
                name: tag.textContent,
                slug: href.replace(/.*\/(.*?)$/, (m, p) => p.toLowerCase())
            }
        };
    });
};

const processFeatureImage = ({html, post, options}) => {
    const parsed = domUtils.parseFragment(html);

    // Look for data-is-featured
    let featured = parsed.$('[data-is-featured]')[0] || null;

    // Look for an image that appears before content
    let allSections = parsed.$(sectionTags.join(','));
    let foundImg = false;
    let preImageTags = [];

    allSections.forEach((el) => {
        if (!foundImg) {
            preImageTags.push(el.tagName.toLowerCase());
        }

        if (!foundImg && el.tagName.toLowerCase() === 'img') {
            foundImg = el;
        }
    });

    // We don't have a designated feature image, but there's an image above the content so use that image instead
    if (!featured && !preImageTags.includes('p')) {
        featured = foundImg;

        if (options?.addPlatformTag) {
            // tag it with #auto-feature-image so we can tell the difference
            post.data.tags.push({
                data: {
                    name: '#auto-feature-image'
                }
            });
        }
    }

    if (featured) {
        post.data.feature_image = featured.getAttribute('src');
        post.data.feature_image_alt = featured.getAttribute('alt') || null;
        const figure = featured.closest('figure');
        const figcaption = figure ? figure.querySelector('figcaption') : null;
        post.data.feature_image_caption = figcaption ? domUtils.serializeChildren(figcaption).trim() : null;

        if (figure) {
            figure.remove();
        }
    }

    return parsed.html().trim();
};

export default ({name, html, globalUser, options}) => {
    const parsed = domUtils.parseFragment(html);

    let post = processMeta({name, parsed, options});

    // Process author
    const pAuthor = parsed.$('.p-author')[0];
    if (pAuthor) {
        post.data.author = processAuthor({pAuthor});
    } else if (globalUser) {
        post.data.author = globalUser;
    }

    post.data.tags = [];

    if (options?.addTag) {
        post.data.tags.push({
            url: 'migrator-added-tag',
            data: {
                name: options.addTag
            }
        });
    }

    // Process tags
    const tagLinks = parsed.$('.p-tags a');
    if (tagLinks.length) {
        post.data.tags = [...post.data.tags, ...processTags({tagLinks})];
    }

    if (options?.addPlatformTag) {
        post.data.tags.push({
            url: 'migrator-added-platform-tag',
            data: {
                name: '#medium'
            }
        });
    }

    // Process content
    const eContent = parsed.$('.e-content')[0];
    const contentHtml = eContent ? domUtils.serializeChildren(eContent) : '';
    post = processContent({html: contentHtml, post});

    // Grab the featured image
    // Do this last so that we can add tags to indicate feature image style
    post.data.html = processFeatureImage({html: post.data.html, post, options});

    return post;
};
