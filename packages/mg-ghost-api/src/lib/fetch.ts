import GhostAdminAPI from '@tryghost/admin-api';
import type {Post, User, BrowseResponse} from '@tryghost/admin-api';

export interface BaseOptions {
    url: string;
    apikey: string;
}

export interface DiscoverOptions extends BaseOptions {
    limit?: number | string;
    posts?: boolean;
    pages?: boolean;
    postFilter?: string | null;
    pageFilter?: string | null;
}

export interface FetchOptions extends DiscoverOptions {
    limit: number | string;
}

export interface ContentStatsResult {
    posts: number;
    pages: number;
    users: number;
}

export interface DiscoverResult {
    site: GhostAdminAPI;
    totals: {
        posts: number;
        pages: number;
        users: number;
    };
    batches: {
        posts: number;
        pages: number;
        users: number;
    };
}

export interface FileCache {
    hasFile(filename: string, type: string): boolean;
    readTmpJSONFile(filename: string): Promise<unknown>;
    writeTmpFile(data: unknown, filename: string): Promise<void>;
}

export interface TaskContext {
    fileCache: FileCache;
    options: {limit: number | string};
    result: {
        posts: Post[];
        users: User[];
    };
}

export interface ListrTask {
    title: string;
    task: (ctx: TaskContext) => Promise<void>;
}

export type FetchType = 'posts' | 'pages' | 'users';

const contentStats = async (options: BaseOptions): Promise<ContentStatsResult> => {
    const requestOptions = {
        url: options.url,
        version: 'v6.0',
        key: options.apikey
    };

    const site = new GhostAdminAPI(requestOptions);

    // Request the smallest amount of data possible
    const posts = await site.posts.browse({limit: 1, fields: 'title'});
    const pages = await site.pages.browse({limit: 1, fields: 'title'});
    const users = await site.users.browse({limit: 1, fields: 'name'});

    return {
        posts: posts.meta?.pagination.total ?? 0,
        pages: pages.meta?.pagination.total ?? 0,
        users: users.meta?.pagination.total ?? 0
    };
};

const discover = async (options: DiscoverOptions): Promise<DiscoverResult> => {
    const requestOptions = {
        url: options.url,
        version: 'v6.0',
        key: options.apikey
    };

    const site = new GhostAdminAPI(requestOptions);

    const posts = options.posts ? await site.posts.browse({limit: options.limit, filter: options.postFilter ?? null}) : null;
    const pages = options.pages ? await site.pages.browse({limit: options.limit, filter: options.postFilter ?? null}) : null;
    const users = await site.users.browse({limit: options.limit});

    return {
        site,
        totals: {
            posts: posts?.meta?.pagination.total ?? 0,
            pages: pages?.meta?.pagination.total ?? 0,
            users: users.meta?.pagination.total ?? 0
        },
        batches: {
            posts: posts?.meta?.pagination.pages ?? 0,
            pages: pages?.meta?.pagination.pages ?? 0,
            users: users.meta?.pagination.pages ?? 0
        }
    };
};

const cachedFetch = async (
    fileCache: FileCache,
    api: DiscoverResult,
    type: FetchType,
    options: FetchOptions,
    page: number
): Promise<BrowseResponse<Post> | BrowseResponse<User>> => {
    const filename = `gh_api_${type}_${options.limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename) as BrowseResponse<Post> | BrowseResponse<User>;
    }

    let response: BrowseResponse<Post> | BrowseResponse<User>;

    const postParams = {
        formats: 'html',
        limit: options.limit,
        page: page,
        filter: options.postFilter || null
    };

    const pageParams = {
        formats: 'html',
        limit: options.limit,
        page: page,
        filter: options.pageFilter || null
    };

    const userParams = {
        limit: options.limit,
        page: page
    };

    if (type === 'posts') {
        const posts = await api.site.posts.browse(postParams, {source: 'html'});
        posts.forEach((item) => {
            item.type = 'post';
        });
        response = posts;
    } else if (type === 'pages') {
        const pages = await api.site.pages.browse(pageParams, {source: 'html'});
        pages.forEach((item) => {
            item.type = 'page';
        });
        response = pages;
    } else {
        response = await api.site.users.browse(userParams);
    }

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const buildTasks = (
    fileCache: FileCache,
    tasks: ListrTask[],
    api: DiscoverResult,
    type: FetchType,
    options: FetchOptions
): void => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    const response = await cachedFetch(fileCache, api, type, options, page);

                    // This is weird, but we don't yet deal with pages as a separate concept in imports
                    const resultKey: 'posts' | 'users' = type === 'pages' || type === 'posts' ? 'posts' : 'users';

                    if (resultKey === 'posts') {
                        ctx.result.posts = ctx.result.posts.concat(response as BrowseResponse<Post>);
                    } else {
                        ctx.result.users = ctx.result.users.concat(response as BrowseResponse<User>);
                    }
                } catch (error) {
                    console.error(`Failed to fetch ${type}, page ${page} of ${api.batches[type]}`, error); // eslint-disable-line no-console
                    throw error;
                }
            }
        });
    }
};

const tasks = async (options: FetchOptions, ctx: TaskContext): Promise<ListrTask[]> => {
    const {limit} = ctx.options;

    const api = await discover({...options, limit});

    const taskList: ListrTask[] = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, taskList, api, 'posts', options);
    buildTasks(ctx.fileCache, taskList, api, 'pages', options);
    buildTasks(ctx.fileCache, taskList, api, 'users', options);

    return taskList;
};

export default {
    contentStats,
    discover,
    tasks
};
