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
        users: {
            url: user.profile_url
        }
    };
};

const cachedFetch = async (fileCache, apitoken) => {
    let filename = `revue_api_${apitoken}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        console.log('Reading from fileCache');
        return await fileCache.readTmpJSONFile(filename);
    }
    console.log('fetching from API');
    let response = await this.discover(apitoken);

    await fileCache.writeTmpJSONFile(response, filename);

    return response;
};

module.exports.tasks = async ({apitoken}, ctx) => {
    console.log('module.exports.tasks -> ctx', ctx);
    const tasks = [{
        title: `Fetching posts from Revue`,
        task: async (ctx) => { // eslint-disable-line no-shadow
            try {
                ctx.result = await cachedFetch(ctx.fileCache, apitoken);
            } catch (error) {
                console.log('module.exports.tasks -> error', error);
                ctx.errors.push(error);
                throw error;
            }
        }
    }];

    return tasks;
};
