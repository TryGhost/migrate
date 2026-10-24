import type {MigrateContext, SourceRecord} from '@tryghost/mg-context';
import {slugify} from '@tryghost/string';
import {getText} from './process.js';
import {canonicalSite} from './ingest.js';
import {RecordDataError} from './types.js';

/** WordPress-specific, disk-backed indexes rebuilt from originals for each mapping. */
export class MappingState {
    constructor(
        readonly context: MigrateContext,
        readonly url: string,
        readonly site = canonicalSite(url)
    ) {
        context.db.db.exec(`DROP TABLE IF EXISTS temp.WordPressValues;
            DROP TABLE IF EXISTS temp.WordPressIndex;
            CREATE TEMP TABLE WordPressValues(namespace TEXT, key TEXT, value TEXT, PRIMARY KEY(namespace, key));
            CREATE TEMP TABLE WordPressIndex(kind TEXT, key TEXT, record_id INTEGER, PRIMARY KEY(kind, key, record_id));`);
    }

    get(namespace: string, key: string): any {
        const row = this.context.db.db
            .prepare('SELECT value FROM WordPressValues WHERE namespace = ? AND key = ?')
            .get(namespace, key) as {value: string} | undefined;
        return row ? JSON.parse(row.value) : undefined;
    }

    set(namespace: string, key: string, value: unknown): void {
        this.context.db.db
            .prepare('INSERT OR REPLACE INTO WordPressValues VALUES (?, ?, ?)')
            .run(namespace, key, JSON.stringify(value));
    }

    bind(kind: string, key: string, id: number): void {
        this.set(`binding:${kind}`, key, id);
    }

    getBinding(kind: string, key: string): number | undefined {
        return this.get(`binding:${kind}`, key);
    }

    index(kind: string, key: string, recordId: number): void {
        this.context.db.db.prepare('INSERT OR IGNORE INTO WordPressIndex VALUES (?, ?, ?)').run(kind, key, recordId);
    }

    find(kind: string, key: string): SourceRecord[] {
        const rows = this.context.db.db
            .prepare('SELECT record_id FROM WordPressIndex WHERE kind = ? AND key = ? LIMIT 2')
            .all(kind, key) as {record_id: number}[];
        return rows.map(row => this.context.sources.getById(row.record_id)!);
    }

    author(login: string): SourceRecord | undefined {
        const exact = this.find('login', login.trim());
        const records = exact.length ? exact : this.find('author-slug', slugify(login));
        if (records.length > 1) {
            throw new RecordDataError(`Ambiguous WordPress author: ${login}`);
        }
        return records[0];
    }
}

export async function sourceSite(context: MigrateContext): Promise<{url: string; site: string}> {
    let url = '';
    for await (const record of context.sources.records({kind: 'channel'})) {
        if (record.metadata.name === 'wp:base_blog_url') {
            url = getText(JSON.parse(record.content));
            break;
        }
        if (!url && record.metadata.name === 'link') {
            url = getText(JSON.parse(record.content));
        }
    }
    if (!url) {
        throw new Error('Completed WordPress source data has no site URL.');
    }
    return {url, site: canonicalSite(url)};
}

export async function indexSources(state: MappingState): Promise<void> {
    for await (const record of state.context.sources.records({kind: 'author'})) {
        const canonical = record.metadata.canonicalKey
            ? state.context.sources.get('author', String(record.metadata.canonicalKey))!
            : record;
        if (!canonical.key) {
            continue;
        }
        const login = getText(JSON.parse(record.content)['wp:author_login']);
        state.index('login', login, canonical.id);
        state.index('author-slug', slugify(login), canonical.id);
    }
    for await (const record of state.context.sources.records({kind: 'term'})) {
        if (!record.key) {
            continue;
        }
        const term = JSON.parse(record.content);
        const taxonomy = String(
            record.metadata.name === 'wp:category'
                ? 'category'
                : record.metadata.name === 'wp:tag'
                  ? 'post_tag'
                  : getText(term['wp:term_taxonomy'])
        );
        const slug = getText(term['wp:category_nicename'] || term['wp:tag_slug'] || term['wp:term_slug']);
        state.index('term', `${taxonomy}:${slug}`, record.id);
        const name = getText(term['wp:cat_name'] || term['wp:tag_name'] || term['wp:term_name']);
        state.index('term-name', JSON.stringify([`${taxonomy}:${slug}`, name]), record.id);
    }
}
