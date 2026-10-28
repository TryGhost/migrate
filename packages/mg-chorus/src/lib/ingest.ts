import {readFile, stat} from 'node:fs/promises';
import {basename, resolve} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecord, SourceRecordInput} from '@tryghost/mg-context';

/** A Chorus export holds each entry as `Entry:<id>.json`, beside files the migration does not use. */
const ENTRY = /(?:^|\/)(Entry:[^/]+)\.json$/;
const isEntry = (entry: {path: string; isDirectory: boolean}) => !entry.isDirectory && ENTRY.test(entry.path);

interface EntryFile {
    /** The file's path in the zip, or relative to the directory. */
    path: string;
    read(): Promise<Buffer>;
}

/** The entry files of one export zip or directory, one at a time, in archive or path order. */
async function* entryFiles(input: string): AsyncGenerator<EntryFile> {
    if ((await stat(input)).isDirectory()) {
        for (const file of await fsUtils.listInputFiles(input, '**/Entry:*.json')) {
            yield {path: file.name, read: () => readFile(file.path)};
        }
        return;
    }
    for await (const entry of fsUtils.zip.entries(input, {filter: isEntry})) {
        yield {path: entry.path, read: () => entry.read()};
    }
}

async function entryRecord(source: string, file: EntryFile): Promise<SourceRecordInput> {
    let entry: unknown;
    try {
        entry = JSON.parse((await file.read()).toString('utf8'));
    } catch (error) {
        throw new Error(`${source}: ${file.path} is not valid JSON (${(error as Error).message})`, {cause: error});
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new Error(`${source}: ${file.path} is not a Chorus entry`);
    }
    const {uid} = entry as {uid?: unknown};
    return {
        kind: 'entry',
        // Chorus names each file after the entry's `uid`; the file name is the fallback for an entry without one.
        key: typeof uid === 'string' && uid.trim() ? uid.trim() : file.path.match(ENTRY)![1],
        content: JSON.stringify(entry),
        format: 'json',
        metadata: {file: source, path: file.path}
    };
}

/**
 * Yield the originals of one or more Chorus exports one at a time without storing them: each `Entry:<id>.json`
 * file as an `entry` record keyed by the entry's `uid`. Each input is an export zip or a directory of entry files,
 * read in the order given. Rejects an input without entries, or an entry file that is not a JSON object.
 */
export async function* parse(entries: string | string[]): AsyncGenerator<SourceRecordInput> {
    for (const input of [entries].flat()) {
        const source = basename(resolve(input));
        let found = false;
        for await (const file of entryFiles(input)) {
            found = true;
            yield await entryRecord(source, file);
        }
        if (!found) {
            throw new Error(`${input}: No Chorus entries found (expected Entry:<id>.json files)`);
        }
    }
}

const updated = (content: string) => Date.parse(JSON.parse(content).updatedAt);

/** The later version of an entry wins; a tie, or a missing or invalid `updatedAt`, keeps the earlier one. */
function newer(existing: SourceRecord, incoming: SourceRecordInput): 'keep' | 'replace' {
    return updated(incoming.content) > updated(existing.content) ? 'replace' : 'keep';
}

/**
 * Read one or more Chorus export zips or directories into `context.sources`. An entry that appears more than once
 * keeps the version with the latest `updatedAt` (the first on a tie) and reports a `source:conflict` when the
 * versions differ. Explicit `replace: true` is required when completed source data exists; a failed read keeps the
 * previous data.
 */
export async function ingest(
    entries: string | string[],
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    const inputs = [entries].flat();
    if (!inputs.length) {
        throw new Error('Chorus ingestion needs at least one export zip or directory.');
    }
    const files = inputs.map(input => basename(resolve(input)));
    await context.sources.ingest({replace, metadata: {adapter: 'chorus', files}}, async stage => {
        for await (const record of parse(inputs)) {
            stage.reconcile(record, {choose: newer});
        }
    });
}
