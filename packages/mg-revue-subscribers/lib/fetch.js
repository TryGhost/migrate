import got from 'got';
import errors from '@tryghost/errors';

const validateToken = async ({apitoken}) => {
    const APIURL = 'https://www.getrevue.co/api/v2/';
    const requestOptions = {
        prefixUrl: APIURL,
        headers: {
            authorization: `Token ${apitoken}`
        },
        responseType: 'json'
    };

    try {
        await got('lists', requestOptions);
        return true;
    } catch (error) {
        throw new errors.BadRequestError({
            message: 'API token not is not authorized or invalid',
            error
        });
    }
};

const discover = async ({apitoken}) => {
    const APIURL = 'https://www.getrevue.co/api/v2/';
    const requestOptions = {
        prefixUrl: APIURL,
        headers: {
            authorization: `Token ${apitoken}`
        },
        responseType: 'json'
    };

    let {body: subscribers} = await got('subscribers', requestOptions);

    return {
        subscribers: subscribers,
        totals: {subscribers: subscribers.length}
    };
};

const cachedFetch = async (fileCache, options) => {
    let filename = `revue_subscribers_api.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await discover(options);

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const tasks = async (options) => {
    const tasks = [{ // eslint-disable-line no-shadow
        title: `Fetching subscribers from Revue`,
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
    validateToken,
    discover,
    tasks
};
