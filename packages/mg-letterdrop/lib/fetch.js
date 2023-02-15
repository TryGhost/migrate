import got from 'got';
import {_base as debugFactory} from '@tryghost/debug';

const debug = debugFactory('migrate:letterdrop:fetch');

const discover = async ({apiToken}) => {
    const APIURL = 'https://app.letterdrop.com/api/v1/';
    let requestOptions = {
        prefixUrl: APIURL,
        method: 'POST',
        headers: {
            'api-key': apiToken
        },
        responseType: 'json',
        form: {
            offset: 0,
            limit: 20
        }
    };

    let response = null;
    let results = [];

    do {
        debug(`Fetch posts ${requestOptions.form.offset}:${(requestOptions.form.limit + requestOptions.form.offset)} posts from Letterdrop API`);
        response = await got('posts', requestOptions);
        requestOptions.form.offset = (requestOptions.form.offset + 20);
        results = results.concat(response.body.data);
    } while (response.body.meta.hasNextPage);

    return {
        posts: results,
        totals: {posts: results.length}
    };
};

const cachedFetch = async (fileCache, options) => {
    let filename = `letterdrop_api.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        debug(`Has cached Letterdrop API data`);
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await discover(options);

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const tasks = async (options) => {
    const tasks = [{ // eslint-disable-line no-shadow
        title: `Fetching posts from Letterdrop`,
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

export default {
    discover,
    tasks
};
