import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';
import type {CuratedIssue, ImageCache} from '../index.js';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

export const IMAGE = 'a174e606-7a19-4c86-9f18-1c528a54643a.png';

/** A 1×1 PNG. */
export const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);

/** The fixture issue, number 12. */
export async function issueFixture(): Promise<CuratedIssue> {
    return JSON.parse(await readFile(join(fixtures, '12.json'), 'utf8'));
}

/** An issue like the fixture, with another number, URL and date. */
export async function issue(number: number, values: Partial<CuratedIssue> = {}): Promise<CuratedIssue> {
    return {
        ...(await issueFixture()),
        number,
        title: `Issue ${number}`,
        url: `https://example.com/issues/${number}`,
        ...values
    };
}

/** The files of an export holding `issues`, by number, with the fixture's image beside issue 12. */
export async function exportFiles(issues: CuratedIssue[]): Promise<Record<string, string | Buffer>> {
    const files: Record<string, string | Buffer> = {};
    for (const item of issues) {
        files[`data-export/issues/published/${item.number}/${item.number}.json`] = JSON.stringify(item);
    }
    if (issues.some(item => item.number === 12)) {
        files[`data-export/issues/published/12/${IMAGE}`] = PNG;
    }
    return files;
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-curated-export-test-'));
    directories.push(directory);
    return directory;
}

/** Write `files` (path in the zip → contents) into a zip, and return its path. */
export async function makeZip(files: Record<string, string | Buffer>): Promise<string> {
    const directory = await tempDirectory();
    const content = join(directory, 'content');
    await mkdir(content);
    for (const [path, contents] of Object.entries(files)) {
        await mkdir(dirname(join(content, path)), {recursive: true});
        await writeFile(join(content, path), contents);
    }
    const result = await fsUtils.zip.write(directory, content, 'export.zip');
    return result.path;
}

export interface TestFileCache extends ImageCache {
    imageDir: string;
}

/** A file cache in a temporary directory. */
export async function fileCache(): Promise<TestFileCache> {
    return new fsUtils.FileCache('curated-test', {tmpPath: await tempDirectory()});
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

/** A context holding the ingested export of `files`, with its images written to `cache`. */
export async function ingested(files: Record<string, string | Buffer>, cache?: ImageCache): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(await makeZip(files), context, {fileCache: cache ?? (await fileCache())});
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
