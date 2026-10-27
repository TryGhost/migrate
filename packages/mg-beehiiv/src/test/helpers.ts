import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '@tryghost/mg-context';
import {ingest} from '../index.js';

export const SITE = 'https://example.beehiiv.com';

export const FIXTURE = fileURLToPath(new URL('../../src/test/fixtures/posts.csv', import.meta.url));

export const CSV_HEADER = [
    'id',
    'web_title',
    'status',
    'audience',
    'content_tags',
    'url',
    'web_subtitle',
    'email_subject_line',
    'email_preview_text',
    'content_html',
    'thumbnail_url',
    'created_at'
];

/** A row with every column, overridden by `values`. */
export function row(id: string, values: Record<string, string> = {}): Record<string, string> {
    return {
        id,
        web_title: `Title ${id}`,
        status: 'confirmed',
        audience: 'free',
        content_tags: '',
        url: `${SITE}/p/${id}`,
        web_subtitle: '',
        email_subject_line: '',
        email_preview_text: '',
        content_html: `<table><tr id="content-blocks"><p>Body ${id}</p></tr></table>`,
        thumbnail_url: '',
        created_at: '2024-01-01 00:00:00',
        ...values
    };
}

const directories: string[] = [];

/** Write `rows` as a posts CSV with `columns` and return its path. */
export async function writeCsv(rows: Record<string, string>[], columns = CSV_HEADER): Promise<string> {
    const directory = await mkdtemp(join(tmpdir(), 'mg-beehiiv-test-'));
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
export async function ingested(rows?: Record<string, string>[], columns?: string[]): Promise<MigrateContext> {
    const context = await memoryContext();
    await ingest(rows ? await writeCsv(rows, columns) : FIXTURE, context);
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
