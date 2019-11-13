const wp = require('wpapi');
const perPage = 100;

module.exports.discover = async (url) => {
    const site = await wp.discover(url);
    const posts = await site.posts().perPage(perPage);
    const pages = await site.pages().perPage(perPage);

    return {
        site,
        totals: {posts: posts._paging.total, pages: pages._paging.total},
        batches: {posts: posts._paging.totalPages, pages: pages._paging.totalPages}
    };
};

const cachedFetch = async (fileCache, api, type, perPage, page) => {
    let filename = `wp_api_${type}_${perPage}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await api.site[type]().perPage(perPage).page(page).embed();

    await fileCache.writeTmpJSONFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                let response = await cachedFetch(fileCache, api, type, perPage, page);

                // This is weird, but we don't yet deal with pages as a separate concept in imports
                ctx.result.posts = ctx.result.posts.concat(response);
            }
        });
    }
};

module.exports.tasks = async (url, ctx) => {
    const api = await this.discover(url);
    const tasks = [];

    ctx.result = {
        posts: []
    };

    buildTasks(ctx.fileCache, tasks, api, 'posts');
    buildTasks(ctx.fileCache, tasks, api, 'pages');

    return tasks;
};
