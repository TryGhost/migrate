import errors from '@tryghost/errors';

const API_LIMIT = 100;

const authedClient = async (apiKey: string, theUrl: URL) => {
    return fetch(theUrl, {
        method: 'GET',
        headers: {
            Authorization: `Bearer ${apiKey}`
        }
    });
};

const getErrorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

const discover = async (key: string, pubId: string) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}`);
    url.searchParams.append('limit', '1');
    url.searchParams.append('expand[]', 'stats');

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data: BeehiivPublicationResponse = await response.json();

    return data.data.stats?.active_subscriptions;
};

const cachedFetch = async ({
    fileCache,
    key,
    pubId,
    cursor,
    cursorIndex
}: {
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
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data: BeehiivSubscriptionsResponse = await response.json();

    await fileCache.writeTmpFile(data, filename);

    return data;
};

const cachedFetchSegments = async ({
    fileCache,
    key,
    pubId,
    page
}: {
    fileCache: any;
    key: string;
    pubId: string;
    page: number;
}) => {
    const filename = `beehiiv_api_members_segments_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/segments`);
    url.searchParams.append('limit', API_LIMIT.toString());
    url.searchParams.append('page', page.toString());

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data: BeehiivSegmentsResponse = await response.json();

    await fileCache.writeTmpFile(data, filename);

    return data;
};

const cachedFetchSegmentMembers = async ({
    fileCache,
    key,
    pubId,
    segmentId,
    page
}: {
    fileCache: any;
    key: string;
    pubId: string;
    segmentId: string;
    page: number;
}) => {
    const filename = `beehiiv_api_members_segment_${segmentId}_${page}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    const url = new URL(`https://api.beehiiv.com/v2/publications/${pubId}/segments/${segmentId}/members`);
    url.searchParams.append('limit', API_LIMIT.toString());
    url.searchParams.append('page', page.toString());

    const response = await authedClient(key, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data: BeehiivSegmentMembersResponse = await response.json();

    await fileCache.writeTmpFile(data, filename);

    return data;
};

const fetchSegments = async ({
    fileCache,
    key,
    pubId
}: {
    fileCache: any;
    key: string;
    pubId: string;
}): Promise<BeehiivSegment[]> => {
    const segments: BeehiivSegment[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
        const response: BeehiivSegmentsResponse = await cachedFetchSegments({
            fileCache,
            key,
            pubId,
            page
        });

        segments.push(...response.data);
        totalPages = response.total_pages;
        page += 1;
    }

    return segments;
};

const fetchSegmentMemberships = async ({
    fileCache,
    key,
    pubId,
    segments
}: {
    fileCache: any;
    key: string;
    pubId: string;
    segments: BeehiivSegment[];
}): Promise<BeehiivSegmentMemberships> => {
    const memberships: BeehiivSegmentMemberships = {};

    for (const segment of segments) {
        let page = 1;
        let totalPages = 1;

        while (page <= totalPages) {
            const response: BeehiivSegmentMembersResponse = await cachedFetchSegmentMembers({
                fileCache,
                key,
                pubId,
                segmentId: segment.id,
                page
            });

            for (const member of response.data) {
                const segmentNames = memberships[member.id] ?? [];
                memberships[member.id] = [...new Set([...segmentNames, segment.name])];
            }

            totalPages = response.total_pages;
            page += 1;
        }
    }

    return memberships;
};

export const fetchTasks = async (options: any, ctx: any) => {
    const totalSubscriptions = (await discover(options.key, options.id)) ?? 0;
    const estimatedPages = totalSubscriptions > 0 ? Math.ceil(totalSubscriptions / API_LIMIT) : 0;

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
                        task.output = getErrorMessage(error);
                        throw error;
                    }
                }

                task.output = `Fetched ${ctx.result.subscriptions.length} subscriptions`;
            }
        }
    ];

    if (options.segments) {
        tasks.push({
            title: 'Fetching segments and segment memberships',
            task: async (_: any, task: any) => {
                try {
                    const segments = await fetchSegments({
                        fileCache: ctx.fileCache,
                        key: options.key,
                        pubId: options.id
                    });

                    const segmentMemberships = await fetchSegmentMemberships({
                        fileCache: ctx.fileCache,
                        key: options.key,
                        pubId: options.id,
                        segments
                    });
                    ctx.result.segmentMemberships = segmentMemberships;

                    const membershipCount = Object.values(segmentMemberships).reduce(
                        (total, segmentNames) => total + segmentNames.length,
                        0
                    );
                    task.output = `Fetched ${segments.length} segments and ${membershipCount} segment memberships`;
                } catch (error) {
                    task.output = getErrorMessage(error);
                    throw error;
                }
            }
        });
    }

    return tasks;
};

export {
    authedClient,
    discover,
    cachedFetch,
    cachedFetchSegments,
    cachedFetchSegmentMembers,
    fetchSegments,
    fetchSegmentMemberships
};
