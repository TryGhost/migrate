import errors from '@tryghost/errors';
import type {SourceIngestion, SourceRecordInput} from '@tryghost/mg-context';

const API_LIMIT = 10;

/** The publication to fetch and the API key to fetch it with. */
export interface FetchOptions {
    key: string;
    id: string;
}

export interface TaskContext {
    sourceIngestion?: SourceIngestion;
}

export interface FetchTask {
    title: string;
    page: number;
    /** Fetch this page's records without storing them. */
    records: () => Promise<SourceRecordInput[]>;
    /** Fetch this page and write its records into `ctx.sourceIngestion`. */
    task: (ctx: TaskContext) => Promise<void>;
}

const authedClient = async (apiKey: string, theUrl: URL) => {
    return fetch(theUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
};

const getJSON = async (key: string, url: URL): Promise<any> => {
    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    return response.json();
};

const postsURL = (id: string, params: [string, string][]): URL => {
    const url = new URL(`https://api.beehiiv.com/v2/publications/${id}/posts`);
    for (const [name, value] of params) {
        url.searchParams.append(name, value);
    }
    return url;
};

/** The number of posts in a publication, and of pages to fetch them in. */
const discover = async ({key, id}: FetchOptions): Promise<{total: number; pages: number}> => {
    const data = await getJSON(key, postsURL(id, [['limit', '1']]));
    const total = Number(data.total_results) || 0;
    return {total, pages: Math.ceil(total / API_LIMIT)};
};

/** One page of posts with their free and premium web content. */
const fetchPage = async ({key, id}: FetchOptions, page: number): Promise<any[]> => {
    const url = postsURL(id, [
        ['limit', String(API_LIMIT)],
        ['expand', 'free_web_content'],
        ['expand', 'premium_web_content'],
        ['page', String(page)]
    ]);
    const data = await getJSON(key, url);
    return data.data ?? [];
};

/** Source records for one page of posts, keyed by post ID. */
const pageRecords = (posts: any[], page: number): SourceRecordInput[] =>
    posts.map(post => ({
        kind: 'post',
        key: post.id || null,
        content: JSON.stringify(post),
        format: 'json',
        metadata: {page}
    }));

const stageFor = (ctx: TaskContext): SourceIngestion => {
    if (!ctx.sourceIngestion) {
        throw new errors.IncorrectUsageError({
            message:
                'mg-beehiiv-api fetch tasks write into ctx.sourceIngestion; run them inside context.sources.ingest()'
        });
    }
    return ctx.sourceIngestion;
};

/**
 * One task per page of the publication's posts, in page order. Each task writes its page into
 * `ctx.sourceIngestion` as `post` records; a post returned twice while paging keeps its first version.
 */
const tasks = async (options: FetchOptions): Promise<FetchTask[]> => {
    const {pages} = await discover(options);
    const list: FetchTask[] = [];

    for (let page = 1; page <= pages; page++) {
        const records = async () => pageRecords(await fetchPage(options, page), page);
        list.push({
            title: `Fetching posts page ${page} of ${pages}`,
            page,
            records,
            task: async ctx => {
                const stage = stageFor(ctx);
                for (const record of await records()) {
                    stage.reconcile(record);
                }
            }
        });
    }

    return list;
};

export {authedClient, discover, tasks, pageRecords};
