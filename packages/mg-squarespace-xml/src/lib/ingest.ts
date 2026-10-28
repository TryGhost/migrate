import {basename} from 'node:path';
import type {JsonObject, MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {dateUtils, urlUtils, xmlUtils} from '@tryghost/mg-utils';
import type {SquarespaceRecord} from './types.js';

const {getText} = xmlUtils;

/** The host and path that scope stable Ghost IDs to one site. */
export function canonicalSite(value: string): string {
    const url = urlUtils.httpUrl(value);
    if (!url) {
        throw new Error(`Squarespace site URLs must use HTTP or HTTPS: ${value}`);
    }
    return urlUtils.canonicalSite(url);
}

/** An item's link resolved against the site URL, or `undefined` when it is blank or not an HTTP(S) URL. */
export function sourceUrl(value: string, base: string): string | undefined {
    return urlUtils.httpUrl(value, base)?.href;
}

/** The export's site URL, from the channel `link` of the completed source data. */
export async function sourceSite(context: MigrateContext): Promise<{url: string; site: string}> {
    for await (const record of context.sources.records({kind: 'channel'})) {
        if (record.metadata.name === 'link') {
            const url = getText(JSON.parse(record.content)).trim();
            return {url, site: canonicalSite(url)};
        }
    }
    throw new Error('Completed Squarespace source data has no site URL.');
}

function revision(item: SquarespaceRecord): number | undefined {
    for (const field of ['wp:post_modified_gmt', 'wp:post_modified']) {
        const date = dateUtils.parseDate(getText(item[field]));
        if (date) {
            return date.getTime();
        }
    }
    return undefined;
}

/**
 * Yield the export's originals one at a time without storing them: each `item` (post, page or attachment) keyed by
 * its `wp:post_id`, each `wp:author` keyed by its `wp:author_id`, and every other channel element, such as the site
 * `link`, as a `channel` record. Items record their position in the file as `metadata.index`.
 */
export async function* parse(pathToFile: string): AsyncGenerator<SourceRecordInput> {
    const file = basename(pathToFile);
    let site = '';
    let channelIndex = 0;
    let itemIndex = 0;
    for await (const record of xmlUtils.streamXmlRecords(pathToFile, {paths: ['rss/channel/*']})) {
        const name = record.path.split('/').pop()!;
        const value = record.value;
        const metadata: JsonObject = {file, name, line: record.line, column: record.column};
        let kind = 'channel';
        let key: string | undefined;
        if (name === 'item') {
            kind = 'item';
            metadata.index = itemIndex++;
            const id = getText(value['wp:post_id']).trim();
            const url = sourceUrl(getText(value.link || value['wp:attachment_url']), site);
            key = id ? `id:${id}` : url ? `url:${url}` : undefined;
        } else if (name === 'wp:author') {
            kind = 'author';
            const id = getText(value['wp:author_id']).trim();
            const login = getText(value['wp:author_login']).trim();
            key = id ? `id:${id}` : login ? `login:${login}` : undefined;
        } else {
            key = `${name}:${channelIndex++}`;
            if (name === 'link' && !site) {
                site = getText(value).trim();
                canonicalSite(site);
            }
        }
        yield {kind, key, content: JSON.stringify(value), format: 'json', metadata};
    }
    if (!site) {
        throw new Error(`${file}: Missing Squarespace channel site URL`);
    }
}

/**
 * Read a Squarespace export into `context.sources`. An item ID that appears twice keeps its newest revision (by
 * `wp:post_modified_gmt`, when both have one) or else its first copy, and reports a `source:conflict`; a repeated
 * author keeps its first copy. Explicit `replace: true` is required when completed source data exists; a failed
 * read keeps the previous data.
 */
export async function ingest(
    pathToFile: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest(
        {replace, metadata: {adapter: 'squarespace-xml', file: basename(pathToFile)}},
        async stage => {
            for await (const record of parse(pathToFile)) {
                stage.reconcile(record, {
                    choose: (existing, incoming) => {
                        if (incoming.kind !== 'item') {
                            return 'keep';
                        }
                        const modified = revision(JSON.parse(incoming.content));
                        const earlier = revision(JSON.parse(existing.content));
                        return modified !== undefined && earlier !== undefined && modified > earlier
                            ? 'replace'
                            : 'keep';
                    },
                    reportIdentical: record.kind === 'item'
                });
            }
        }
    );
}
