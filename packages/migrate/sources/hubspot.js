import hsAPI from '@tryghost/mg-hubspot-api';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const initAPI = (options) => {
    return {
        title: 'Initializing API',
        task: async (ctx, task) => {
            ctx.info = await hsAPI.discover(options);
            task.title += ` for ${ctx.info.blog.url}`;
            options.url = ctx.info.blog.url;
        }
    };
};

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;
            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                images: ctx.options.scrape.includes('img') || ctx.options.scrape.includes('all'),
                media: ctx.options.scrape.includes('media') || ctx.options.scrape.includes('all'),
                files: ctx.options.scrape.includes('files') || ctx.options.scrape.includes('all'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(options.url, {batchName: options.batch});
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                sizeLimit: ctx.options.sizeLimit,
                allowImages: ctx.allowScrape.images,
                allowMedia: ctx.allowScrape.media,
                allowFiles: ctx.allowScrape.files
            }, ctx);

            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

const getInfoTaskList = (options) => {
    return [
        initAPI(options)
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
const getFullTaskList = (options) => {
    return [
        initAPI(options),
        initialize(options),
        {
            title: 'Fetch Content from Hubspot API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await hsAPI.fetch.tasks(options, ctx);

                    if (options.batch !== 0) {
                        let batchIndex = options.batch - 1;
                        tasks = [tasks[batchIndex]];
                    }

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Process Hubspot API JSON',
            task: async (ctx) => {
                // 2. Convert Hubspot API JSON into a format that the migrate tools understand
                try {
                    ctx.result = hsAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'hubspot-processed-data.json');
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
                    ctx.result = toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: (ctx) => {
                return [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false);
            },
            task: async (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                let tasks = ctx.assetScraper.fetch(ctx);
                let assetScraperOptions = JSON.parse(JSON.stringify(options)); // Clone the options object
                assetScraperOptions.concurrent = false;
                return makeTaskRunner(tasks, assetScraperOptions);
            }
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
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
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
            task: async (ctx, task) => {
                // 9. Write a valid Ghost import zip
                try {
                    let timer = Date.now();
                    ctx.outputFile = await fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        }
    ];
};

const getTaskRunner = (options) => {
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(options);
    } else {
        tasks = getFullTaskList(options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initAPI,
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
