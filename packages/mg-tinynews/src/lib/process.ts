import sanitizeHtml from 'sanitize-html';
import {RecordDataError} from '@tryghost/mg-context';
import {domUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import {jsonToHtml, type JsonToHtmlOptions} from './json-to-html.js';
import type {TinyNewsArticle, TinyNewsAuthor, TinyNewsNewsletter, TinyNewsTag} from './types.js';

const FACEBOOK_SDK =
    '<div id="fb-root"></div><script async defer src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v3.2"></script>';

/** A tag of a processed post. Internal tags have a `#` name and a `hash-` slug. */
export interface ProcessedTag {
    name: string;
    slug: string;
}

/** An author of a processed post. */
export interface ProcessedAuthor {
    /** Identifies the author across posts: `email:<address>` when the email is known, otherwise `name:<name>`. */
    key: string;
    name: string;
    slug: string;
    /** The author's own email, or `null` for a `<slug>@example.com` placeholder. */
    email: string | null;
    profile_image?: string;
    bio?: string;
}

/** An article, page or newsletter as Ghost post fields, without its authors. */
export interface ProcessedPost {
    /** Ghost post fields other than dates, tags and authors. Blank optional fields are `null`. */
    fields: {
        title: string;
        slug: string;
        type: 'post' | 'page';
        status: 'published' | 'draft';
        visibility: 'public';
        html: string;
        custom_excerpt: string | null;
        [field: string]: string | null;
    };
    /** The post's URL on the live site, or `null` when it has none. */
    url: string | null;
    /** When it was first published or sent, if known. */
    published: Date | null;
    /** When it was last published, if known. */
    updated: Date | null;
    /** When it was created, if known. */
    created: Date | null;
    /** Public tags first, then internal tags, one per slug. */
    tags: ProcessedTag[];
}

/** The author of posts with no author, created_by_email or single author in the authors file. */
export const DEFAULT_AUTHOR: ProcessedAuthor = {key: 'default', name: 'Author', slug: 'author', email: null};

/** The author of every newsletter. */
export const NEWSLETTER_AUTHOR: ProcessedAuthor = {
    key: 'newsletter',
    name: 'Newsletter',
    slug: 'newsletter',
    email: null
};

const TINYNEWS_TAG: ProcessedTag = {name: '#tinynews', slug: 'hash-tinynews'};
const NEWSLETTER_TAG: ProcessedTag = {name: '#newsletter', slug: 'hash-newsletter'};

/** A trimmed string, or `undefined` when the value is not a string or is blank. */
export function text(value: unknown): string | undefined {
    return (typeof value === 'string' && value.trim()) || undefined;
}

/** The text of an HTML string, trimmed. */
export function textOnly(html: string): string {
    return sanitizeHtml(html, {allowedTags: [], allowedAttributes: {}}).trim();
}

/** Tiny News writes `2023-03-24T19:45:24.257025+00:00`; a zoneless timestamp is read as UTC. */
export function parseDate(value: unknown): Date | null {
    const date = text(value)?.replace(/^(\d{4}-\d\d-\d\d) (?=\d)/, '$1T');
    if (!date) {
        return null;
    }
    const zoneless = /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(date);
    const parsed = new Date(zoneless ? `${date}Z` : date);
    return Number.isFinite(parsed.getTime()) ? parsed : null;
}

/** An HTTP or HTTPS URL, or `null`. */
export function httpUrl(value: unknown): string | null {
    const url = URL.parse(text(value) ?? '');
    return url && ['http:', 'https:'].includes(url.protocol) ? url.href : null;
}

/** Public tags first, then internal (`#`) tags, keeping their order otherwise and the first tag for each slug. */
function sortTags(tags: ProcessedTag[]): ProcessedTag[] {
    const unique = tags.filter((tag, index) => tags.findIndex(other => other.slug === tag.slug) === index);
    return unique.sort((a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#')));
}

/** A category or tag, internal when it is unpublished in Tiny News, or `null` when it has neither slug nor name. */
function processTag(tag: TinyNewsTag, title: string | undefined): ProcessedTag | null {
    const name = title ?? text(tag.slug);
    const slug = slugify(text(tag.slug) ?? name ?? '');
    if (!name || !slug) {
        return null;
    }
    return tag.published === false ? {name: `#${name}`, slug: `hash-${slug}`} : {name, slug};
}

/** An article's category, then its tags, then `#tinynews`. */
export function articleTags(item: TinyNewsArticle): ProcessedTag[] {
    const tags: (ProcessedTag | null)[] = [];
    if (item.category && typeof item.category === 'object') {
        tags.push(processTag(item.category, text(item.category.title)));
    }
    for (const entry of item.tags ?? []) {
        const tag = entry?.tag;
        if (tag && typeof tag === 'object') {
            tags.push(processTag(tag, text(tag.tag_translations?.[0]?.title)));
        }
    }
    tags.push(TINYNEWS_TAG);
    return sortTags(tags.filter((tag): tag is ProcessedTag => tag !== null));
}

/**
 * An article or page from its first translation: its fields, URL, dates and tags. The feature image is the
 * translation's main image or, for a page, the first `mainImage` block of its content. Content blocks that cannot be
 * converted are left out and passed to `onUnhandled`. Throws `RecordDataError` when the item has no translation.
 */
export function processArticle(
    item: TinyNewsArticle,
    type: 'post' | 'page',
    options: JsonToHtmlOptions = {}
): ProcessedPost {
    const translation = item.translations?.[0];
    if (!translation || typeof translation !== 'object') {
        throw new RecordDataError(`${type === 'page' ? 'Page' : 'Article'} has no translation`);
    }
    const title = text(translation.headline) ?? '(Untitled)';
    const html = jsonToHtml(translation.content, options);
    const fields: ProcessedPost['fields'] = {
        title,
        slug: text(item.slug) ?? slugify(title),
        type,
        status: translation.published ? 'published' : 'draft',
        visibility: 'public',
        html,
        custom_excerpt: text(translation.search_description) ?? null,
        og_title: text(translation.facebook_title) ?? null,
        og_description: text(translation.facebook_description) ?? null,
        twitter_title: text(translation.twitter_title) ?? null,
        twitter_description: text(translation.twitter_description) ?? null,
        meta_title: text(translation.search_title) ?? null,
        meta_description: text(translation.search_description) ?? null
    };

    if (html.includes('class="fb-post')) {
        fields.codeinjection_head = FACEBOOK_SDK;
    }

    const mainImage = translation.main_image?.children?.[0];
    const imageUrl = text(mainImage?.imageUrl);
    if (imageUrl) {
        fields.feature_image = imageUrl;
        // Tiny News shows the alt text as the caption
        fields.feature_image_alt = text(mainImage!.imageAlt) ?? null;
        fields.feature_image_caption = fields.feature_image_alt;
    }

    // A page's main image is a block of its content
    if (type === 'page' && Array.isArray(translation.content)) {
        const block = translation.content.find(contentBlock => contentBlock?.type === 'mainImage');
        const pageImage = text(block?.children?.[0]?.imageUrl);
        if (pageImage) {
            fields.feature_image = pageImage;
        }
    }

    const published = parseDate(translation.first_published_at) ?? parseDate(translation.last_published_at);
    return {
        fields,
        url: httpUrl(item.live_url),
        published,
        updated: parseDate(translation.last_published_at) ?? published,
        created: published,
        tags: articleTags(item)
    };
}

/**
 * Clean a newsletter edition's HTML: keep basic formatting, links and images, turn `<div>`s into paragraphs, and
 * remove the "Made with Letterhead" link and empty paragraphs. The result is one HTML card.
 */
export function processNewsletterContent(html: string): string {
    const cleanedContent = sanitizeHtml(html, {
        allowedTags: [
            'b',
            'i',
            'em',
            'strong',
            'a',
            'p',
            'br',
            'ul',
            'ol',
            'li',
            'blockquote',
            'figure',
            'figcaption',
            'img',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'div'
        ],
        allowedAttributes: {
            a: ['href', 'title', 'rel', 'target'],
            img: ['src', 'alt', 'title']
        },
        transformTags: {
            div: 'p'
        }
    });

    const cleanedHTML = domUtils.processFragment(cleanedContent, parsed => {
        // :contains is a jQuery-specific selector, so filter manually
        parsed.$('a').forEach(el => {
            if ((el.textContent || '').includes('Made with Letterhead')) {
                el.remove();
            }
        });

        parsed.$('p').forEach(el => {
            const innerHtml = domUtils.serializeChildren(el).trim();
            if (!innerHtml.length || innerHtml === '<br>' || innerHtml === '<br/>') {
                el.remove();
            }
        });

        return parsed.html().trim();
    });

    return `<!--kg-card-begin: html-->${cleanedHTML}<!--kg-card-end: html-->`;
}

/** A newsletter edition's URL on the live site, `<site>/newsletters/<slug>`, or `null` when it has no slug. */
export function newsletterUrl(site: string, item: TinyNewsNewsletter): string | null {
    const slug = text(item.slug);
    return slug ? `${site.replace(/\/+$/, '')}/newsletters/${slug}` : null;
}

/** A newsletter edition as a published post tagged `#newsletter` and `#tinynews`. */
export function processNewsletter(item: TinyNewsNewsletter, site: string): ProcessedPost {
    const title = text(item.headline) ?? '(Untitled)';
    const content = text(item.content);
    const published = parseDate(item.newsletter_published_at) ?? parseDate(item.newsletter_created_at);
    return {
        fields: {
            title,
            slug: text(item.slug) ?? slugify(title),
            type: 'post',
            status: 'published',
            visibility: 'public',
            html: content ? processNewsletterContent(content) : '',
            custom_excerpt: text(item.subheadline) ?? null
        },
        url: newsletterUrl(site, item),
        published,
        updated: published,
        created: parseDate(item.newsletter_created_at) ?? published,
        tags: [NEWSLETTER_TAG, TINYNEWS_TAG]
    };
}

/** A bio's text, or `undefined` when it has none. */
const cleanBio = (value: unknown): string | undefined => text(textOnly(text(value) ?? ''));

/** An author's first names and last name. */
export function authorName(author: TinyNewsAuthor): string | undefined {
    return text(`${text(author.first_names) ?? ''} ${text(author.last_name) ?? ''}`);
}

/**
 * An author nested in an article or listed in the authors file, or `null` when it has no name. The email, photo and
 * bio of `profile`, the matching author in the authors file, are preferred to the article's own.
 */
export function personAuthor(author: TinyNewsAuthor, profile?: TinyNewsAuthor | null): ProcessedAuthor | null {
    const name = authorName(author);
    if (!name) {
        return null;
    }
    const email = text(profile?.email) ?? text(author.email) ?? null;
    const result: ProcessedAuthor = {
        key: email ? `email:${email.toLowerCase()}` : `name:${name}`,
        name,
        slug: slugify(name),
        email
    };
    const image = text(profile?.photoUrl) ?? text(author.photoUrl);
    if (image) {
        result.profile_image = image;
    }
    const bio = cleanBio(profile?.translations?.[0]?.bio) ?? cleanBio(author.translations?.[0]?.bio);
    if (bio) {
        result.bio = bio;
    }
    return result;
}

/** The author for an article's `created_by_email`, named after the email's local part, or `null` when it has none. */
export function emailAuthor(value: unknown): ProcessedAuthor | null {
    const email = text(value) ?? '';
    const name = text(email.split('@')[0]);
    if (!name) {
        return null;
    }
    return {key: `email:${email.toLowerCase()}`, name, slug: slugify(name), email};
}
