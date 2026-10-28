import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';
import type {ChorusEntry} from '../index.js';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

/** The fixture with every block type, community groups and a contributor. */
export const FULL = 'Entry:0969db64-b8d7-11ed-afa1-0242ac120001.json';
/** A fixture with one paragraph and no community groups. It has the same `uid` as the full fixture. */
export const SIMPLE = 'Entry:1234.json';

export async function entryFixture(file: string): Promise<ChorusEntry> {
    return JSON.parse(await readFile(join(fixtures, file), 'utf8'));
}

/** An entry like the simple fixture, with its own uid, URL and title. */
export async function entry(id: string, values: Partial<ChorusEntry> = {}): Promise<ChorusEntry> {
    return {
        ...(await entryFixture(SIMPLE)),
        uid: `Entry:${id}`,
        title: `Entry ${id}`,
        url: `https://example.com/2020/1/1/${id}/entry-${id}`,
        ...values
    };
}

/** Files named after each entry's uid. */
export function entryFiles(entries: ChorusEntry[]): Record<string, string> {
    return Object.fromEntries(entries.map(item => [`${item.uid}.json`, JSON.stringify(item)]));
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-chorus-test-'));
    directories.push(directory);
    return directory;
}

/** Write `files` (relative path → contents) into a new directory, and return its path. */
export async function makeDirectory(files: Record<string, string>): Promise<string> {
    const directory = join(await tempDirectory(), 'export');
    await mkdir(directory);
    for (const [path, contents] of Object.entries(files)) {
        await mkdir(dirname(join(directory, path)), {recursive: true});
        await writeFile(join(directory, path), contents);
    }
    return directory;
}

/**
 * Write `files` (path in the zip → contents) into a zip below a `chorus-export/` directory, and return its path.
 * The zip writer drops a leading `Entry:` from a name as if it were a drive letter, so the files sit in a directory.
 */
export async function makeZip(files: Record<string, string>, name = 'export.zip'): Promise<string> {
    const content = await makeDirectory(
        Object.fromEntries(Object.entries(files).map(([path, contents]) => [`chorus-export/${path}`, contents]))
    );
    const result = await fsUtils.zip.write(dirname(content), content, name);
    return result.path;
}

export async function cleanUp(): Promise<void> {
    for (const directory of directories.splice(0)) {
        await rm(directory, {recursive: true, force: true});
    }
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding the ingested export of `entries`. */
export async function ingested(entries: ChorusEntry[]): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(await makeZip(entryFiles(entries)), context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
