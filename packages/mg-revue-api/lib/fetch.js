const got = require('got');

module.exports.discover = async ({apitoken}) => {
    const APIURL = 'https://www.getrevue.co/api/v2/';
    const requestOptions = {
        prefixUrl: APIURL,
        headers: {
            authorization: `Token ${apitoken}`
        },
        responseType: 'json'
    };

    let {body: posts} = await got('issues', requestOptions);
    let {body: user} = await got('accounts/me', requestOptions);

    return {
        posts: posts,
        totals: {posts: posts.length},
        users: {url: user.profile_url}
    };
};

const cachedFetch = async (fileCache, options) => {
    let filename = `revue_api_${options.pubName}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await this.discover(options);

    await fileCache.writeTmpFile(response, filename);

    return response;
};

module.exports.tasks = async (options) => {
    const tasks = [{
        title: `Fetching posts from Revue`,
        task: async (ctx) => { // eslint-disable-line no-shadow
            try {
                ctx.result = await cachedFetch(ctx.fileCache, options);
            } catch (error) {
                ctx.errors.push(error);
                throw error;
            }
        }
    }];

    return tasks;
};
