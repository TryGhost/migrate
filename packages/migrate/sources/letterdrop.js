import {readFileSync} from 'node:fs';
import letterdropAPI from '@tryghost/mg-letterdrop';
import {toGhostJSON} from '@tryghost/mg-json';
import mgHtmlMobiledoc from '@tryghost/mg-html-mobiledoc';
import MgAssetScraper from '@tryghost/mg-assetscraper';
import MgLinkFixer from '@tryghost/mg-linkfixer';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const initialize = (options, logger) => {
    logger.info({message: 'Initialize migration'});
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;
            ctx.logger = logger;
            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                images: ctx.options.scrape.includes('img') || ctx.options.scrape.includes('all'),
                media: ctx.options.scrape.includes('media') || ctx.options.scrape.includes('all'),
                files: ctx.options.scrape.includes('files') || ctx.options.scrape.includes('all'),
                web: ctx.options.scrape.includes('web') || ctx.options.scrape.includes('all')
            };

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`lettedrop-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath
            });
            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                sizeLimit: ctx.options.sizeLimit,
                allowImages: ctx.allowScrape.images,
                allowMedia: ctx.allowScrape.media,
                allowFiles: ctx.allowScrape.files
            }, ctx);

            ctx.linkFixer = new MgLinkFixer();

            ctx.timings = {
                fetchApiContent: false,
                processContent: false,
                buildLinkMap: false,
                formatDataAsGhost: false,
                assetScraper: false,
                linkFixer: false,
                htmlToMobiledoc: false,
                writeJSON: false,
                writeZip: false,
                clearCache: false
            };

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

const getFullTaskList = (options, logger) => {
    return [
        initialize(options, logger),
        {
            title: 'Fetch Content from Letterdrop API',
            task: async (ctx) => {
                // 1. Read all content from the API
                ctx.timings.fetchApiContent = Date.now();
                try {
                    let tasks = await letterdropAPI.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to fetch content from Letterdrop API', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch Content from Letterdrop API',
                    duration: Date.now() - ctx.timings.fetchApiContent
                });
            }
        },
        {
            title: 'Process Letterdrop API JSON',
            task: async (ctx) => {
                // 2. Convert Letterdrop API JSON into a format that the migrate tools understand
                ctx.timings.processContent = Date.now();
                try {
                    ctx.result = letterdropAPI.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'letterdrop-processed-data.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to Process Letterdrop API JSON', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Process Letterdrop API JSON',
                    duration: Date.now() - ctx.timings.processContent
                });
            }
        },
        {
            title: 'Build Link Map',
            task: async (ctx) => {
                // 4. Create a map of all known links for use later
                ctx.timings.buildLinkMap = Date.now();
                try {
                    ctx.linkFixer.buildMap(ctx);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to build link map', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Build Link Map',
                    duration: Date.now() - ctx.timings.buildLinkMap
                });
            }
        },
        {
            title: 'Format data as Ghost JSON',
            task: (ctx) => {
                // 5. Format the data as a valid Ghost JSON file
                ctx.timings.formatDataAsGhost = Date.now();
                try {
                    ctx.result = toGhostJSON(ctx.result, ctx.options, ctx);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to format data as Ghost JSON', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Format data as Ghost JSON',
                    duration: Date.now() - ctx.timings.formatDataAsGhost
                });
            }
        },
        {
            title: 'Fetch assets via AssetScraper',
            skip: (ctx) => {
                if ([ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false)) {
                    return true;
                }
            },
            task: async (ctx) => {
                // 6. Format the data as a valid Ghost JSON file
                ctx.timings.assetScraper = Date.now();
                let tasks = ctx.assetScraper.fetch(ctx);
                return makeTaskRunner(tasks, {
                    verbose: options.verbose,
                    exitOnError: false,
                    concurrent: false
                });
            }
        },
        {
            skip: ctx => [ctx.allowScrape.images, ctx.allowScrape.media, ctx.allowScrape.files].every(element => element === false),
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Fetch assets via AssetScraper',
                    duration: Date.now() - ctx.timings.assetScraper
                });
            }
        },
        {
            title: 'Update links in content via LinkFixer',
            task: async (ctx, task) => {
                // 7. Process the content looking for known links, and update them to new links
                ctx.timings.linkFixer = Date.now();
                let tasks = ctx.linkFixer.fix(ctx, task);
                return makeTaskRunner(tasks, options);
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Update links in content via LinkFixer',
                    duration: Date.now() - ctx.timings.linkFixer
                });
            }
        },
        {
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 8. Convert post HTML -> MobileDoc
                ctx.timings.htmlToMobiledoc = Date.now();
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to convert HTML -> MobileDoc', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Convert HTML -> MobileDoc',
                    duration: Date.now() - ctx.timings.htmlToMobiledoc
                });
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
                // 9. Write a valid Ghost import zip
                ctx.timings.writeJSON = Date.now();
                try {
                    await ctx.fileCache.writeGhostImportFile(ctx.result);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write Ghost import JSON File', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Write Ghost import JSON File',
                    duration: Date.now() - ctx.timings.writeJSON
                });
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                // 10. Write a valid Ghost import zip
                ctx.timings.writeZip = Date.now();
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
                    ctx.logger.error({message: 'Failed to write and upload ZIP file', error});
                    throw error;
                }
            }
        },
        {
            skip: () => !options.zip,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Write Ghost import zip',
                    duration: Date.now() - ctx.timings.writeZip
                });
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache && options.zip,
            task: async (ctx) => {
                ctx.timings.clearCache = Date.now();
                try {
                    await ctx.fileCache.emptyCurrentCacheDir();
                } catch (error) {
                    ctx.logger.error({message: 'Failed to clear temporary cached files', error});
                    throw error;
                }
            }
        },
        {
            enabled: () => !options.cache && options.zip,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Clearing cached files',
                    duration: Date.now() - ctx.timings.clearCache
                });
            }
        }
    ];
};

const getTaskRunner = (options, logger) => {
    let tasks = [];

    if (options.info) {
        tasks = getInfoTaskList(options, logger);
    } else {
        tasks = getFullTaskList(options, logger);
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
