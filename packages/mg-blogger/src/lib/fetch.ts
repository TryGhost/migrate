import {setTimeout as sleep} from 'node:timers/promises';
import errors from '@tryghost/errors';
import type {SourceIngestion, SourceRecordInput} from '@tryghost/mg-context';
import type {BloggerPost} from './types.js';

/** The blogs to fetch and the API key to fetch them with. */
export interface FetchOptions {
    apiKey: string;
    blogIDs: string[];
    /** Milliseconds to wait before each request, to stay under Blogger's rate limits. Defaults to 500. */
    requestDelay?: number;
}

export interface TaskContext {
    sourceIngestion?: SourceIngestion;
}

export interface FetchTask {
    title: string;
    blogID: string;
    page: number;
    /** Fetch this page's records without storing them. The page is requested once. */
    records: () => Promise<SourceRecordInput[]>;
    /** Fetch this page and write its records into `ctx.sourceIngestion`. */
    task: (ctx: TaskContext) => Promise<void>;
}

interface Page {
    records: SourceRecordInput[];
    nextPageToken?: string;
}

/** The posts endpoint for one page of a blog. */
const postsURL = (blogID: string, apiKey: string, pageToken?: string): string => {
    const searchParams = new URLSearchParams({key: apiKey});
    if (pageToken) {
        searchParams.set('pageToken', pageToken);
    }
    return `https://www.googleapis.com/blogger/v3/blogs/${encodeURIComponent(blogID)}/posts?${searchParams}`;
};

/** Source records for one page of posts, keyed `post:id:<id>`. */
const pageRecords = (blogID: string, posts: BloggerPost[], page: number): SourceRecordInput[] =>
    posts.map(post => ({
        kind: 'post',
        key: post.id ? `post:id:${post.id}` : null,
        content: JSON.stringify(post),
        format: 'json',
        metadata: {blog: blogID, page}
    }));

/** Request one page. Errors never include the URL, which carries the API key. */
const fetchPage = async (
    {apiKey, requestDelay = 500}: FetchOptions,
    blogID: string,
    page: number,
    pageToken?: string
): Promise<Page> => {
    await sleep(requestDelay);
    let response: Response | undefined;
    let body: any;
    try {
        response = await fetch(postsURL(blogID, apiKey, pageToken));
        body = await response.json();
    } catch (error) {
        const status = response ? `: ${response.status} ${response.statusText}` : '';
        throw new errors.InternalServerError({
            message: `Failed to fetch Blogger content for blog ${blogID}${status}`,
            error
        });
    }
    if (!response.ok) {
        throw new errors.InternalServerError({
            message: `Failed to fetch Blogger content for blog ${blogID}: ${response.status} ${body?.error?.message ?? response.statusText}`
        });
    }
    return {records: pageRecords(blogID, body.items ?? [], page), nextPageToken: body.nextPageToken || undefined};
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
            message: 'mg-blogger fetch tasks write into ctx.sourceIngestion; run them inside context.sources.ingest()'
        });
    }
    return ctx.sourceIngestion;
};

/**
 * One task per page of each blog's posts, blogs in the given order and pages in API order. Blogger pages by token,
 * so the next page's task is yielded only after the previous page has been fetched, by its task or by this
 * generator. Each task writes its page into `ctx.sourceIngestion` as `post` records.
 */
async function* tasks(options: FetchOptions): AsyncGenerator<FetchTask> {
    for (const blogID of options.blogIDs) {
        let pageToken: string | undefined;
        let page = 0;
        do {
            const token = pageToken;
            const number = ++page;
            let fetched: Promise<Page> | undefined;
            const load = () => (fetched ??= fetchPage(options, blogID, number, token));
            yield {
                title: `Fetching posts for blog ${blogID}, page ${number}`,
                blogID,
                page: number,
                records: async () => (await load()).records,
                task: async ctx => {
                    const stage = stageFor(ctx);
                    writeRecords(stage, (await load()).records);
                }
            };
            pageToken = (await load()).nextPageToken;
        } while (pageToken);
    }
}

export {postsURL, pageRecords, tasks, writeRecords};
