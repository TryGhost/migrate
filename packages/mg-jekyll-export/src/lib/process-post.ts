import MarkdownIt from 'markdown-it';
import {slugify} from '@tryghost/string';
import {RecordDataError} from '@tryghost/mg-context';
import {load, Schema, timestampTag, YAML11_SCHEMA} from 'js-yaml';
import processHtml from './process-html.js';
import type {JekyllOptions, JekyllPost, JekyllTag} from './types.js';

const md = new MarkdownIt({
    html: true
});

/**
 * Jekyll reads front matter as YAML 1.1. Timestamps stay strings, so `parseDate()` reads every date the same way,
 * rejecting impossible dates that YAML would roll over (such as `2021-02-30`).
 */
const schema = new Schema(YAML11_SCHEMA.tags.filter(tag => tag !== timestampTag));

// Front matter sits between `---` lines (or `= yaml =` and `...`), and may be empty.
const frontMatterPattern = /^\uFEFF?(---|= yaml =)\r?\n(?:([\s\S]*?)\r?\n)?(?:\1|\.\.\.)[ \t]*(?:\r?\n|$)/;

/** A post file's path: `_posts/` or `_drafts/`, optional subdirectories, an optional date, and the extension. */
const FILE = /^(?:.*\/)?(?:(\d{4})-(\d{1,2})-(\d{1,2})-)?([^/]*)\.(md|markdown|html)$/;

/**
 * Split a post file into its front matter attributes and body. A file without front matter has no attributes, and
 * front matter that is not a YAML mapping is ignored. Invalid YAML is a `RecordDataError`.
 */
export function parseFrontMatter(contents: string): {attributes: Record<string, unknown>; body: string} {
    const match = contents.match(frontMatterPattern);
    if (!match) {
        return {attributes: {}, body: contents};
    }
    const yaml = match[2]?.trim();
    let attributes: unknown;
    try {
        attributes = yaml ? load(yaml, {schema}) : {};
    } catch (error) {
        throw new RecordDataError(`Invalid front matter: ${(error as Error).message.split('\n')[0]}`);
    }
    return {
        attributes:
            attributes && typeof attributes === 'object' && !Array.isArray(attributes)
                ? (attributes as Record<string, unknown>)
                : {},
        body: contents.slice(match[0].length)
    };
}

/** A UTC date from its parts, or `null` when a part is out of range (such as February 30th or 25:00). */
function utcDate(year: number, month: number, day: number, hours = 0, minutes = 0, seconds = 0): Date | null {
    const date = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
    const valid =
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day &&
        date.getUTCHours() === hours &&
        date.getUTCMinutes() === minutes &&
        date.getUTCSeconds() === seconds;
    return valid ? date : null;
}

