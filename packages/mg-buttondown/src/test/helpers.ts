import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

export const SITE = 'https://example.com';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

/** A fixture file's contents, by its path under `fixtures`. */
export function fixture(path: string): Promise<string> {
    return readFile(join(fixtures, path), 'utf8');
}

/** The fixture export's files: `emails.json` or `emails.csv`, and both email bodies. */
export async function fixtureExport(
    list: 'emails.json' | 'emails.csv' = 'emails.json'
): Promise<Record<string, string>> {
    return {
        [list]: await fixture(list),
        'emails/plain-post.md': await fixture('emails/plain-post.md'),
        'emails/fancy-post.md': await fixture('emails/fancy-post.md')
    };
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-buttondown-test-'));
    directories.push(directory);
    return directory;
}

/** Write `files` (path in the zip → contents) into a zip, and return its path. */
export async function makeZip(files: Record<string, string>): Promise<string> {
    const directory = await tempDirectory();
    const content = join(directory, 'content');
    for (const [path, contents] of Object.entries(files)) {
        await mkdir(dirname(join(content, path)), {recursive: true});
        await writeFile(join(content, path), contents);
    }
    const result = await fsUtils.zip.write(directory, content, 'export.zip');
    return result.path;
}

/** An `emails.json` listing `emails`. */
export function emailsJson(emails: unknown[]): string {
    return JSON.stringify(emails);
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

/** A context holding the ingested export at `path`, or a zip of `files`. */
export async function ingested(input: string | Record<string, string>): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(typeof input === 'string' ? input : await makeZip(input), context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
