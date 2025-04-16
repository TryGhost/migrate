import WPAPI from 'wpapi';

const discover = async (url, {apiUser, usersJSON, posts, pages, limit, cpt, postsBefore, postsAfter}) => {
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

    if (posts) {
        let postsData;

        if (postsBefore && postsAfter) {
            postsData = await site.posts().before(new Date(postsBefore)).after(new Date(postsAfter)).perPage(limit);
        } else if (postsAfter) {
            postsData = await site.posts().after(new Date(postsAfter)).perPage(limit);
        } else if (postsBefore) {
            postsData = await site.posts().before(new Date(postsBefore)).perPage(limit);
        } else {
            postsData = await site.posts().perPage(limit);
        }

        values.totals.posts = postsData._paging && postsData._paging.total ? postsData._paging.total : 0;
        values.batches.posts = postsData._paging && postsData._paging.totalPages ? postsData._paging.totalPages : 0;
    }

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

const cachedFetch = async (fileCache, api, type, limit, page, isAuthRequest, postsBefore, postsAfter) => {
    let filename = `wp_api_${type}_${limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response;

    if (type === 'posts') {
        if (postsBefore && postsAfter) {
            response = isAuthRequest ? await api.site.posts().param('context', 'edit').before(new Date(postsBefore)).after(new Date(postsAfter)).perPage(limit).page(page).embed() : await api.site.posts().before(new Date(postsBefore)).after(new Date(postsAfter)).perPage(limit).page(page).embed();
        } else if (postsAfter) {
            response = isAuthRequest ? await api.site.posts().param('context', 'edit').after(new Date(postsAfter)).perPage(limit).page(page).embed() : await api.site.posts().after(new Date(postsAfter)).perPage(limit).page(page).embed();
        } else if (postsBefore) {
            response = isAuthRequest ? await api.site.posts().param('context', 'edit').before(new Date(postsBefore)).perPage(limit).page(page).embed() : await api.site.posts().before(new Date(postsBefore)).perPage(limit).page(page).embed();
        } else {
            response = isAuthRequest ? await api.site.posts().param('context', 'edit').perPage(limit).page(page).embed() : await api.site.posts().perPage(limit).page(page).embed();
        }
    } else {
        response = isAuthRequest ? await api.site[type]().param('context', 'edit').perPage(limit).page(page).embed() : await api.site[type]().perPage(limit).page(page).embed();
    }

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const buildTasks = (fileCache, tasks, api, type, limit, isAuthRequest, postsBefore, postsAfter) => {
    for (let page = 1; page <= api.batches[type]; page++) {
        tasks.push({
            title: `Fetching ${type}, page ${page} of ${api.batches[type]}`,
            task: async (ctx) => {
                try {
                    let response = await cachedFetch(fileCache, api, type, limit, page, isAuthRequest, postsBefore, postsAfter);

                    // Treat all types as posts, except users
                    let resultType = (type !== 'users') ? 'posts' : type;

                    ctx.result[resultType] = ctx.result[resultType].concat(response);
                } catch (err) {
                    // eslint-disable-next-line no-console
                    console.error(`Failed to fetch ${type}, page ${page} of ${api.batches[type]}`, err);
                    throw err;
                }
            }
        });
    }
};

const tasks = async (url, ctx) => {
    const {apiUser} = ctx || {};
    const {pages, posts, limit, cpt, postsBefore, postsAfter} = ctx.options;
    const {usersJSON} = ctx || null;
    let isAuthRequest = false;

    if (ctx.options.trustSelfSignedCert) {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    if (apiUser && apiUser.username && apiUser.password) {
        isAuthRequest = true;
    }

    const api = await discover(url, {apiUser, usersJSON, posts, pages, limit, cpt, postsBefore, postsAfter});

    const theTasks = [];

    ctx.result = {
        posts: [],
        users: []
    };

    buildTasks(ctx.fileCache, theTasks, api, 'posts', limit, isAuthRequest, postsBefore, postsAfter);

    if (pages) {
        buildTasks(ctx.fileCache, theTasks, api, 'pages', limit, isAuthRequest);
    }

    // If users were already supplied, don't fetch them
    if (!usersJSON) {
        buildTasks(ctx.fileCache, theTasks, api, 'users', limit, isAuthRequest);
    }

    if (cpt) {
        cpt.forEach((cptSlug) => {
            buildTasks(ctx.fileCache, theTasks, api, `${cptSlug}`, limit, isAuthRequest);
        });
    }

    return theTasks;
};

export default {
    discover,
    tasks
};
