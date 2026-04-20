import errors from '@tryghost/errors';
import {authedClient} from './fetch.js';

type PublicationData = {
    id: string;
    name: string;
    created: Date;
    allSubscribers: number;
    paidSubscribers: number;
    freeSubscribers: number;
    postCount: number;
    url: string;
};

const listPublications = async (apiKey: string) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications`);
    url.searchParams.append('expand[]', 'stats');

    const response = await authedClient(apiKey, url);

    if (!response.ok) {
        throw new errors.InternalServerError({
            message: `Request failed: ${response.status} ${response.statusText}`,
            context: `GET ${new URL(response.url).pathname}`
        });
    }

    const data = await response.json();

    let sites: any = [];

    // Get post count and domain for each publication
    for (const pub of data.data) {
        // Sleep for 100 ms to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100)); // eslint-disable-line no-promise-executor-return

        const postsUrl = new URL(`https://api.beehiiv.com/v2/publications/${pub.id}/posts`);
        postsUrl.searchParams.append('limit', '1');

        const postsResponse = await authedClient(apiKey, postsUrl);

        if (postsResponse.ok) {
            const postsData = await postsResponse.json();

            let resp: PublicationData = {} as PublicationData;

            resp.id = pub.id;
            resp.name = pub.name;
            resp.created = new Date(pub.created * 1000);
            resp.allSubscribers = pub.stats?.active_subscriptions ?? 0;
            resp.paidSubscribers = pub.stats?.active_premium_subscriptions ?? 0;
            resp.freeSubscribers = pub.stats?.active_free_subscriptions ?? 0;

            resp.postCount = postsData.total_results;

            const firstPost = postsData.data?.[0];
            if (firstPost?.web_url) {
                resp.url = new URL(firstPost.web_url).origin;
            }

            console.log(resp); // eslint-disable-line no-console

            sites.push(resp);
        }
    }

    return sites;
};

export {
    listPublications
};
