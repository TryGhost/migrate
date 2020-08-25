const revueAPI = require('@tryghost/mg-revue-api');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const MgWebScraper = require('@tryghost/mg-webscraper');
const MgImageScraper = require('@tryghost/mg-imagescraper');
const MgLinkFixer = require('@tryghost/mg-linkfixer');
const fsUtils = require('@tryghost/mg-fs-utils');
const makeTaskRunner = require('../lib/task-runner');

const scrapeConfig = {
    posts: {
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        og_image: {
            selector: 'meta[property="og:image"]',
            attr: 'content'
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        },
        og_description: {
            selector: 'meta[property="og:description"]',
            attr: 'content',
            convert: (x) => {
                if (!x) {
                    return;
                }
                return x.slice(0, 499);
            }
        },
        twitter_image: {
            selector: 'meta[name="twitter:image"], meta[name="twitter:image:src"]',
            attr: 'content'
        },
        twitter_title: {
            selector: 'meta[name="twitter:title"]',
            attr: 'content'
        },
        twitter_description: {
            selector: 'meta[name="twitter:description"]',
            attr: 'content',
            convert: (x) => {
                return x.slice(0, 499);
            }
        }
    },
    users: {
        name: {
            selector: 'meta[name="author"]',
            attr: 'content'
        }
    }
};

module.exports.initAPI = (options) => {
    return {
        title: 'Initialising API',
        task: async (ctx) => {
            ctx.result = await revueAPI.discover(options);
        }
    };
};

module.exports.initialise = (options) => {
    return {
        title: 'Initialising Workspace',
        task: (ctx, task) => {
            ctx.options = options;

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(options.apitoken);
            ctx.wpScraper = new MgWebScraper(ctx.fileCache, scrapeConfig);
            ctx.imageScraper = new MgImageScraper(ctx.fileCache);
            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialised at ${ctx.fileCache.cacheDir}`;
        }
    };
};

module.exports.getInfoTaskList = (options) => {
    return [
        this.initAPI(options)
    ];
};

/**
 * getFullTaskList: Steps to Migrate from Hubspot
 *
 * Wiring of the steps to migrate from hubspot.
 *
 * @param {String} url
 * @param {Object} options
 */
module.exports.getFullTaskList = (options) => {
    return [
        this.initAPI(options),
        this.initialise(options),
        {
            title: 'Fetch Content from Revue API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await revueAPI.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Process Revue API JSON',
            task: async (ctx) => {
                console.log('module.exports.getFullTaskList -> ctx', ctx);
                // 2. Convert Revue API JSON into a format that the migrate tools understand
                try {
                    ctx.result = revueAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpJSONFile(ctx.result, 'revue-processed-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 3. Create a map of all known links for use later
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: (ctx) => {
                // 4. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via ImageSraper',
            task: async (ctx) => {
                // 5. Pass the JSON file through the image scraper
                let tasks = ctx.imageScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'img'].indexOf(options.scrape) < 0
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 6. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 7. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 8. Write a valid Ghost import zip
                try {
                    await ctx.fileCache.writeGhostJSONFile(ctx.result);
                    await ctx.fileCache.writeErrorJSONFile(ctx.errors);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx) => {
                // 9. Write a valid Ghost import zip
                try {
                    ctx.outputFile = fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        }
    ];
};

module.exports.getTaskRunner = (options) => {
    let tasks = [];

    if (options.info) {
        tasks = this.getInfoTaskList(options);
    } else {
        tasks = this.getFullTaskList(options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};
