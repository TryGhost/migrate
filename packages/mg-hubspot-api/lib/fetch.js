const hsAPI = require('hubspot-api');
const errors = require('@tryghost/errors');

const processBlogResult = (blogs) => {
    let results = [];

    blogs.objects.forEach((blog) => {
        let result = {
            id: blog.id,
            name: blog.name,
            url: blog.absolute_url,
            description: blog.description
        };

        results.push(result);
    });

    return results;
};

module.exports.discover = async ({hapikey, url, limit}) => {
    const hs = new hsAPI({hapikey});

    let blogs = await hs.blog.getAllBlogs();
    let blog;

    blogs = processBlogResult(blogs);

    if (url) {
        blog = blogs.find(singleBlog => singleBlog.url === url);
    }

    if (!blog && blogs.length === 1) {
        blog = blogs[0];
    }

    if (!blog && blogs.length === 2) {
        blog = blogs.find(singleBlog => singleBlog.name !== 'Default HubSpot Blog');
    }

    if (!blog) {
        throw new errors.NotFoundError({message: 'Unable to determine which blog to import'});
    }

    // We fetch all topics right away (assuming no one has anymore than 1000 which is the max)
    let topics = await hs.blog.getTopics({content_group_id: blog.id, limit: 1000});
    let posts = await hs.blog.getPosts({content_group_id: blog.id, limit});

    return {
        blog,
        topics: topics.objects || [],
        totals: {posts: posts.total},
        batches: {posts: Math.ceil(posts.total / limit)}
    };
};

const cachedFetch = async (fileCache, hapikey, blogId, limit, offset) => {
    const hs = new hsAPI({hapikey});
    let filename = `hs_api_${blogId}_${limit}_${offset}.json`;

    if (fileCache.hasFile(filename, 'tmp')) {
        return await fileCache.readTmpJSONFile(filename);
    }

    let response = await hs.blog.getPosts({content_group_id: blogId, limit, offset});
    response = response.objects;

    await fileCache.writeTmpFile(response, filename);

    return response;
};

module.exports.tasks = async ({hapikey, limit}, ctx) => {
    let info = ctx.info;
    const tasks = [];

    ctx.result = {
        posts: []
    };

    for (let page = 1; page <= info.batches.posts; page++) {
        let offset = (page - 1) * limit;

        tasks.push({
            title: `Fetching posts, page ${page} of ${info.batches.posts}`,
            task: async (ctx) => { // eslint-disable-line no-shadow
                try {
                    let response = await cachedFetch(ctx.fileCache, hapikey, info.blog.id, limit, offset);

                    // This is weird, but we don't yet deal with pages as a separate concept in imports
                    ctx.result.posts = ctx.result.posts.concat(response);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        });
    }

    return tasks;
};
