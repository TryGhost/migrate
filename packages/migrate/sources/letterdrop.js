import {readFileSync} from 'node:fs';
import letterdropAPI from '@tryghost/mg-letterdrop';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {createGhostUserTasks} from '@tryghost/mg-ghost-authors';
import prettyMilliseconds from 'pretty-ms';

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;

            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`lettedrop-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                allowAllDomains: true
            }, ctx);
            await ctx.assetScraper.init();

            ctx.linkFixer = new MgLinkFixer();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
        }
    };
};

const getInfoTaskList = (options) => {
    return [{
        title: 'Fetching from API',
        task: async (ctx) => {
            ctx.info = await letterdropAPI.fetch.discover(options);
        }
    }];
};

const getFullTaskList = (options) => {
    return [
        initialize(options),
        {
            title: 'Fetch Content from Letterdrop API',
            task: async (ctx) => {
                // 1. Read all content from the API
                try {
                    let tasks = await letterdropAPI.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch content from Letterdrop API', error});
                    throw error;
                }
            }
        },
        {
            title: 'Process Letterdrop API JSON',
            task: async (ctx) => {
                // 2. Convert Letterdrop API JSON into a format that the migrate tools understand
                try {
                    ctx.result = letterdropAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'letterdrop-processed-data.json');
                } catch (error) {
                    ctx.errors.push({message: 'Failed to Process Letterdrop API JSON', error});
                    throw error;
                }
            }
        },
        ...createGhostUserTasks(options),
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to build link map', error});
                    throw error;
                }
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: async (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                try {
                    ctx.result = await toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to format data as Ghost JSON', error});
                    throw error;
                }
            }
        },
        {
            title: 'Fetch assets via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
                let tasks = ctx.assetScraper.getTasks();
                return makeTaskRunner(tasks, {
                    verbose: options.verbose,
                    exitOnError: false,
                    concurrent: false
                });
            }
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
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 8. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to convert HTML -> MobileDoc', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 9. Write a valid Ghost import zip
                try {
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write Ghost import JSON File', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                // 10. Write a valid Ghost import zip
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const zipFinalPath = options.outputPath || process.cwd();
                    // zip the file and save it temporarily
                    ctx.outputFile = await fsUtils.zip.write(zipFinalPath, ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        // read the file buffer
                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        // Upload the file to the storage
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-letterdrop-${ctx.options.cacheName}.zip`});
                        // now that the file is uploaded to the storage, delete the local zip file
                        await fsUtils.zip.deleteFile(localFilePath);
                    }

                    task.output = `Successfully written zip to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write and upload ZIP file', error});
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
                    ctx.errors.push({message: 'Failed to clear temporary cached files', error});
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
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
