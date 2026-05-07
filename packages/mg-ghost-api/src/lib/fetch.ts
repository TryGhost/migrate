import GhostAdminAPI from '@tryghost/admin-api';
import type {Post, BrowseResponse} from '@tryghost/admin-api';
import errors from '@tryghost/errors';
import type {MigrateContext} from '@tryghost/mg-context';
import {mapPost, type GhostApiPost} from './mapper.js';

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
    };
}

export interface TaskContext {
    migrateContext: MigrateContext;
    options: {limit: number | string};
}

export interface ListrTask {
    title: string;
    task: (ctx: TaskContext) => Promise<void>;
}

export type FetchType = 'posts' | 'pages';

const contentStats = async (options: BaseOptions): Promise<ContentStatsResult> => {
    const site = new GhostAdminAPI({
        url: options.url,
        version: 'v6.0',
        key: options.apikey
    });

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
    const site = new GhostAdminAPI({
        url: options.url,
        version: 'v6.0',
        key: options.apikey
    });

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
            pages: pages?.meta?.pagination.pages ?? 0
        }
    };
};

const fetchPage = async (
    api: DiscoverResult,
    type: FetchType,
    options: FetchOptions,
    page: number
): Promise<BrowseResponse<Post>> => {
    const params = {
        formats: 'lexical',
        limit: options.limit,
        page: page,
        filter: (type === 'posts' ? options.postFilter : options.pageFilter) || null
    };

    const response = type === 'posts'
        ? await api.site.posts.browse(params, {source: 'html'})
        : await api.site.pages.browse(params, {source: 'html'});

    const ghostType = type === 'posts' ? 'post' : 'page';
    response.forEach((item) => {
        item.type = ghostType;
    });

    return response;
};

const buildTasks = (
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
                    const response = await fetchPage(api, type, options, page);
                    await ctx.migrateContext.transaction(async () => {
                        for (const ghPost of response) {
                            const post = await mapPost(ghPost as unknown as GhostApiPost, ctx.migrateContext);
                            post.save(ctx.migrateContext.db);
                        }
                    });
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

    if (!ctx.migrateContext) {
        throw new errors.IncorrectUsageError({
            message: 'mg-ghost-api fetch.tasks requires ctx.migrateContext to be set by the caller'
        });
    }

    const api = await discover({...options, limit});

    const taskList: ListrTask[] = [];
    buildTasks(taskList, api, 'posts', options);
    buildTasks(taskList, api, 'pages', options);

    return taskList;
};

export default {
    contentStats,
    discover,
    tasks
};
