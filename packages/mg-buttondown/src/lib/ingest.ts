import {basename} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';

interface ZipEntry {
    path: string;
    isDirectory: boolean;
}

// A Buttondown export holds `emails.json` or `emails.csv` with each email's metadata, and `emails/<slug>.md` with
// each email's body, optionally inside one top-level directory. Entries are matched by their full path, as
// `zip.entries()` drops a directory that holds every entry from names.
const JSON_FILE = /(?:^|\/)emails\.json$/;
const CSV_FILE = /(?:^|\/)emails\.csv$/;
const BODY = /(?:^|\/)(emails\/[^/]+\.md)$/;
const isFile = (entry: ZipEntry, pattern: RegExp) => !entry.isDirectory && pattern.test(entry.path);

/** Count the email bodies in a Buttondown export without reading them. */
export async function contentStats(pathToZip: string): Promise<{posts: number}> {
    let posts = 0;
    for await (const _entry of fsUtils.zip.entries(pathToZip, {filter: (entry: ZipEntry) => isFile(entry, BODY)})) {
        posts += 1;
    }
    return {posts};
}

/** The email list to read: `emails.json` when the export has one, as the old reader preferred it, else `emails.csv`. */
async function metadataFile(pathToZip: string): Promise<RegExp> {
    let csv = false;
    const filter = (entry: ZipEntry) => isFile(entry, JSON_FILE) || isFile(entry, CSV_FILE);
    for await (const entry of fsUtils.zip.entries(pathToZip, {filter})) {
        if (JSON_FILE.test(entry.path)) {
            return JSON_FILE;
        }
        csv = true;
    }
    if (!csv) {
        throw new Error(`${pathToZip}: No emails data found in zip (expected emails.json or emails.csv)`);
    }
    return CSV_FILE;
}

/**
 * Yield the export's originals one at a time without storing them: each email in `emails.json` (or, without it, each
 * row of `emails.csv`) as an `email` record keyed by its `id`, and each `emails/*.md` file as a `body` record keyed
 * by its `emails/` path. Emails without an `id` are yielded unkeyed. Rejects an export without an email list, and one
 * whose list names emails but that has no bodies.
 */
export async function* parse(pathToZip: string): AsyncGenerator<SourceRecordInput> {
    const list = await metadataFile(pathToZip);
    let emails = 0;
    let bodies = 0;
    const filter = (entry: ZipEntry) => isFile(entry, list) || isFile(entry, BODY);
    for await (const entry of fsUtils.zip.entries(pathToZip, {filter})) {
        if (BODY.test(entry.path)) {
            bodies += 1;
            yield {
                kind: 'body',
                key: entry.path.match(BODY)![1],
                content: (await entry.read()).toString('utf8'),
                format: 'markdown',
                metadata: {file: entry.path}
            };
        } else if (list === CSV_FILE) {
            let row = 0;
            for await (const data of fsUtils.csv.streamRows(await entry.stream())) {
                row += 1;
                emails += 1;
                yield {
                    kind: 'email',
                    key: data.id || undefined,
                    content: JSON.stringify(data),
                    format: 'json',
                    metadata: {file: entry.path, row}
                };
            }
        } else {
            const data = JSON.parse((await entry.read()).toString('utf8'));
            if (!Array.isArray(data)) {
                throw new Error(`${pathToZip}: ${entry.path} is not a list of emails`);
            }
            for (const [index, email] of data.entries()) {
                emails += 1;
                yield {
                    kind: 'email',
                    key: email?.id ? String(email.id) : undefined,
                    content: JSON.stringify(email),
                    format: 'json',
                    metadata: {file: entry.path, index}
                };
            }
        }
    }
    if (emails && !bodies) {
        throw new Error(`${pathToZip}: No email bodies (emails/*.md) found in the Buttondown export`);
    }
}

/**
 * Read a Buttondown export zip into `context.sources`. An email `id` or body path that appears twice keeps its first
 * record, and a differing duplicate is reported as a `source:conflict`. Explicit `replace: true` is required when
 * completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToZip: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest(
        {replace, metadata: {adapter: 'buttondown', file: basename(pathToZip)}},
        async stage => {
            for await (const record of parse(pathToZip)) {
                stage.reconcile(record);
            }
        }
    );
}
