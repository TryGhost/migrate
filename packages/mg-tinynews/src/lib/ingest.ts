import {basename, resolve} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecord, SourceRecordInput} from '@tryghost/mg-context';
import {authorName, text} from './process.js';
import type {TinyNewsInput} from './types.js';

/** What each input file holds, and the keys leading to its array. */
const FILES = [
    {option: 'articles', type: 'article', kind: 'post', path: []},
    {option: 'pages', type: 'page', kind: 'post', path: []},
    {option: 'newsletters', type: 'newsletter', kind: 'post', path: ['data', 'newsletter_editions']},
    {option: 'authors', type: 'author', kind: 'author', path: ['data', 'authors']}
] as const;

type FileSpec = (typeof FILES)[number];

/** The input files given, in reading order. Rejects input without an articles file. */
function inputFiles(input: TinyNewsInput): {spec: FileSpec; path: string}[] {
    if (!text(input.articles)) {
        throw new Error('Tiny News ingestion needs an articles JSON file (--articles).');
    }
    return FILES.filter(spec => text(input[spec.option])).map(spec => ({spec, path: input[spec.option]!}));
}

/** A Tiny News ID: a number, or a nonblank string. */
function id(value: unknown): string | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? String(value) : text(value);
}

/**
 * An item's key: `<type>:id:<id>` for an article, page or newsletter (`<type>:slug:<slug>` without an ID), and
 * `id:<id>` for an author (`name:<name>` without an ID). `null` when the item has none of these.
 */
function key(spec: FileSpec, item: Record<string, unknown>): string | null {
    const itemId = id(item.id);
    if (spec.kind === 'author') {
        const name = authorName(item);
        return itemId ? `id:${itemId}` : name ? `name:${name}` : null;
    }
    const slug = text(item.slug);
    return itemId ? `${spec.type}:id:${itemId}` : slug ? `${spec.type}:slug:${slug}` : null;
}

/**
 * Yield the originals of a Tiny News export one at a time without storing them. The articles and pages files are
 * JSON arrays, read one item at a time; newsletter editions are read from `data.newsletter_editions` and authors from
 * `data.authors`. Articles, pages and newsletters are `post` records whose metadata `type` is `article`, `page` or
 * `newsletter`; authors are `author` records. Rejects input without an articles file, malformed JSON, or an item that
 * is not a JSON object.
 */
export async function* parse(input: TinyNewsInput): AsyncGenerator<SourceRecordInput> {
    for (const {spec, path} of inputFiles(input)) {
        const file = basename(resolve(path));
        let index = 0;
        try {
            for await (const item of fsUtils.json.streamArray(path, {path: spec.path})) {
                if (!item || typeof item !== 'object' || Array.isArray(item)) {
                    throw new Error(`${file}: item ${index} is not a Tiny News ${spec.type}`);
                }
                yield {
                    kind: spec.kind,
                    key: key(spec, item),
                    content: JSON.stringify(item),
                    format: 'json',
                    metadata: {file, type: spec.type, index}
                };
                index += 1;
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new SyntaxError(`${file}: ${error.message}`, {cause: error});
            }
            throw error;
        }
    }
}

/** The last time a post was published, or NaN for an author or an undated post. */
const updated = (content: string) => {
    const item = JSON.parse(content);
    return Date.parse(item.translations?.[0]?.last_published_at ?? item.newsletter_published_at);
};

/** The more recently published version of a post wins; a tie, an undated post or an author keeps the earlier one. */
function newer(existing: SourceRecord, incoming: SourceRecordInput): 'keep' | 'replace' {
    return updated(incoming.content) > updated(existing.content) ? 'replace' : 'keep';
}

/**
 * Read a Tiny News export into `context.sources`. An item that appears more than once keeps the most recently
 * published version (the first on a tie) and reports a `source:conflict` when the versions differ. Explicit
 * `replace: true` is required when completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    input: TinyNewsInput,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    const files = Object.fromEntries(inputFiles(input).map(({spec, path}) => [spec.option, basename(resolve(path))]));
    await context.sources.ingest({replace, metadata: {adapter: 'tinynews', files}}, async stage => {
        for await (const record of parse(input)) {
            stage.reconcile(record, {choose: newer});
        }
    });
}
