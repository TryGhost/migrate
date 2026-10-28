import {MappingState as CoreMappingState, RecordDataError} from '@tryghost/mg-context';
import type {MigrateContext, SourceRecord} from '@tryghost/mg-context';
import {slugify} from '@tryghost/string';
import {xmlUtils} from '@tryghost/mg-utils';
import {canonicalSite} from './ingest.js';

const {getText} = xmlUtils;

/** Disk-backed WordPress indexes rebuilt from originals for each mapping. */
export class MappingState extends CoreMappingState {
    constructor(
        context: MigrateContext,
        readonly url: string,
        readonly site = canonicalSite(url)
    ) {
        super(context, 'mg-wp-xml');
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
