import {slugify} from '@tryghost/string';
import {dateUtils} from '@tryghost/mg-utils';
import {richContentToHtml} from './rich-content.js';
import {wixImageUriToUrl} from './wix-image.js';
import type {WixOptions, WixRow} from './types.js';

/** A tag named by a Wix `Main Category`, `Categories` or `Tags` value. */
export interface WixTag {
    name: string;
    slug: string;
}

/** The fields, dates, tags and author name of one Wix CSV row. */
export interface ProcessedRow {
    fields: {
        title: string;
        slug: string;
        type: 'post';
        status: 'published' | 'draft';
        visibility: 'public';
        featured: boolean;
        comment_id: string | null;
        custom_excerpt: string | null;
        feature_image: string | null;
        plaintext: string | null;
        html: string;
    };
    /** The post's URL on the live site, or `''` when the row has no `Post Page URL`. */
    url: string;
    /** The valid `Published Date`, or `null`. */
    published: Date | null;
    /** `Last Published Date`, or `null`. */
    lastPublished: Date | null;
    /** Public tags in column order, then `#wix`. */
    tags: WixTag[];
    author: string;
}

/** The internal tag added to every post. */
export const WIX_TAG: WixTag = {name: '#wix', slug: 'hash-wix'};

export function parseBoolean(value?: string): boolean {
    return typeof value === 'string' && value.toLowerCase() === 'true';
}

/** The values of a `Categories` or `Tags` cell: a JSON array of strings (older exports) or one plain value. */
export function parseIdArray(value?: string): string[] {
    const trimmed = value?.trim();

    if (!trimmed) {
        return [];
    }

    try {
        const parsed = JSON.parse(trimmed);

        if (!Array.isArray(parsed)) {
            return [];
        }

        return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    } catch {
        return [trimmed];
    }
}

export function uniqueIds(ids: string[]): string[] {
    return [...new Set(ids.filter(Boolean))];
}

const looksLikeWixId = (value: string) => {
    return /^[a-f0-9]{24}$/i.test(value);
};

function createTag(value: string): WixTag {
    return {name: value, slug: looksLikeWixId(value) ? value : slugify(value)};
}

/**
 * The row's tags: its `Main Category`, `Categories` and `Tags`, each included unless its option is `false`, then
 * `#wix`. Older exports list category IDs in `Categories` and the main category's name in `Main Category`; the
 * main category's ID is then dropped from the categories.
 */
export function rowTags(row: WixRow, options: WixOptions = {}): WixTag[] {
    const categories = parseIdArray(row.Categories);
    const tags = parseIdArray(row.Tags);
    const mainCategory = row['Main Category'];
    const includeMainCategory = options.includeMainCategory !== false;
    const includeCategories = options.includeCategories !== false;
    const includeTags = options.includeTags !== false;
    const shouldDropLegacyMainCategoryId =
        mainCategory && !looksLikeWixId(mainCategory) && categories[0] && looksLikeWixId(categories[0]);
    const secondaryCategories = shouldDropLegacyMainCategoryId ? categories.slice(1) : categories;
    const orderedCategories = uniqueIds([
        ...(includeMainCategory && mainCategory ? [mainCategory] : []),
        ...(includeCategories ? secondaryCategories : [])
    ]);

    return [...uniqueIds([...orderedCategories, ...(includeTags ? tags : [])]).map(createTag), WIX_TAG];
}

/** The row's author name, else the default author name, else `Author`. */
export function authorName(row: WixRow, options: WixOptions = {}): string {
    return row.Author?.trim() || options.defaultAuthorName?.trim() || 'Author';
}

/** A `Post Page URL` made absolute against the site URL; an absolute URL is returned unchanged. */
export function buildPostUrl({url, path}: {url?: string | null; path?: string}): string {
    if (!url || !path) {
        return path || '';
    }

    if (path.startsWith('http://') || path.startsWith('https://')) {
        return path;
    }

    return `${url}${path.startsWith('/') ? '' : '/'}${path}`;
}

/** The slugified `Slug`, else the slugified title, else `untitled`. */
export function createSlug({slug, title}: {slug?: string; title?: string}): string {
    return slugify(slug ?? '') || slugify(title ?? '') || 'untitled';
}

/**
 * Convert one Wix CSV row to Ghost post fields. `Rich Content` becomes the HTML, falling back to `Plain Content`;
 * a row with a `Published Date` is published, even when the date cannot be read, and one without is a draft. Dates
 * are parsed but not checked.
 */
export function processRow(row: WixRow, options: WixOptions = {}): ProcessedRow {
    const published = dateUtils.parseDate(row['Published Date']) ?? null;
    const slug = createSlug({slug: row.Slug, title: row.Title});

    return {
        fields: {
            title: row.Title || slug,
            slug,
            type: 'post',
            status: row['Published Date']?.trim() ? 'published' : 'draft',
            visibility: 'public',
            featured: parseBoolean(row.Featured),
            comment_id: row['Internal ID'] || null,
            custom_excerpt: row.Excerpt || null,
            feature_image: wixImageUriToUrl(row['Cover Image']),
            plaintext: row['Plain Content'] || null,
            html: richContentToHtml({richContent: row['Rich Content'], plainContent: row['Plain Content']})
        },
        url: buildPostUrl({url: options.url, path: row['Post Page URL']}),
        published,
        lastPublished: dateUtils.parseDate(row['Last Published Date']) ?? null,
        tags: rowTags(row, options),
        author: authorName(row, options)
    };
}
