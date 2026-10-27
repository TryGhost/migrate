import {basename} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';

// A Substack export holds `posts.csv` and `posts/<id>.<slug>.html`, optionally inside one top-level directory.
const isPostsCsv = (name: string) => name === 'posts.csv' || name.endsWith('/posts.csv');
const isPostHtml = (name: string) => /^posts\/.*\.html$/.test(name) || /\/posts\/.*\.html$/.test(name);
const isContent = (entry: {name: string; isDirectory: boolean}) =>
    !entry.isDirectory && (isPostsCsv(entry.name) || isPostHtml(entry.name));

/** Count the post HTML files in a Substack export without reading them. */
export async function contentStats(pathToZip: string): Promise<{posts: number}> {
    let posts = 0;
    for await (const entry of fsUtils.zip.entries(pathToZip, {filter: isContent})) {
        posts += Number(isPostHtml(entry.name));
    }
    return {posts};
}

/**
 * Yield the export's originals one at a time without storing them: each `posts.csv` row as a `post` record keyed
 * by its `post_id`, and each `posts/*.html` file as an `html` record keyed by its file name.
 */
export async function* parse(pathToZip: string): AsyncGenerator<SourceRecordInput> {
    let csvFiles = 0;
    for await (const entry of fsUtils.zip.entries(pathToZip, {filter: isContent})) {
        if (isPostsCsv(entry.name)) {
            csvFiles += 1;
            let row = 0;
            for await (const data of fsUtils.csv.streamRows(await entry.stream())) {
                row += 1;
                yield {
                    kind: 'post',
                    key: data.post_id || undefined,
                    content: JSON.stringify(data),
                    format: 'json',
                    metadata: {file: entry.path, row}
                };
            }
        } else {
            yield {
                kind: 'html',
                key: basename(entry.name),
                content: (await entry.read()).toString('utf8'),
                format: 'html',
                metadata: {file: entry.path}
            };
        }
    }
    if (!csvFiles) {
        throw new Error(`${pathToZip}: No posts.csv found in the Substack export`);
    }
}

/**
 * Read a Substack export zip into `context.sources`. A `post_id` or file name that appears twice keeps its first
 * record, and a differing duplicate is reported as a `source:conflict`. Explicit `replace: true` is required when
 * completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToZip: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'substack', file: basename(pathToZip)}}, async stage => {
        for await (const record of parse(pathToZip)) {
            stage.reconcile(record);
        }
    });
}