const DATE =
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:(?:[Tt]|[ \t]+)(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(?:[ \t]*(Z|UTC|GMT|[-+]\d{1,2}(?::?\d{2})?))?$/i;

/**
 * Read a front matter date, which Jekyll writes as `YYYY-MM-DD HH:MM:SS +/-TTTT`; the time, seconds and offset
 * are optional, and a `T` may separate the date and time. A date without an offset is read as UTC. Returns `null`
 * for anything else.
 */
export function parseDate(value: unknown): Date | null {
    const match = typeof value === 'string' ? value.trim().match(DATE) : null;
    if (!match) {
        return null;
    }
    const [, year, month, day, hours = '0', minutes = '0', seconds = '0', fraction = '', zone = 'Z'] = match;
    const date = utcDate(+year, +month, +day, +hours, +minutes, +seconds);
    if (!date) {
        return null;
    }
    const offset = zone.match(/^([-+])(\d{1,2}):?(\d{2})?$/);
    const offsetMinutes = offset ? (offset[1] === '-' ? -1 : 1) * (+offset[2] * 60 + +(offset[3] ?? 0)) : 0;
    return new Date(date.getTime() + Number(`0.${fraction}`) * 1000 - offsetMinutes * 60_000);
}

/** A trimmed string or number, or `undefined` when the value is neither or blank. */
function text(value: unknown): string | undefined {
    return typeof value === 'string' || typeof value === 'number' ? String(value).trim() || undefined : undefined;
}

/** Jekyll lists are a YAML list, or a space-separated string. */
function list(value: unknown): string[] {
    const items = Array.isArray(value) ? value.map(text) : (text(value)?.split(/\s+/) ?? []);
    return items.filter((item): item is string => Boolean(item));
}

/** The fields Jekyll takes from a post's path and front matter, without its body. */
function readMeta(path: string, attributes: Record<string, unknown>) {
    const file = path.match(FILE);
    if (!file) {
        throw new Error(`Not a Jekyll post file: ${path}`);
    }
    const [, year, month, day, name] = file;
    const directory = path.split('/').slice(-2, -1)[0];
    // `basename` in the front matter overrides the slug from the file name.
    const sourceSlug = (text(attributes.basename) ?? name).replace(/^\/+|\/+$/g, '');
    const fileDate = year ? utcDate(+year, +month, +day) : null;
    return {
        sourceSlug,
        slug: slugify(sourceSlug) || slugify(text(attributes.title) ?? '') || 'post',
        title: text(attributes.title) ?? '(Untitled)',
        status: path.startsWith('_drafts/') || attributes.published === false ? 'draft' : 'published',
        // The front matter date wins; a missing or invalid one falls back to the date in the file name.
        date: parseDate(attributes.date) ?? fileDate,
        // Posts in a subdirectory such as `_posts/notes/` get an internal tag named after it.
        postType: directory === '_posts' || directory === '_drafts' ? null : directory
    } as const;
}

/**
 * Read a post's slug, live URL fields and date from its path and front matter, without rendering its body. Throws
 * a `RecordDataError` for invalid front matter.
 */
export function readPost(path: string, contents: string): Pick<JekyllPost, 'sourceSlug' | 'date' | 'status'> {
    const {sourceSlug, date, status} = readMeta(path, parseFrontMatter(contents).attributes);
    return {sourceSlug, date, status};
}

function tag(name: string, slug: string): JekyllTag {
    return {name, slug};
}

/**
 * Process one Jekyll post file: its front matter and its Markdown or HTML body, which is converted to clean HTML.
 * `path` is the file's path from the site root, such as `_posts/2021-08-23-my-post.md` or `_drafts/my-draft.md`.
 *
 * Tags come from `category` and `categories` (as `category-` tags, first so the first category is the primary
 * tag), then `tag` and `tags`, then `options.addTags`; a `#` tag named after a subdirectory of `_posts`, and
 * `#jekyll`, come after the public tags. Throws a `RecordDataError` for invalid front matter.
 */
export function processPost(path: string, contents: string, options: Pick<JekyllOptions, 'url' | 'addTags'> = {}) {
    const {attributes, body} = parseFrontMatter(contents);
    const meta = readMeta(path, attributes);
    // `.html` bodies are kept as they are; Markdown may contain HTML too.
    const html = processHtml(path.endsWith('.html') ? body : md.render(body), options.url);

    const tags = [
        ...[...list([attributes.category].flat()), ...list(attributes.categories)].map(name =>
            tag(name, `category-${slugify(name)}`)
        ),
        ...[...list([attributes.tag].flat()), ...list(attributes.tags)].map(name => tag(name, slugify(name))),
        ...(meta.postType ? [tag(`#${meta.postType}`, `hash-${slugify(meta.postType)}`)] : []),
        tag('#jekyll', 'hash-jekyll'),
        ...(options.addTags ?? '')
            .split(',')
            .map(name => name.trim())
            .filter(Boolean)
            .map(name => tag(name, slugify(name.replace('#', 'hash-'))))
    ];
    // Public tags come first, then internal (`#`) tags, keeping their order otherwise; a repeated slug is one tag.
    tags.sort((a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#')));
    const unique = tags.filter((item, index) => tags.findIndex(other => other.slug === item.slug) === index);

    const post: JekyllPost = {
        sourceSlug: meta.sourceSlug,
        slug: meta.slug,
        title: meta.title,
        status: meta.status,
        date: meta.date,
        html,
        authors: list([attributes.author].flat()),
        tags: unique
    };
    return post;
}
