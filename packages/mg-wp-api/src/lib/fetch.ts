import WPAPI from 'wpapi';
import errors from '@tryghost/errors';
import type {SourceIngestion, SourceRecordInput} from '@tryghost/mg-context';

export interface ApiUser {
    username?: string;
    password?: string;
}

export interface DiscoverOptions {
    apiUser?: ApiUser | null;
    usersJSON?: any[] | null;
    posts?: boolean;
    pages?: boolean;
    limit?: number;
    cpt?: string[] | null;
    postsBefore?: string | null;
    postsAfter?: string | null;
}

export interface DiscoverResult {
    site: any;
    totals: Record<string, number>;
    batches: Record<string, number>;
}

/** What to fetch. The stored source holds only what these options select. */
export interface FetchOptions {
    limit?: number;
    cpt?: string[] | null;
    postsBefore?: string | null;
    postsAfter?: string | null;
    maxPosts?: number;
    trustSelfSignedCert?: boolean;
}

export interface TaskContext {
    options: FetchOptions;
    apiUser?: ApiUser | null;
    usersJSON?: any[] | null;
    sourceIngestion?: SourceIngestion;
}

export interface FetchTask {
    title: string;
    /** The REST endpoint, or `users` for the users file. */
    endpoint: string;
    /** Fetch this page's records without storing them. */
    records: () => Promise<SourceRecordInput[]>;
    /** Fetch this page and write its records into `ctx.sourceIngestion`. */
    task: (ctx: TaskContext) => Promise<void>;
}

const hasAuth = (apiUser?: ApiUser | null): apiUser is Required<ApiUser> =>
    Boolean(apiUser?.username && apiUser?.password);

const dated = (request: any, {postsBefore, postsAfter}: FetchOptions): any => {
    if (postsBefore) {
        request = request.before(new Date(postsBefore));
    }
    if (postsAfter) {
        request = request.after(new Date(postsAfter));
    }
    return request;
};

const discover = async (
    url: string,
    {apiUser, usersJSON, posts, pages, limit, cpt, postsBefore, postsAfter}: DiscoverOptions
): Promise<DiscoverResult> => {
    const requestOptions: Record<string, string | boolean> = {endpoint: `${url}/wp-json`};

    if (hasAuth(apiUser)) {
        // wpapi only sends credentials with GET requests when `auth` is set.
        requestOptions.auth = true;
        requestOptions.username = apiUser.username;
        requestOptions.password = apiUser.password;
    }

    const site = new WPAPI(requestOptions);
    const values: DiscoverResult = {site, totals: {}, batches: {}};
    const count = async (endpoint: string, request: any) => {
        const response = await request.perPage(limit);
        values.totals[endpoint] = response._paging?.total ?? 0;
        values.batches[endpoint] = response._paging?.totalPages ?? 0;
    };

    for (const cptSlug of cpt ?? []) {
        site[cptSlug] = site.registerRoute('wp/v2', `/${cptSlug}/(?P<id>)`);
        await count(cptSlug, site[cptSlug]());
    }
    if (posts) {
        await count('posts', dated(site.posts(), {postsBefore, postsAfter}));
    }
    if (pages) {
        await count('pages', site.pages());
    }
    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        await count('users', site.users());
    }

    return values;
};

/** Source records for one page of API objects, keyed `<type>:id:<n>`. */
const pageRecords = (endpoint: string, items: any[], page: number): SourceRecordInput[] =>
    items.map(item => {
        const type = endpoint === 'users' ? 'user' : (item.type ?? endpoint);
        return {
            kind: endpoint === 'users' ? 'user' : 'content',
            key: `${type}:id:${item.id}`,
            content: JSON.stringify(item),
            format: 'json',
            metadata: {endpoint, page}
        };
    });

