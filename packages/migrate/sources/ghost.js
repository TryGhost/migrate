import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import ghostAPI from '@tryghost/mg-ghost-api';
import {MigrateContext} from '@tryghost/mg-context';
import MgAssetScraper from '@tryghost/mg-assetscraper-db';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const initialize = (options) => {
    return {
        title: 'Initializing Workspace',
        task: async (ctx, task) => {
            ctx.options = options;

            ctx.allowScrape = {
                all: ctx.options.scrape.includes('all'),
                assets: ctx.options.scrape.includes('all') || ctx.options.scrape.includes('assets') || ctx.options.scrape.includes('img') || ctx.options.scrape.includes('media') || ctx.options.scrape.includes('files')
            };

            ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(ctx.options.url);
            ctx.fileCache = new fsUtils.FileCache(`ghost-${ctx.options.cacheName}`, {
                tmpPath: ctx.options.tmpPath,
                batchName: options.batch
            });

            ctx.migrateContext = new MigrateContext({
                contentFormat: 'lexical',
                dbPath: join(ctx.fileCache.tmpDir, 'mg-context.sqlite')
            });
            await ctx.migrateContext.init();

            ctx.assetScraper = new MgAssetScraper(ctx.fileCache, {
                allowAllDomains: true
            }, ctx);
            await ctx.assetScraper.init();

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;

            if (options.batch > 0) {
                task.title += ` batch ${ctx.fileCache.batchName}`;
            }
        }
    };
};

const getInfoTaskList = (options) => {
    return [
        initialize(options),
        {
            title: 'Fetch Content Info from Ghost API',
            task: async (ctx) => {
                try {
                    ctx.info = await ghostAPI.fetch.discover(options, ctx);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to get content from Ghost API', error});
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
        initialize(options),
        {
            title: 'Fetch Content from Ghost API',
            task: async (ctx) => {
                try {
                    let tasks = await ghostAPI.fetch.tasks(options, ctx);

                    if (options.batch !== 0) {
                        let batchIndex = options.batch - 1;
                        tasks = [tasks[batchIndex]];
                    }

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to get content from Ghost API', error});
                    throw error;
                }
            }
        },
        {
            title: 'Fetch images via AssetScraper',
            skip: ctx => !ctx.allowScrape.assets,
            task: async (ctx) => {
                try {
                    await ctx.migrateContext.forEachPost(async (post) => {
                        await ctx.assetScraper.processAssets(post);
                    });
                    await ctx.migrateContext.forEachTag(async (tag) => {
                        await ctx.assetScraper.processAssets(tag);
                    });
                    await ctx.migrateContext.forEachAuthor(async (author) => {
                        await ctx.assetScraper.processAssets(author);
                    });
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch images via AssetScraper', error});
                    throw error;
                }
            }
        },
        {
            title: 'Prepare data for export',
            task: async (ctx) => {
                try {
                    await ctx.migrateContext.prepareForExport();
                } catch (error) {
                    ctx.errors.push({message: 'Failed to prepare data for export', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON file(s)',
            task: async (ctx) => {
                try {
                    await ctx.migrateContext.writeGhostJson(ctx.fileCache.zipDir, {
                        batchSize: options.postsPerFile
                    });
                    await ctx.fileCache.writeErrorJSONFile(ctx.errors);
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write Ghost import JSON file', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx, task) => {
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const zipFinalPath = options.outputPath || process.cwd();
                    ctx.outputFile = await fsUtils.zip.write(zipFinalPath, ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-ghost-${ctx.options.cacheName}.zip`});
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
            title: 'Close MigrateContext',
            task: async (ctx) => {
                try {
                    await ctx.migrateContext.close();
                } catch (error) {
                    ctx.errors.push({message: 'Failed to close MigrateContext', error});
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
                    ctx.errors.push('Failed to clear cache', error);
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

    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getInfoTaskList,
    getFullTaskList,
    getTaskRunner
};
