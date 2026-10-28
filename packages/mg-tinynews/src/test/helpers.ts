import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';
import type {TinyNewsArticle, TinyNewsAuthor, TinyNewsInput, TinyNewsNewsletter} from '../index.js';

export const fixtures = fileURLToPath(new URL('../../src/test/fixtures/', import.meta.url));

export async function fixture(name: string): Promise<any> {
    return JSON.parse(await readFile(join(fixtures, name), 'utf8'));
}

/** An article like the first fixture, with its own ID, slug, URL and headline. */
export async function article(id: number, values: Partial<TinyNewsArticle> = {}): Promise<TinyNewsArticle> {
    const [base] = await fixture('articles.json');
    return {
        ...base,
        id,
        slug: `article-${id}`,
        live_url: `https://demo-site.example.com/articles/news/article-${id}`,
        translations: [{...base.translations[0], headline: `Article ${id}`}],
        ...values
    };
}

const directories: string[] = [];

/** A new temporary directory, removed by `cleanUp()`. */
export async function tempDirectory(): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-tinynews-test-'));
    directories.push(directory);
    return directory;
}

export interface ExportFiles {
    articles?: TinyNewsArticle[] | string;
    pages?: TinyNewsArticle[] | string;
    newsletters?: TinyNewsNewsletter[] | string;
    authors?: TinyNewsAuthor[] | string;
}

/** Write an export's JSON files into a new directory: arrays in the export's shape, strings as they are. */
export async function writeExport(files: ExportFiles): Promise<TinyNewsInput> {
    const directory = await tempDirectory();
    const input: Record<string, string> = {};
    const shapes: Record<string, (items: unknown[]) => unknown> = {
        articles: items => items,
        pages: items => items,
        newsletters: items => ({data: {newsletter_editions: items}}),
        authors: items => ({data: {authors: items}})
    };
    for (const [option, contents] of Object.entries(files)) {
        input[option] = join(directory, `${option}.json`);
        await writeFile(
            input[option],
            typeof contents === 'string' ? contents : JSON.stringify(shapes[option](contents))
        );
    }
    return input as unknown as TinyNewsInput;
}

/** The package's fixtures as an export. */
export function fixtureInput(authors = 'author-multiple.json'): TinyNewsInput {
    return {
        articles: join(fixtures, 'articles.json'),
        pages: join(fixtures, 'pages.json'),
        newsletters: join(fixtures, 'newsletters.json'),
        authors: join(fixtures, authors)
    };
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

/** A context holding the ingested `input`. */
export async function ingested(input: TinyNewsInput): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(input, context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
