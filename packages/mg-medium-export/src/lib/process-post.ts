import {RecordDataError} from '@tryghost/mg-context';
import {domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import processContent from './process-content.js';
import type {MediumOptions, MediumPost, MediumRelation} from './types.js';

type ParsedFragment = ReturnType<typeof domUtils.parseFragment>;

const sectionTags = ['aside', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'img'];

/** The Medium username in a profile URL, such as `joebloggs` for `https://medium.com/@JoeBloggs`, in lower case. */
export function mediumHandle(url: string | undefined): string | undefined {
    return url?.match(/\/@([^/?#]+)/)?.[1].toLowerCase();
}

/** A published post's canonical Medium URL, from its export HTML. */
export function postUrl(html: string): string | undefined {
    return domUtils.processFragment(html, parsed => canonicalUrl(parsed));
}

function canonicalUrl(parsed: ParsedFragment): string | undefined {
    return parsed.$('.p-canonical')[0]?.getAttribute('href') ?? undefined;
}

function publishedDate(parsed: ParsedFragment): Date | undefined {
    const value = parsed.$('.dt-published')[0]?.getAttribute('datetime');
    if (!value) {
        return undefined;
    }
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        throw new RecordDataError('Invalid Medium publish date');
    }
    return date;
}

const processMeta = ({
    name,
    parsed,
    options,
    date
}: {
    name: string;
    parsed: ParsedFragment;
    options: MediumOptions;
    date: Date;
}): MediumPost => {
    const canonical = canonicalUrl(parsed);
    const draft = /^(?:posts\/)?draft/.test(name);

    let url = canonical;
    let urlInfo: RegExpMatchArray | null | undefined;
    if (draft) {
        url = parsed.$('footer p a')[0]?.getAttribute('href') ?? undefined;
        urlInfo = name.match(/_(.*?)-([0-9a-f]+)\.html/);
    } else {
        // The canonical URL can be a profile URL followed by the ID, without a slug, such as
        // https://medium.com/@username/1234567890, so fall back to the file name.
        urlInfo = canonical?.match(/([^/]*?)-([0-9a-f]+)$/) ?? name.match(/_(.*?)-([0-9a-f]+)\.html/);
    }
    if (!urlInfo) {
        throw new RecordDataError('No Medium post ID in the canonical URL or file name');
    }

    const published = draft ? undefined : (publishedDate(parsed) ?? date);
    const post: MediumPost = {
        url,
        data: {
            title: parsed.$('.p-name')[0]?.textContent || '',
            custom_excerpt: (parsed.$('.p-summary')[0]?.textContent || '').trim(),
            status: draft ? 'draft' : 'published',
            created_at: published ?? date,
            updated_at: published ?? date,
            published_at: published,
            // Ensure the slug is clean and valid according to Ghost
            slug: slugify(urlInfo[1]),
            // The Medium post ID
            comment_id: urlInfo[2],
            tags: [],
            html: ''
        }
    };

    if (options.mediumAsCanonical && canonical) {
        post.data.canonical_url = canonical;
    }

    return post;
};

const processAuthor = (pAuthor: Element): MediumRelation => {
    const href = pAuthor.getAttribute('href') ?? undefined;
    return {
        url: href,
        data: {
            name: pAuthor.textContent!.trim(),
            slug: mediumHandle(href),
            roles: ['Contributor']
        }
    };
};

const processTags = (tagLinks: Element[]): MediumRelation[] => {
    return tagLinks.map(tag => {
        const href = tag.getAttribute('href') ?? '';
        return {
            url: href,
            data: {
                name: tag.textContent!.trim(),
                slug: href.replace(/.*\/(.*?)$/, (m, p) => p.toLowerCase())
            }
        };
    });
};

const processFeatureImage = ({html, post, options}: {html: string; post: MediumPost; options: MediumOptions}) => {
    return domUtils.processFragment(html, parsed => {
        // Look for data-is-featured
        let featured: Element | null = parsed.$('[data-is-featured]')[0] || null;

        // Look for an image that appears before content
        const allSections = parsed.$(sectionTags.join(','));
        let foundImg: Element | null = null;
        const preImageTags: string[] = [];

        allSections.forEach(el => {
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

            if (options.addPlatformTag) {
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
    });
};

/**
 * Convert one `posts/*.html` file of a Medium export. `name` is its path in the export, which marks drafts and
 * holds the post ID when the canonical URL does not. Posts without a publish date, and drafts, are dated `date`.
 * Throws a `RecordDataError` when no post ID can be found or the publish date is invalid.
 */
export default ({
    name,
    html,
    options = {},
    date
}: {
    name: string;
    html: string;
    options?: MediumOptions;
    date: Date;
}): MediumPost => {
    return domUtils.processFragment(html, parsed => {
        let post = processMeta({name, parsed, options, date});

        // Process author
        const pAuthor = parsed.$('.p-author')[0];
        if (pAuthor) {
            post.data.author = processAuthor(pAuthor);
        }

        if (options.addTag) {
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
            post.data.tags = [...post.data.tags, ...processTags(tagLinks)];
        }

        if (options.addPlatformTag) {
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
    });
};
