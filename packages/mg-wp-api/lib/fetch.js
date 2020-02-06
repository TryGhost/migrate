const WPAPI = require('wpapi');
const perPage = 100;

module.exports.discover = async (url, apiUser) => {
    const requestOptions = {endpoint: `${url}/wp-json`};

    if (apiUser && apiUser.username && apiUser.password) {
        requestOptions.username = apiUser.username;
        requestOptions.password = apiUser.password;
    }

    let site = new WPAPI(requestOptions);

    const posts = await site.posts().perPage(perPage);
    const pages = await site.pages().perPage(perPage);
    const users = await site.users().perPage(perPage);

    return {
        site,
        totals: {posts: posts._paging.total, pages: pages._paging.total, users: users._paging.total},
        batches: {posts: posts._paging.totalPages, pages: pages._paging.totalPages, users: users._paging.totalPages}
    };
};

const cachedFetch = async (fileCache, api, type, perPage, page, isAuthRequest) => {
    let filename = `wp_api_${type}_${perPage}_${page}.json`;

    // if (fileCache.hasFile(filename, 'tmp')) {
    //     return await fileCache.readTmpJSONFile(filename);
    // }

    let response = isAuthRequest ? await api.site[type]().param('context', 'edit').perPage(perPage).page(page).embed() : await api.site[type]().perPage(perPage).page(page).embed();

    await fileCache.writeTmpJSONFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type, isAuthRequest) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                let response = await cachedFetch(fileCache, api, type, perPage, page, isAuthRequest);
                // This is weird, but we don't yet deal with pages as a separate concept in imports
                type = type === 'pages' ? 'posts' : type;

                ctx.result[type] = ctx.result[type].concat(response);
            }
        });
    }
};

module.exports.tasks = async (url, ctx) => {
    const {apiUser} = ctx || {};
    let isAuthRequest = false;

    if (apiUser && apiUser.username && apiUser.password) {
        isAuthRequest = true;
    }

    const api = await this.discover(url, apiUser);

    const tasks = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, tasks, api, 'posts', isAuthRequest);
    buildTasks(ctx.fileCache, tasks, api, 'pages', isAuthRequest);
    buildTasks(ctx.fileCache, tasks, api, 'users', isAuthRequest);

    return tasks;
};
