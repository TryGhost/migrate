import errors from '@tryghost/errors';
import {authedClient, discover} from './fetch.js';

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

    let pubData = data.data;

    // Get post count for each publication
    for (const pub of pubData) {
        // Sleep for 100 ms to avoid hitting rate limits
        await new Promise(resolve => setTimeout(resolve, 100)); // eslint-disable-line no-promise-executor-return
        let postCount = await discover(apiKey, pub.id);
        pub.postCount = postCount;
    }

    return pubData;
};

export {
    listPublications
};
