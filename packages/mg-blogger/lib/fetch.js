import errors from '@tryghost/errors';
import fetch from 'node-fetch';

const getSiteContent = async (apiKey, blogID, type = 'posts') => {
    let response = {
        nextPageToken: true
    };
    let results = [];
    let pageToken = false;

    do {
        try {
            const searchParams = new URLSearchParams({
                key: apiKey
            });

            if (pageToken) {
                searchParams.set('pageToken', pageToken);
            }

            let reqUrl = `https://www.googleapis.com/blogger/v3/blogs/${blogID}/${type}?` + searchParams;

            let request = await fetch(reqUrl);

            response = await request.json();
            results = results.concat(response.items);
            pageToken = response.nextPageToken;
        } catch (error) {
            throw new errors.InternalServerError({message: 'Failed to fetch Blogger content', error});
        }
    } while (response.nextPageToken);

    return results;
};

const cachedFetch = async (fileCache, apiKey, blogID, type) => {
    let filename = `blogger_api_${blogID}_${type}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await getSiteContent(apiKey, blogID, type);

    await fileCache.writeTmpFile(response, filename);

    return response;
};

const tasks = async ({apiKey, blogID}, ctx) => {
    const tasks = []; // eslint-disable-line no-shadow

    ctx.result = {
        posts: []
    };

    blogID.forEach((singleblogID) => {
        tasks.push({
            title: `Fetching posts for ${singleblogID}`,
            task: async (ctx) => { // eslint-disable-line no-shadow
                try {
                    let response = await cachedFetch(ctx.fileCache, apiKey, singleblogID, 'posts');

                    ctx.result.posts = ctx.result.posts.concat(response);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        });
    });

    return tasks;
};

export default {
    tasks
};
