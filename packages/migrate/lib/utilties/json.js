import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import fsUtils from '@tryghost/mg-fs-utils';
import {slugify} from '@tryghost/string';
import {hydrate} from '@tryghost/mg-json';
function findResourceRoot(ctx) {
    if (ctx.result?.posts) {
        return ctx.result;
    }

    if (ctx.result?.data?.posts) {
        return ctx.result.data;
    }

    if (ctx.result?.db?.[0]?.data?.posts) {
        return ctx.result.db[0].data;
    }

    return ctx.result;
}

const jsonTasks = {
    html: (options) => {
        let title = 'Convert HTML -> MobileDoc';

        if (options.htmlCard) {
            title += ' [HTML Card]';
        }

        return {
            // @TODO don't duplicate this with medium
            title: title,
            task: (ctx) => {
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx, options.htmlCard);
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

                    let posts = root.posts;
                    let tags = root.tags;
                    let users = root.users;

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
                    let users = root.users;

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

const getTaskRunner = (type, pathToJSON, options) => {
    let tasks = [
        {
            title: 'Initializing',
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
        }
    ];

    tasks.push(jsonTasks[type](options));

    tasks.push({
        title: 'Write Ghost JSON File',
        task: async (ctx) => {
            ctx.outputFile = await ctx.fileCache.writeGhostImportFile(ctx.result, {path: pathToJSON});
        }
    });

    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default getTaskRunner;
