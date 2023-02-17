import ghostAPI from '@tryghost/admin-api';

const contentStats = async (options) => {
    const requestOptions = {
        url: options.url,
        version: 'v2.0',
        key: options.apikey
    };

    const site = new ghostAPI(requestOptions);

    // Request the smallest amount of data possible
    const posts = await site.posts.browse({limit: 1, fields: 'title'});
    const pages = await site.pages.browse({limit: 1, fields: 'title'});
    const users = await site.users.browse({limit: 1, fields: 'name'});

    return {
        posts: posts.meta.pagination.total,
        pages: pages.meta.pagination.total,
        users: users.meta.pagination.total
    };
};

const discover = async (options) => {
    const requestOptions = {
        url: options.url,
        version: 'v2.0',
        key: options.apikey
    };

    const site = new ghostAPI(requestOptions);

    const posts = (options.posts) ? await site.posts.browse({limit: options.limit}) : null;
    const pages = (options.pages) ? await site.pages.browse({limit: options.limit}) : null;
    const users = await site.users.browse({limit: options.limit});

    return {
        site,
        totals: {
            posts: (posts && posts.meta.pagination) && posts.meta.pagination.total ? posts.meta.pagination.total : 0,
            pages: (pages && pages.meta.pagination) && pages.meta.pagination.total ? pages.meta.pagination.total : 0,
            users: users.meta.pagination && users.meta.pagination.total ? users.meta.pagination.total : 0
        },
        batches: {
            posts: (posts && posts.meta.pagination) && posts.meta.pagination.pages ? posts.meta.pagination.pages : 0,
            pages: (pages && pages.meta.pagination) && pages.meta.pagination.pages ? pages.meta.pagination.pages : 0,
            users: users.meta.pagination && users.meta.pagination.pages ? users.meta.pagination.pages : 0
        }
    };
};

const cachedFetch = async (fileCache, api, type, options, page) => {
    let filename = `gh_api_${type}_${options.limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = null;

    const postParams = {
        limit: options.limit,
        page: page,
        filter: options.postFilter || null
    };

    const pageParams = {
        limit: options.limit,
        page: page,
        filter: options.pageFilter || null
    };

    const userParams = {
        limit: options.limit,
        page: page
    };

    if (type === 'posts') {
        response = await api.site.posts.browse(postParams);
        response.forEach((item) => {
            item.type = 'post';
        });
    } else if (type === 'pages') {
        response = await api.site.pages.browse(pageParams);
        response.forEach((item) => {
            item.type = 'page';
        });
    } else {
        response = await api.site.users.browse(userParams);
    }

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type, options, logger) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    let response = await cachedFetch(fileCache, api, type, options, page);

                    // This is weird, but we don't yet deal with pages as a separate concept in imports
                    type = (type === 'pages') ? 'posts' : type;

                    ctx.result[type] = ctx.result[type].concat(response);
                } catch (error) {
                    logger.error({message: `Failed to fetch ${type}, page ${page} of ${api.batches[type]}`, error});
                    throw error;
                }
            }
        });
    }
};

const tasks = async (options, ctx) => {
    const {limit} = ctx.options;
    const {logger} = ctx;

    const api = await discover(options, {limit});

    const tasks = []; // eslint-disable-line no-shadow

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, tasks, api, 'posts', options, logger);
    buildTasks(ctx.fileCache, tasks, api, 'pages', options, logger);
    buildTasks(ctx.fileCache, tasks, api, 'users', options, logger);

    return tasks;
};

export default {
    contentStats,
    discover,
    tasks
};
