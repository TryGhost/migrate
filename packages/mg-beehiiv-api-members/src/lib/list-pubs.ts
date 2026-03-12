import errors from '@tryghost/errors';
import {authedClient} from './fetch.js';

const listPublications = async (apiKey: string) => {
    const url = new URL(`https://api.beehiiv.com/v2/publications`);
    url.searchParams.append('expand[]', 'stats');

    const response = await authedClient(apiKey, url);

    if (!response.ok) {
        throw new errors.InternalServerError({message: `Request failed: ${response.status} ${response.statusText}`});
    }

    const data = await response.json();

    return data.data;
};

export {
    listPublications
};
