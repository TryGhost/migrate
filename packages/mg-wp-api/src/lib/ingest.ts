import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {tasks, selectBatch, type ApiUser, type FetchOptions, type TaskContext} from './fetch.js';

export interface IngestOptions extends FetchOptions {
    /** Replace completed source data. Without it, ingesting into a context that has source data throws. */
    replace?: boolean;
    /** Fetch one content page (1-based) plus users, as with `--batch`. */
    batch?: number;
    apiUser?: ApiUser | null;
    /** Users read from a `--users` file; these replace the users endpoint. */
    usersJSON?: any[] | null;
    /** Called with each page's title before it is fetched. */
    onProgress?: (title: string) => void;
}

export function canonicalSite(value: string): string {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('WordPress site URLs must use HTTP or HTTPS.');
    }
    return url.host.toLowerCase() + url.pathname.replace(/\/+$/, '');
}

/** Yield the source records for every selected API page, one page at a time, without storing them. */
export async function* parse(
    url: string,
    {batch = 0, apiUser, usersJSON, onProgress, ...options}: Omit<IngestOptions, 'replace'> = {}
): AsyncGenerator<SourceRecordInput> {
    for (const task of selectBatch(await tasks(url, {options, apiUser, usersJSON}), batch)) {
        onProgress?.(task.title);
        yield* await task.records();
    }
}

/**
 * Fetch the WordPress REST API into `context.sources`. Posts, pages and custom post types become `content`
 * records and users become `user` records, keyed `<type>:id:<n>`. An object returned twice while paging keeps
 * its most recently modified version.
 */
export async function ingest(
    url: string,
    context: MigrateContext,
    {replace = false, batch = 0, apiUser, usersJSON, onProgress, ...options}: IngestOptions = {}
): Promise<void> {
    const metadata = {
        adapter: 'wp-api',
        url,
        limit: options.limit ?? 100,
        cpt: options.cpt ?? [],
        postsBefore: options.postsBefore ?? null,
        postsAfter: options.postsAfter ?? null,
        maxPosts: options.maxPosts ?? 0,
        batch,
        usersFile: Boolean(usersJSON)
    };
    await context.sources.ingest({replace, metadata}, async stage => {
        const ctx: TaskContext = {options, apiUser, usersJSON, sourceIngestion: stage};
        for (const task of selectBatch(await tasks(url, ctx), batch)) {
            onProgress?.(task.title);
            await task.task(ctx);
        }
    });
}

/** The site URL stored with the completed ingestion. */
export function sourceSite(context: MigrateContext): {url: string; site: string} {
    const url = context.sources.currentIngestion?.metadata.url;
    if (typeof url !== 'string') {
        throw new Error('Completed WordPress API source data has no site URL.');
    }
    return {url, site: canonicalSite(url)};
}
