import errors from '@tryghost/errors';

const API_LIMIT = 10;

const authedClient = async (apiKey: string, theUrl: URL) => {
    return fetch(theUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
};

const discover = async (key: string, pubId: string, limit: number) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/posts`);
    url.searchParams.append('limit', '1');

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data = await response.json();

    return data.total_results;
};

const cachedFetch = async ({fileCache, key, pubId, limit = API_LIMIT, page}: {fileCache: any, key: string, pubId: string, limit?: number, page: number}) => {
    let filename = `beehiiv_api_${limit}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/posts`);
    url.searchParams.append('limit', limit.toString());
    url.searchParams.append('expand', 'free_web_content');
    url.searchParams.append('expand', 'premium_web_content');
    url.searchParams.append('page', page.toString());

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data = await response.json();

    await fileCache.writeTmpFile(data, filename);

    return data;
};

export const fetchTasks = async (options: any, ctx: any) => {
    const numberOfPosts = await discover(options.key, options.id, API_LIMIT);
    const totalPages = Math.ceil(numberOfPosts / API_LIMIT);

    let tasks = [];

    for (let page = 1; page <= totalPages; page++) {
        tasks.push({
            title: `Fetching posts page ${page} of ${totalPages}`,
            task: async (_: any, task: any) => {
                try {
                    let response = await cachedFetch({fileCache: ctx.fileCache ,key: options.key, pubId: options.id, page: page});

                    ctx.result.posts = ctx.result.posts.concat(response.data);

                    if (options.postsAfter) {
                        const afterTimestamp = new Date(options.postsAfter).getTime() / 1000;
                        ctx.result.posts = ctx.result.posts.filter(
                            (post: any) => post.publish_date >= afterTimestamp
                        );
                    }
                    if (options.postsBefore) {
                        const beforeTimestamp = new Date(options.postsBefore).getTime() / 1000;
                        ctx.result.posts = ctx.result.posts.filter(
                            (post: any) => post.publish_date <= beforeTimestamp
                        );
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    task.output = errorMessage;
                    throw error;
                }
            }
        });
    }

    return tasks;
};

export {
    authedClient
};