/** Records for a supplied users file, keyed by WordPress user ID or slug. */
const userFileRecords = (users: any[]): SourceRecordInput[] =>
    users.map((user, index) => ({
        kind: 'user',
        key: user.id ? `user:id:${user.id}` : user.slug ? `user:slug:${user.slug}` : null,
        content: JSON.stringify(user),
        format: 'json',
        metadata: {endpoint: 'users-file', index}
    }));

/** Keep the most recently modified version when paging returns an object twice. */
const writeRecords = (stage: SourceIngestion, records: SourceRecordInput[]): void => {
    for (const record of records) {
        stage.reconcile(record, {
            choose: (existing, incoming) =>
                Date.parse(JSON.parse(incoming.content).modified_gmt) >
                Date.parse(JSON.parse(existing.content).modified_gmt)
                    ? 'replace'
                    : 'keep'
        });
    }
};

const fetchPage = async (
    api: DiscoverResult,
    endpoint: string,
    page: number,
    options: FetchOptions,
    isAuthRequest: boolean
): Promise<any[]> => {
    let request = api.site[endpoint]();
    if (isAuthRequest) {
        request = request.param('context', 'edit');
    }
    if (endpoint === 'posts') {
        request = dated(request, options);
    }
    return await request
        .perPage(options.limit ?? 100)
        .page(page)
        .embed();
};

const stageFor = (ctx: TaskContext): SourceIngestion => {
    if (!ctx.sourceIngestion) {
        throw new errors.IncorrectUsageError({
            message: 'mg-wp-api fetch tasks write into ctx.sourceIngestion; run them inside context.sources.ingest()'
        });
    }
    return ctx.sourceIngestion;
};

/**
 * One task per API page. Each task writes that page's objects into `ctx.sourceIngestion`: posts, pages and
 * custom post types as `content` records, users as `user` records. A supplied users file replaces the users
 * endpoint.
 */
const tasks = async (url: string, ctx: TaskContext): Promise<FetchTask[]> => {
    const {options, apiUser, usersJSON} = ctx;
    const limit = options.limit ?? 100;
    const isAuthRequest = hasAuth(apiUser);

    if (options.trustSelfSignedCert) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    const api = await discover(url, {...options, limit, apiUser, usersJSON, posts: true, pages: true});
    const list: FetchTask[] = [];
    const endpoints = ['posts', 'pages', ...(options.cpt ?? []), ...(usersJSON ? [] : ['users'])];

    for (const endpoint of endpoints) {
        let totalPages = api.batches[endpoint];
        if (options.maxPosts && endpoint === 'posts') {
            // Fetch only the pages needed; map() applies the exact limit.
            totalPages = Math.ceil(Math.min(options.maxPosts, api.totals.posts) / limit);
        }
        for (let page = 1; page <= totalPages; page++) {
            const records = async () =>
                pageRecords(endpoint, await fetchPage(api, endpoint, page, options, isAuthRequest), page);
            list.push({
                title: `Fetching ${endpoint}, page ${page} of ${totalPages}`,
                endpoint,
                records,
                task: async taskCtx => {
                    const stage = stageFor(taskCtx);
                    writeRecords(stage, await records());
                }
            });
        }
    }

    if (usersJSON) {
        const records = async () => userFileRecords(usersJSON);
        list.push({
            title: `Storing ${usersJSON.length} users from the users file`,
            endpoint: 'users',
            records,
            task: async taskCtx => writeRecords(stageFor(taskCtx), await records())
        });
    }

    return list;
};

/** Every content page in batch mode becomes one batch; users are always fetched so authors stay complete. */
const selectBatch = (list: FetchTask[], batch: number): FetchTask[] => {
    if (!batch) {
        return list;
    }
    const content = list.filter(task => task.endpoint !== 'users');
    if (!content[batch - 1]) {
        throw new errors.BadRequestError({
            message: `Batch ${batch} does not exist; there are ${content.length} batches.`
        });
    }
    return [content[batch - 1], ...list.filter(task => task.endpoint === 'users')];
};

export {discover, tasks, selectBatch, pageRecords, userFileRecords, writeRecords};

export default {
    discover,
    tasks
};
