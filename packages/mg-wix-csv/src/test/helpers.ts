import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

export const SITE = 'https://example.com';

export const FIXTURE = fileURLToPath(new URL('../../src/test/fixtures/posts.csv', import.meta.url));

export const EMPTY_FIXTURE = fileURLToPath(new URL('../../src/test/fixtures/empty.csv', import.meta.url));

export const CSV_HEADER = [
    'Author',
    'Main Category',
    'Title',
    'Excerpt',
    'ID',
    'Tags',
    'Featured',
    'Slug',
    'Plain Content',
    'Cover Image',
    'Published Date',
    'Categories',
    'Rich Content',
    'Post Page URL',
    'Last Published Date',
    'Internal ID'
];

/** A published row with every column, overridden by `values`. */
export function row(id: string, values: Record<string, string> = {}): Record<string, string> {
    return {
        Author: 'Jane Writer',
        'Main Category': '',
        Title: `Title ${id}`,
        Excerpt: '',
        ID: id,
        Tags: '',
        Featured: 'FALSE',
        Slug: id,
        'Plain Content': `Body ${id}`,
        'Cover Image': '',
        'Published Date': '2025-01-01T00:00:00Z',
        Categories: '',
        'Rich Content': '',
        'Post Page URL': `/post/${id}`,
        'Last Published Date': '',
        'Internal ID': `internal-${id}`,
        ...values
    };
}

const directories: string[] = [];

/** Write `rows` as a posts CSV with `columns` and return its path. */
export async function writeCsv(rows: Record<string, string>[], columns = CSV_HEADER): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-wix-csv-test-'));
    directories.push(directory);
    const path = join(directory, 'posts.csv');
    const lines = rows.map(values =>
        columns.map(column => `"${(values[column] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    await writeFile(path, `${[columns.join(','), ...lines].join('\n')}\n`);
    return path;
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

/** A context holding the ingested CSV of `rows`, or the fixture CSV. */
export async function ingested(rows?: Record<string, string>[]): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(rows ? await writeCsv(rows) : FIXTURE, context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}

export async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}
