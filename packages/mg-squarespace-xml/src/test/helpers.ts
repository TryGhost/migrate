import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

export const SITE = 'http://example.com';

/** The fixture export, read from `src/` because tests run from `build/`. */
export const SAMPLE = fileURLToPath(new URL('../../src/test/fixtures/sample.xml', import.meta.url));

const directories: string[] = [];

/** Write `xml` to a new file and return its path. */
export async function writeXml(xml: string): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-squarespace-test-'));
    directories.push(directory);
    const path = join(directory, 'export.xml');
    await writeFile(path, xml);
    return path;
}

export async function cleanUp(): Promise<void> {
    for (const directory of directories.splice(0)) {
        await rm(directory, {recursive: true, force: true});
    }
}

/** A Squarespace export with these channel elements (authors, items) after the site link. */
export function exportXml(channel: string, link = SITE): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Test</title><link>${link}</link>${channel}</channel></rss>`;
}

/** One `<item>` with these child elements, given as XML. Published posts by default. */
export function item(id: string | null, children = ''): string {
    const fields: Record<string, string> = {
        'wp:post_type': 'post',
        'wp:status': 'publish',
        pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
        title: `Post ${id}`,
        link: `/blog/post-${id}`
    };
    const defaults = Object.entries(fields)
        .filter(([name]) => !children.includes(`<${name}`))
        .map(([name, value]) => `<${name}>${value}</${name}>`)
        .join('');
    return `<item>${id === null ? '' : `<wp:post_id>${id}</wp:post_id>`}${defaults}${children}</item>`;
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding the ingested export at `path`, the fixture export by default. */
export async function ingested(path = SAMPLE): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(path, context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
