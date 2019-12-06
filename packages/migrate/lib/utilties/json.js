const makeTaskRunner = require('../task-runner');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const fsUtils = require('@tryghost/mg-fs-utils');
const {slugify} = require('@tryghost/string');
const hydrate = require('@tryghost/mg-json/lib/to-ghost-json/hydrate');
const get = require('lodash.get');

function findResourceRoot(ctx) {
    let root = 'result';
    let posts = ctx.result.posts;

    if (!posts && ctx.result.data && ctx.result.data.posts) {
        posts = ctx.result.data.posts;
        root = 'result.data';
    }

    if (!posts && ctx.result.db && ctx.result.db[0] && ctx.result.db[0].data && ctx.result.db[0].data.posts) {
        posts = ctx.result.db[0].data.posts;
        root = 'result.db[0].data';
    }

    return root;
}

const jsonTasks = {
    html: (options) => {
        return {
            // @TODO don't duplicate this with medium
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        };
    },
    slugify: (options) => {
        return {
            // @TODO don't duplicate this!
            title: 'Add valid slugs',
            task: (ctx) => {
                try {
                    // @TODO: clean this up!
                    let root = findResourceRoot(ctx);

                    let posts = get(ctx, `${root}.posts`);
                    let tags = get(ctx, `${root}.tags`);
                    let users = get(ctx, `${root}.users`);

                    let resources = posts;

                    if (tags) {
                        resources = resources.concat(tags);
                    }

                    if (users) {
                        resources = resources.concat(users);
                    }

                    let tasks = resources.map((resource) => {
                        return {
                            title: resource.title || resource.name,
                            task: () => {
                                if (!resource.slug) {
                                    if (resource.title) {
                                        resource.slug = slugify(resource.title);
                                    } else if (resource.name) {
                                        resource.slug = slugify(resource.name);
                                    }
                                }
                            }
                        };
                    });

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        };
    },
    email: (options) => {
        return {
            title: 'Add fake email addresses, where they are missing',
            task: (ctx) => {
                try {
                    // @TODO: clean this up!
                    let root = findResourceRoot(ctx);
                    let users = get(ctx, `${root}.users`);

                    let tasks = users.map((user) => {
                        return {
                            title: user.name || user.slug,
                            task: () => {
                                user = hydrate.users(user, {});
                            }
                        };
                    });

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        };
    }
};

module.exports.getTaskRunner = (type, pathToJSON, options) => {
    let tasks = [
        {
            title: 'Initialising',
            task: (ctx) => {
                ctx.options = options;
                ctx.fileCache = new fsUtils.FileCache(pathToJSON);
            }
        },
        {
            title: 'Read Ghost JSON file',
            task: async (ctx) => {
                ctx.result = await fsUtils.ghostJSON.read(pathToJSON);
            }
        }];

    tasks.push(jsonTasks[type](options));

    tasks.push({
        title: 'Write Ghost JSON File',
        task: async (ctx) => {
            ctx.outputFile = await ctx.fileCache.writeGhostJSONFile(ctx.result, {path: pathToJSON});
        }
    });

    return makeTaskRunner(tasks, options);
};
