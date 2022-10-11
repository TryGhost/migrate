import ghostAPI from '@tryghost/mg-ghost-api';
import {toGhostJSON} from '@tryghost/mg-json';
import MgImageScraper from '@tryghost/mg-imagescraper';
import MgMediaScraper from '@tryghost/mg-mediascraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import makeTaskRunner from '../lib/task-runner.js';

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(options.url, {batchName: options.batch});
            ctx.imageScraper = new MgImageScraper(ctx.fileCache);

            ctx.sizeReports = {};
            ctx.mediaScraper = new MgMediaScraper(ctx.fileCache, {
                sizeLimit: ctx.options.size_limit || false
            });

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
        this.initialize(options),
        {
            title: 'Fetch Content Info from Ghost API',
            task: async (ctx) => {
                try {
                    ctx.info = await ghostAPI.fetch.discover(options, ctx);
                } catch (error) {
                    ctx.errors.push(error);
                }
            }
        }
    ];
};

/**
 * getFullTaskList: Full Steps to Migrate from Ghost
 *
 * Wiring of the steps to migrate from Ghost.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
const getFullTaskList = (options) => {
    return [
        this.initialize(options),
        {
            title: 'Fetch Content from Ghost API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await ghostAPI.fetch.tasks(options, ctx);

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
            title: 'Process Ghost API JSON',
            task: async (ctx) => {
                // 2. Convert Ghost API JSON into a format that the migrate tools understand
                try {
                    ctx.result = await ghostAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'gh-processed-data.json');
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
            title: 'Fetch images via ImageScraper',
            task: async (ctx) => {
                // 5. Pass the JSON file through the image scraper
                let tasks = ctx.imageScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'img'].indexOf(options.scrape) < 0
        },
        {
            title: 'Fetch media via MediaScraper',
            task: async (ctx) => {
                // 6. Pass the JSON file through the file scraper
                let tasks = ctx.mediaScraper.fetch(ctx);
                return makeTaskRunner(tasks, options);
            },
            skip: () => ['all', 'media'].indexOf(options.scrape) < 0
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 7. Process the content looking for known links, and update them to new links
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
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
            title: 'Report file sizes',
            skip: () => !options.size_limit,
            task: async (ctx) => {
                // 9. Report assets that were not downloaded
                try {
                    ctx.sizeReports.media = await ctx.fileCache.writeReportCSVFile(ctx.mediaScraper.sizeReport, {filename: 'media', sizeLimit: options.size_limit});
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
                // 10. Write a valid Ghost import zip
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

const getTaskRunner = (options) => {
    let tasks = [];

    if (options.info) {
        tasks = this.getInfoTaskList(options);
    } else {
        tasks = this.getFullTaskList(options);
    }

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
