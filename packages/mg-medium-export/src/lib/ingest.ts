import {resolve} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';

interface InputFile {
    path: string;
    name: string;
}

// A Medium export holds `profile/profile.html` and `posts/*.html`, among files the migration does not use. Entries
// are matched by their full path: `zip.entries()` drops a directory that holds every entry from names, which for a
// zip of only `posts/` would drop `posts/` itself.
const PROFILE = /(?:^|\/)profile\/profile\.html$/;
const POST = /(?:^|\/)(posts\/[^/]+\.html)$/;
const isContent = (entry: {path: string; isDirectory: boolean}) =>
    !entry.isDirectory && (PROFILE.test(entry.path) || POST.test(entry.path));

/** The export zips to read: `pathToZip` itself, or the `*.zip` files in a directory, in name order. */
async function exportFiles(pathToZip: string): Promise<InputFile[]> {
    const files: InputFile[] = await fsUtils.listInputFiles(pathToZip, '*.zip');
    if (!files.length) {
        throw new Error(`No zip files found in ${resolve(pathToZip)}`);
    }
    return files;
}

/** Count the posts and profiles in a Medium export zip, or a directory of them, without reading them. */
export async function contentStats(pathToZip: string): Promise<{posts: number; users: number}> {
    const stats = {posts: 0, users: 0};
    for (const file of await exportFiles(pathToZip)) {
        for await (const entry of fsUtils.zip.entries(file.path, {filter: isContent})) {
            stats[PROFILE.test(entry.path) ? 'users' : 'posts'] += 1;
        }
    }
    return stats;
}

/**
 * Yield the export's originals one at a time without storing them: each zip's `profile/profile.html` as a `profile`
 * record keyed by the zip's name, and each `posts/*.html` file as a `post` record keyed by its `posts/` path, without
 * any directory the export is inside.
 * `pathToZip` may be a directory of export zips, which are read in name order. Rejects when no zip holds a profile
 * or a post.
 */
export async function* parse(pathToZip: string): AsyncGenerator<SourceRecordInput> {
    let found = false;
    for (const file of await exportFiles(pathToZip)) {
        for await (const entry of fsUtils.zip.entries(file.path, {filter: isContent})) {
            found = true;
            const profile = PROFILE.test(entry.path);
            yield {
                kind: profile ? 'profile' : 'post',
                key: profile ? file.name : entry.path.match(POST)![1],
                content: (await entry.read()).toString('utf8'),
                format: 'html',
                metadata: {file: file.name, path: entry.path}
            };
        }
    }
    if (!found) {
        throw new Error(`${pathToZip}: No Medium profile or posts found in the export`);
    }
}

/**
 * Read a Medium export zip, or a directory of them, into `context.sources`. A post path that appears in two zips
 * keeps its first record, and a differing duplicate is reported as a `source:conflict`. Explicit `replace: true`
 * is required when completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToZip: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    const files = (await exportFiles(pathToZip)).map(file => file.name);
    await context.sources.ingest({replace, metadata: {adapter: 'medium', files}}, async stage => {
        for await (const record of parse(pathToZip)) {
            stage.reconcile(record);
        }
    });
}
