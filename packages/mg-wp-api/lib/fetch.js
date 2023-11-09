import WPAPI from 'wpapi';

const discover = async (url, {apiUser, usersJSON, pages, limit, cpt}) => {
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
        await Promise.all(cpt.map(async (cptSlug) => {
            site[cptSlug] = site.registerRoute('wp/v2', `/${cptSlug}/(?P<id>)`);

            let cptInfo = await site[cptSlug]().perPage(limit);

            values.totals[cptSlug] = cptInfo._paging && cptInfo._paging.total ? cptInfo._paging.total : 0;
            values.batches[cptSlug] = cptInfo._paging && cptInfo._paging.totalPages ? cptInfo._paging.totalPages : 0;
        }));
    }

    values.site = site;

    const postsData = await site.posts().perPage(limit);
    values.totals.posts = postsData._paging && postsData._paging.total ? postsData._paging.total : 0;
    values.batches.posts = postsData._paging && postsData._paging.totalPages ? postsData._paging.totalPages : 0;

    if (pages) {
        const pageData = await site.pages().perPage(limit);
        values.totals.pages = pageData._paging && pageData._paging.total ? pageData._paging.total : 0;
        values.batches.pages = pageData._paging && pageData._paging.totalPages ? pageData._paging.totalPages : 0;
    }

    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        const usersData = await site.users().perPage(limit);
        values.totals.users = usersData._paging && usersData._paging.total ? usersData._paging.total : 0;
        values.batches.users = usersData._paging && usersData._paging.totalPages ? usersData._paging.totalPages : 0;
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

const buildTasks = (fileCache, tasks, api, type, limit, isAuthRequest, logger) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    let response = await cachedFetch(fileCache, api, type, limit, page, isAuthRequest);

                    // Treat all types as posts, except users
                    let resultType = (type !== 'users') ? 'posts' : type;

                    ctx.result[resultType] = ctx.result[resultType].concat(response);
                } catch (err) {
                    logger.error({message: `Failed to fetch ${type}, page ${page} of ${api.batches[type]}`, err});
                    throw err;
                }
            }
        });
    }
};

const tasks = async (url, ctx) => {
    const {logger} = ctx;
    const {apiUser} = ctx || {};
    const {pages, limit, cpt} = ctx.options;
    const {usersJSON} = ctx || null;
    let isAuthRequest = false;

    if (ctx.options.trustSelfSignedCert) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    if (apiUser && apiUser.username && apiUser.password) {
        isAuthRequest = true;
    }

    const api = await discover(url, {apiUser, usersJSON, limit, cpt, pages});

    const theTasks = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, theTasks, api, 'posts', limit, isAuthRequest, logger);

    if (pages) {
        buildTasks(ctx.fileCache, theTasks, api, 'pages', limit, isAuthRequest, logger);
    }

    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        buildTasks(ctx.fileCache, theTasks, api, 'users', limit, isAuthRequest, logger);
    }

    if (cpt) {
        cpt.forEach((cptSlug) => {
            buildTasks(ctx.fileCache, theTasks, api, `${cptSlug}`, limit, isAuthRequest, logger);
        });
    }

    return theTasks;
};

export default {
    discover,
    tasks
};
