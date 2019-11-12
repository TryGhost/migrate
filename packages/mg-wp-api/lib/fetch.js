const wp = require('wpapi');
const perPage = 20;

module.exports.discover = async (url) => {
    const site = await wp.discover(url);
    const posts = await site.posts().perPage(perPage);
    const pages = await site.pages().perPage(perPage);

    return {site, totals: {posts: posts._paging.totalPages, pages: pages._paging.totalPages}};
};

module.exports.all = async (url) => {
    const api = await this.discover(url);

    const result = {
        posts: [],
        pages: []
    };

    for (let page = 1; page < api.totals.posts; page++) {
        result.posts.concat(await api.site.posts().perPage(perPage).page(page).embed());
    }

    return result;
};

const buildTasks = (tasks, api, type) => {
    for (let page = 1; page < api.totals[type]; page++) {
    // for (let page = 1; page < 2; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.totals[type]}`,
            task: async (ctx) => {
                ctx.result[type] = ctx.result[type].concat(await api.site[type]().perPage(perPage).page(page).embed());
            }
        });
    }
};

module.exports.tasks = async (url, ctx) => {
    const api = await this.discover(url);
    const tasks = [];

    ctx.result = {
        posts: [],
        pages: []
    };

    buildTasks(tasks, api, 'posts');
    // buildTasks(tasks, api, 'pages');

    return tasks;
};
