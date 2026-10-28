import errors from '@tryghost/errors';
import type {SourceIngestion, SourceRecordInput} from '@tryghost/mg-context';
import type {LetterdropPost} from './types.js';

/** The Letterdrop posts endpoint. */
export const API_URL = 'https://app.letterdrop.com/api/v1/posts';

/** Posts requested per page. */
export const PAGE_SIZE = 20;

/** The API token to fetch with. */
export interface FetchOptions {
    apiToken: string;
}

export interface TaskContext {
    sourceIngestion?: SourceIngestion;
}

export interface FetchTask {
    title: string;
    page: number;
    /** Fetch this page's records without storing them. The page is requested once. */
    records: () => Promise<SourceRecordInput[]>;
    /** Fetch this page and write its records into `ctx.sourceIngestion`. */
    task: (ctx: TaskContext) => Promise<void>;
}

interface Page {
    records: SourceRecordInput[];
    hasNextPage: boolean;
}

/** Source records for one page of posts, keyed `post:id:<id>`. Empty entries are dropped. */
const pageRecords = (posts: LetterdropPost[], page: number): SourceRecordInput[] =>
    posts
        .filter(post => post && typeof post === 'object')
        .map(post => ({
            kind: 'post',
            key: post.id ? `post:id:${post.id}` : null,
            content: JSON.stringify(post),
            format: 'json',
            metadata: {page}
        }));

/** Remove the API token from text the API returned, in case it echoes the request. */
const redact = (text: string, apiToken: string): string => text.split(apiToken).join('[redacted]');

/** Request one page. The token travels in a header and never appears in errors. */
const fetchPage = async ({apiToken}: FetchOptions, page: number): Promise<Page> => {
    const offset = (page - 1) * PAGE_SIZE;
    let response: Response | undefined;
    let body: any;
    try {
        response = await fetch(API_URL, {
            method: 'POST',
            headers: {'api-key': apiToken},
            body: new URLSearchParams({offset: String(offset), limit: String(PAGE_SIZE)})
        });
        body = await response.json();
    } catch {
        const status = response ? `: ${response.status} ${response.statusText}` : '';
        throw new errors.InternalServerError({message: `Failed to fetch Letterdrop posts, page ${page}${status}`});
    }
    if (!response.ok) {
        const reason = typeof body?.message === 'string' ? redact(body.message, apiToken) : response.statusText;
        throw new errors.InternalServerError({
            message: `Failed to fetch Letterdrop posts, page ${page}: ${response.status} ${reason}`
        });
    }
    if (!Array.isArray(body?.data)) {
        throw new errors.InternalServerError({
            message: `Failed to fetch Letterdrop posts, page ${page}: the response has no data array`
        });
    }
    // An empty page ends paging even if the API reports another, so a stale flag cannot loop forever.
    return {
        records: pageRecords(body.data, page),
        hasNextPage: body.data.length > 0 && body.meta?.hasNextPage === true
    };
};

/** Keep the most recently updated version when paging returns a post twice. */
const writeRecords = (stage: SourceIngestion, records: SourceRecordInput[]): void => {
    for (const record of records) {
        stage.reconcile(record, {
            choose: (existing, incoming) =>
                Date.parse(JSON.parse(incoming.content).updated) > Date.parse(JSON.parse(existing.content).updated)
                    ? 'replace'
                    : 'keep'
        });
    }
};

const stageFor = (ctx: TaskContext): SourceIngestion => {
    if (!ctx.sourceIngestion) {
        throw new errors.IncorrectUsageError({
            message:
                'mg-letterdrop fetch tasks write into ctx.sourceIngestion; run them inside context.sources.ingest()'
        });
    }
    return ctx.sourceIngestion;
};

/**
 * One task per page of posts, in API order, 20 posts per page. The API only says whether another page exists, so
 * the next page's task is yielded after the previous page has been fetched, by its task or by this generator. Each
 * task writes its page into `ctx.sourceIngestion` as `post` records.
 */
async function* tasks(options: FetchOptions): AsyncGenerator<FetchTask> {
    if (!options.apiToken) {
        throw new errors.IncorrectUsageError({message: 'A Letterdrop API token is required'});
    }
    let page = 0;
    let hasNextPage: boolean;
    do {
        const number = ++page;
        let fetched: Promise<Page> | undefined;
        const load = () => (fetched ??= fetchPage(options, number));
        yield {
            title: `Fetching posts, page ${number}`,
            page: number,
            records: async () => (await load()).records,
            task: async ctx => {
                const stage = stageFor(ctx);
                writeRecords(stage, (await load()).records);
            }
        };
        hasNextPage = (await load()).hasNextPage;
    } while (hasNextPage);
}

/** Count the posts by fetching every page, without storing them. */
const discover = async (options: FetchOptions): Promise<{totals: {posts: number}}> => {
    let posts = 0;
    for await (const task of tasks(options)) {
        posts += (await task.records()).length;
    }
    return {totals: {posts}};
};

export {discover, pageRecords, tasks, writeRecords};
