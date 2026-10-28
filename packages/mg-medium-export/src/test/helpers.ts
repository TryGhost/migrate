import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import fsUtils from '@tryghost/mg-fs-utils';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/export/', import.meta.url));

/** A fixture file's contents, by its path under `fixtures/export`. */
export function fixture(path: string): Promise<string> {
    return readFile(join(fixtures, path), 'utf8');
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-medium-export-test-'));
    directories.push(directory);
    return directory;
}

/** Write `files` (path in the zip → contents) into a zip named `name` in `directory`, and return its path. */
export async function makeZip(
    files: Record<string, string>,
    {directory, name = 'export.zip'}: {directory?: string; name?: string} = {}
): Promise<string> {
    directory ??= await tempDirectory();
    const content = await mkdtemp(join(tmpdir(), 'mg-medium-export-content-'));
    try {
        for (const [path, contents] of Object.entries(files)) {
            await mkdir(dirname(join(content, path)), {recursive: true});
            await writeFile(join(content, path), contents);
        }
        const result = await fsUtils.zip.write(directory, content, name);
        return result.path;
    } finally {
        await rm(content, {recursive: true, force: true});
    }
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

export interface PostPage {
    title?: string;
    subtitle?: string;
    body?: string;
    /** The author link, or `null` for none. */
    author?: {name: string; url: string} | null;
    date?: string;
    canonical?: string;
    tags?: string[];
}

/** A Medium export post page; published unless its file name starts with `draft_`. */
export function postPage({
    title = 'A Post',
    subtitle = '',
    body = '<p>First paragraph.</p><p>Second paragraph.</p>',
    author = {name: 'Joe Bloggs', url: 'https://medium.com/@JoeBloggs'},
    date = '2020-01-02T03:04:05.000Z',
    canonical,
    tags = []
}: PostPage = {}): string {
    const tagLinks = tags.map(tag => `<a href="https://medium.com/tag/${tag.toLowerCase()}" class="p-tag">${tag}</a>`);
    return `<!DOCTYPE html><html><body><article class="h-entry">
<header><h1 class="p-name">${title}</h1></header>
<section data-field="subtitle" class="p-summary">${subtitle}</section>
<section data-field="body" class="e-content">${body}</section>
<footer>
${tags.length ? `<p class="p-tags">Tagged in ${tagLinks.join(', ')}</p>` : ''}
${author ? `<p>By <a href="${author.url}" class="p-author h-card">${author.name}</a> on <time class="dt-published" datetime="${date}">A date</time>.</p>` : ''}
${canonical ? `<p><a href="${canonical}" class="p-canonical">Canonical link</a></p>` : '<p><a href="https://medium.com/p/0">View original.</a></p>'}
</footer></article></body></html>`;
}

/** A Medium export profile page. */
export function profilePage({
    name = 'Joe Bloggs',
    handle = 'JoeBloggs',
    email = 'joe@example.org',
    photo = 'https://cdn-images-1.medium.com/joe.jpeg'
}: {name?: string; handle?: string | null; email?: string | null; photo?: string} = {}): string {
    return `<!DOCTYPE html><html><body><section class="h-card"><h3 class="p-name">${name}</h3>
<img class="u-photo" src="${photo}"><ul>
${handle ? `<li><b>Profile:</b> <a class="u-url" href="https://medium.com/@${handle}">@${handle}</a></li>` : ''}
${email ? `<li><b>Email address:</b> ${email}</li>` : ''}
<li><b>Created at:</b> 2014-07-28 10:24 am</li>
<li><b>Twitter:</b> <a href="https://twitter.com/${handle}">@${handle}</a></li>
</ul></section></body></html>`;
}
