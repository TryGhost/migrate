import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

export const SITE = 'https://example.substack.com';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

/** The fixture export's files, keyed by their path in the zip. */
export async function fixtureFiles(): Promise<Record<string, string>> {
    const files: Record<string, string> = {'posts.csv': await readFile(join(fixtures, 'posts.csv'), 'utf8')};
    for (const name of await readdir(join(fixtures, 'posts'))) {
        files[`posts/${name}`] = await readFile(join(fixtures, 'posts', name), 'utf8');
    }
    return files;
}

const directories: string[] = [];

/** Write `files` (path in the zip → contents) into a new zip and return its path. */
export async function makeZip(files: Record<string, string>): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-substack-test-'));
    directories.push(directory);
    const content = join(directory, 'content');
    for (const [name, contents] of Object.entries(files)) {
        await mkdir(dirname(join(content, name)), {recursive: true});
        await writeFile(join(content, name), contents);
    }
    await mkdir(content, {recursive: true});
    const result = await fsUtils.zip.write(directory, content, 'export.zip');
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

/** A context holding the ingested export made of `files`, the fixture export by default. */
export async function ingested(files?: Record<string, string>): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(await makeZip(files ?? (await fixtureFiles())), context);
    return context;
}

/** One `posts.csv` line for these values, in the fixture's column order. */
export function csvRow(values: Record<string, string>): string {
    return CSV_HEADER.split(',')
        .map(column => JSON.stringify(values[column] ?? ''))
        .join(',');
}

export const CSV_HEADER = 'post_id,post_date,is_published,email_sent_at,type,audience,title,subtitle,podcast_url';

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
