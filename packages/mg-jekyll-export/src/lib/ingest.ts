import {readFile, stat} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';

/** Jekyll keeps posts in `_posts/` and drafts in `_drafts/`, at any depth below them. */
const POST = /^_(?:posts|drafts)\/.+\.(?:md|markdown|html)$/;

interface PostFile {
    /** The file's path from the site root, such as `_posts/2021-08-23-my-post.md`. */
    path: string;
    read(): Promise<Buffer>;
}

/** The post files of one site zip or directory, one at a time, in archive or path order. */
async function* postFiles(input: string): AsyncGenerator<PostFile> {
    if ((await stat(input)).isDirectory()) {
        for (const file of await fsUtils.listInputFiles(input, '_{posts,drafts}/**/*.{md,markdown,html}')) {
            yield {path: file.name, read: () => readFile(file.path)};
        }
        return;
    }
    for await (const entry of fsUtils.zip.entries(input)) {
        // Entry names drop a top-level directory holding the whole site; a zip of `_posts/` alone keeps it in `path`.
        const path = [entry.name, entry.path].find(name => POST.test(name));
        if (path) {
            yield {path, read: () => entry.read()};
        }
    }
}

/**
 * Yield the originals of a Jekyll site one at a time without storing them: each Markdown or HTML file in `_posts/`
 * or `_drafts/` as a `post` record keyed by its path from the site root, holding the file's text. `input` is a zip
 * of the site or the site's directory. Other files are not read. Rejects an input without posts.
 */
export async function* parse(input: string): AsyncGenerator<SourceRecordInput> {
    let found = false;
    for await (const file of postFiles(input)) {
        found = true;
        yield {
            kind: 'post',
            key: file.path,
            content: (await file.read()).toString('utf8'),
            format: file.path.endsWith('.html') ? 'html' : 'markdown'
        };
    }
    if (!found) {
        throw new Error(
            `${input}: No Jekyll posts found (expected .md, .markdown or .html files in _posts/ or _drafts/)`
        );
    }
}

/**
 * Read a Jekyll site zip or directory into `context.sources`. A path that appears twice in a zip keeps its first
 * copy and reports a `source:conflict` when the copies differ. Explicit `replace: true` is required when completed
 * source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    input: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest(
        {replace, metadata: {adapter: 'jekyll', file: basename(resolve(input))}},
        async stage => {
            for await (const record of parse(input)) {
                stage.reconcile(record, {choose: () => 'keep'});
            }
        }
    );
}
