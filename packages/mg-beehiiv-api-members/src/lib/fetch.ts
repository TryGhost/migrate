const API_LIMIT = 100;

const authedClient = async (apiKey: string, theUrl: URL) => {
    return fetch(theUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
};

const discover = async (key: string, pubId: string) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}`);
    url.searchParams.append('limit', '1');
    url.searchParams.append('expand[]', 'stats');

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data: BeehiivPublicationResponse = await response.json();

    return data.data.stats?.active_subscriptions;
};

const cachedFetch = async ({fileCache, key, pubId, cursor, cursorIndex}: {
    fileCache: any;
    key: string;
    pubId: string;
    cursor: string | null;
    cursorIndex: number;
}) => {
    const filename = `beehiiv_api_members_${cursorIndex}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/subscriptions`);
    url.searchParams.append('limit', API_LIMIT.toString());
    url.searchParams.append('status', 'active');
    url.searchParams.append('expand[]', 'custom_fields');

    if (cursor) {
        url.searchParams.append('cursor', cursor);
    }

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
    }

    const data: BeehiivSubscriptionsResponse = await response.json();

    await fileCache.writeTmpFile(data, filename);

    return data;
};

export const fetchTasks = async (options: any, ctx: any) => {
    const totalSubscriptions = await discover(options.key, options.id);
    const estimatedPages = Math.ceil(totalSubscriptions / API_LIMIT);

    const tasks = [
        {
            title: `Fetching subscriptions (estimated ${estimatedPages} pages)`,
            task: async (_: any, task: any) => {
                let cursor: string | null = null;
                let hasMore = true;
                let cursorIndex = 0;

                ctx.result.subscriptions = [];

                while (hasMore) {
                    try {
                        const response: BeehiivSubscriptionsResponse = await cachedFetch({
                            fileCache: ctx.fileCache,
                            key: options.key,
                            pubId: options.id,
                            cursor,
                            cursorIndex
                        });

                        ctx.result.subscriptions = ctx.result.subscriptions.concat(response.data);
                        hasMore = response.has_more;
                        cursor = response.next_cursor;
                        cursorIndex += 1;

                        task.output = `Fetched ${ctx.result.subscriptions.length} of ${totalSubscriptions} subscriptions`;
                    } catch (error) {
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        task.output = errorMessage;
                        throw error;
                    }
                }

                task.output = `Fetched ${ctx.result.subscriptions.length} subscriptions`;
            }
        }
    ];

    return tasks;
};

export {
    authedClient,
    discover,
    cachedFetch
};
