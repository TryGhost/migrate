import fetch from 'node-fetch';
import parser from 'xml2json';
import errors from '@tryghost/errors';
import {slugify} from '@tryghost/string';

const rssToJson = (rss) => {
    let json = parser.toJson(rss, {
        object: true
    });

    return json;
};

const cachedFetch = async (fileCache, url) => {
    try {
        let filename = `libsyn_rss.json`;

        if (fileCache.hasFile(filename, 'tmp')) {
            return await fileCache.readTmpJSONFile(filename);
        }

        const response = await fetch(url);
        const body = await response.text();
        const json = rssToJson(body);

        await fileCache.writeTmpFile(json, filename);

        return json;
    } catch (error) {
        throw new errors.InternalServerError({message: 'Could not fetch RSS content', error});
    }
};

const tasks = async ({url}, ctx) => {
    const subTasks = [];

    ctx.result = {
        author: {},
        tags: [],
        posts: []
    };

    subTasks.push({
        title: `Get RSS feed`,
        task: async (ctx) => { // eslint-disable-line no-shadow
            const rssURL = `${url}/rss/?include-libsyn-metadata=true`;

            try {
                let response = await cachedFetch(ctx.fileCache, rssURL);

                ctx.result.author = {
                    name: response.rss.channel['itunes:owner']['itunes:name'],
                    slug: slugify(response.rss.channel['itunes:owner']['itunes:name']),
                    email: response.rss.channel['itunes:owner']['itunes:email']
                };

                response.rss.channel['itunes:category'].forEach((item) => {
                    ctx.result.tags.push(item.text);
                    ctx.result.tags.push(item['itunes:category'].text);
                });

                ctx.result.posts = response.rss.channel.item;
            } catch (error) {
                ctx.errors.push(error);
                throw error;
            }
        }
    });

    return subTasks;
};

export default {
    tasks
};

export {
    rssToJson
};
