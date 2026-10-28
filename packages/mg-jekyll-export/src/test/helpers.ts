import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

/** Every fixture post, under `_posts/`. */
export async function fixturePosts(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    for (const name of await readdir(fixtures)) {
        files[`_posts/${name}`] = await readFile(join(fixtures, name), 'utf8');
    }
    return files;
}

/** A Markdown post with front matter. */
export function post(attributes: Record<string, string>, body = 'Body text.'): string {
    const lines = Object.entries(attributes).map(([key, value]) => `${key}: ${value}`);
    return `---\n${lines.join('\n')}\n---\n${body}\n`;
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-jekyll-test-'));
    directories.push(directory);
    return directory;
}

/** Write `files` (relative path → contents) into a new directory, and return its path. */
export async function makeDirectory(files: Record<string, string>): Promise<string> {
    const directory = join(await tempDirectory(), 'site');
    await mkdir(directory);
    for (const [path, contents] of Object.entries(files)) {
        await mkdir(dirname(join(directory, path)), {recursive: true});
        await writeFile(join(directory, path), contents);
    }
    return directory;
}

/** Write `files` (path in the zip → contents) into a zip, and return its path. */
export async function makeZip(files: Record<string, string>, name = 'site.zip'): Promise<string> {
    const content = await makeDirectory(files);
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

/** A context holding the ingested site zip of `files`. */
export async function ingested(files: Record<string, string>): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(await makeZip(files), context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
