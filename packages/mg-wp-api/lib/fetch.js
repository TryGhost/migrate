const WPAPI = require('wpapi');

module.exports.discover = async (url, {apiUser, limit}) => {
    const requestOptions = {endpoint: `${url}/wp-json`};

    if (apiUser && apiUser.username && apiUser.password) {
        requestOptions.username = apiUser.username;
        requestOptions.password = apiUser.password;
    }

    let site = new WPAPI(requestOptions);

    const posts = await site.posts().perPage(limit);
    const pages = await site.pages().perPage(limit);
    const users = await site.users().perPage(limit);

    return {
        site,
        totals: {
            posts: posts._paging && posts._paging.total ? posts._paging.total : 0,
            pages: pages._paging && pages._paging.total ? pages._paging.total : 0,
            users: users._paging && users._paging.total ? users._paging.total : 0
        },
        batches: {
            posts: posts._paging && posts._paging.totalPages ? posts._paging.totalPages : 0,
            pages: pages._paging && pages._paging.totalPages ? pages._paging.totalPages : 0,
            users: users._paging && users._paging.totalPages ? users._paging.totalPages : 0
        }
    };
};

const cachedFetch = async (fileCache, api, type, limit, page, isAuthRequest) => {
    let filename = `wp_api_${type}_${limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = isAuthRequest ? await api.site[type]().param('context', 'edit').perPage(limit).page(page).embed() : await api.site[type]().perPage(limit).page(page).embed();

    await fileCache.writeTmpJSONFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type, limit, isAuthRequest) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    let response = await cachedFetch(fileCache, api, type, limit, page, isAuthRequest);

                    // This is weird, but we don't yet deal with pages as a separate concept in imports
                    type = type === 'pages' ? 'posts' : type;

                    ctx.result[type] = ctx.result[type].concat(response);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        });
    }
};

module.exports.tasks = async (url, ctx) => {
    const {apiUser} = ctx || {};
    const {limit} = ctx.options;
    let isAuthRequest = false;

    if (apiUser && apiUser.username && apiUser.password) {
        isAuthRequest = true;
    }

    const api = await this.discover(url, {apiUser, limit});

    const tasks = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, tasks, api, 'posts', limit, isAuthRequest);
    buildTasks(ctx.fileCache, tasks, api, 'pages', limit, isAuthRequest);
    buildTasks(ctx.fileCache, tasks, api, 'users', limit, isAuthRequest);

    return tasks;
};
