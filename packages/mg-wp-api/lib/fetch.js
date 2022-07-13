const WPAPI = require('wpapi');

module.exports.discover = async (url, {apiUser, usersJSON, limit, cpt}) => {
    const requestOptions = {endpoint: `${url}/wp-json`};

    if (apiUser && apiUser.username && apiUser.password) {
        requestOptions.username = apiUser.username;
        requestOptions.password = apiUser.password;
    }

    let site = new WPAPI(requestOptions);

    let values = {
        site: null,
        totals: {},
        batches: {}
    };

    if (cpt) {
        const CPTs = cpt.split(',');

        await Promise.all(CPTs.map(async (cptSlug) => {
            site[cptSlug] = site.registerRoute('wp/v2', `/${cptSlug}/(?P<id>)`);

            let cptInfo = await site[cptSlug]().perPage(limit);

            values.totals[cptSlug] = cptInfo._paging && cptInfo._paging.total ? cptInfo._paging.total : 0;
            values.batches[cptSlug] = cptInfo._paging && cptInfo._paging.totalPages ? cptInfo._paging.totalPages : 0;
        }));
    }

    values.site = site;

    const posts = await site.posts().perPage(limit);
    values.totals.posts = posts._paging && posts._paging.total ? posts._paging.total : 0;
    values.batches.posts = posts._paging && posts._paging.totalPages ? posts._paging.totalPages : 0;

    const pages = await site.pages().perPage(limit);
    values.totals.pages = pages._paging && pages._paging.total ? pages._paging.total : 0;
    values.batches.pages = pages._paging && pages._paging.totalPages ? pages._paging.totalPages : 0;

    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        const users = await site.users().perPage(limit);
        values.totals.users = users._paging && users._paging.total ? users._paging.total : 0;
        values.batches.users = users._paging && users._paging.totalPages ? users._paging.totalPages : 0;
    }

    return values;
};

const cachedFetch = async (fileCache, api, type, limit, page, isAuthRequest) => {
    let filename = `wp_api_${type}_${limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = isAuthRequest ? await api.site[type]().param('context', 'edit').perPage(limit).page(page).embed() : await api.site[type]().perPage(limit).page(page).embed();

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type, limit, isAuthRequest) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    let response = await cachedFetch(fileCache, api, type, limit, page, isAuthRequest);

                    // Treat all types as posts, except users
                    let resultType = (type !== 'users') ? 'posts' : type;

                    ctx.result[resultType] = ctx.result[resultType].concat(response);
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
    const {cpt} = ctx.options;
    const {usersJSON} = ctx || null;
    let isAuthRequest = false;

    if (apiUser && apiUser.username && apiUser.password) {
        isAuthRequest = true;
    }

    const api = await this.discover(url, {apiUser, usersJSON, limit, cpt});

    const tasks = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, tasks, api, 'posts', limit, isAuthRequest);
    buildTasks(ctx.fileCache, tasks, api, 'pages', limit, isAuthRequest);

    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        buildTasks(ctx.fileCache, tasks, api, 'users', limit, isAuthRequest);
    }

    if (cpt) {
        const CPTs = cpt.split(',');

        CPTs.forEach((cptSlug) => {
            buildTasks(ctx.fileCache, tasks, api, `${cptSlug}`, limit, isAuthRequest);
        });
    }

    return tasks;
};
