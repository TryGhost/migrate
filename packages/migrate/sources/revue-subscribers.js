import revueSubscribers from '@tryghost/mg-revue-subscribers';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {v4 as uuidv4} from 'uuid';

const initialize = (options, logger) => {
    logger.info({message: 'Initialize migration'});
    return {
        title: 'Initializing Workspace',
        task: (ctx, task) => {
            ctx.options = options;
            ctx.logger = logger;

            // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
            ctx.fileCache = new fsUtils.FileCache(`revue-${ctx.options.cacheName || uuidv4()}`, {
                tmpPath: ctx.options.tmpPath
            });

            ctx.timings = {
                fetchApiContent: false,
                processContent: false,
                writeCsv: false,
                clearCache: false
            };

            task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
        }
    };
};

/**
 * @param {String} url
 * @param {Object} options
 */
const getFullTaskList = (options, logger) => {
    return [
        initialize(options, logger),
        {
            title: 'Fetch Content from Revue API',
            task: async (ctx) => {
                // 1. Read all content from the API
                ctx.timings.fetchApiContent = Date.now();
                try {
                    let tasks = await revueSubscribers.fetch.tasks(options, ctx);

                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to fetch subscribers from Revue API', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Get content from Revue API',
                    duration: Date.now() - ctx.timings.fetchApiContent
                });
            }
        },
        {
            title: 'Process Revue API JSON',
            task: async (ctx) => {
                // 2. Convert Revue API JSON into a format that the migrate tools understand
                ctx.timings.processContent = Date.now();
                try {
                    ctx.result = revueSubscribers.process.all(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'revue-processed-data.json');
                } catch (error) {
                    ctx.logger.error({message: 'Failed to process subscribers from Revue', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Progress subscribers content from Revue API',
                    duration: Date.now() - ctx.timings.processContent
                });
            }
        },
        {
            title: 'Write Ghost import CSV',
            task: async (ctx, task) => {
                // 3. Write a valid Ghost import zip
                ctx.timings.writeCsv = Date.now();

                try {
                    const csvFinalPath = options.outputPath || process.cwd();
                    const csvData = fsUtils.csv.jsonToCSV(ctx.result.subscribers);
                    ctx.outputFile = {
                        path: await fsUtils.csv.writeCSV(csvData, csvFinalPath, `revue-subscribers-${ctx.options.cacheName || uuidv4()}.csv`)
                    };
                    task.output = `Successfully written zip to ${ctx.outputFile.path}`;
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write ZIP file', error});
                    throw error;
                }
            }
        },
        {
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Write CSV file',
                    duration: Date.now() - ctx.timings.writeCsv
                });
            }
        },
        {
            title: 'Clearing cached files',
            enabled: () => !options.cache,
            task: async (ctx) => {
                // 4. Write a valid Ghost import zip
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
            enabled: () => !options.cache,
            task: (ctx) => {
                ctx.logger.info({
                    message: 'Clearing up temporary cached files',
                    duration: Date.now() - ctx.timings.clearCache
                });
            }
        }
    ];
};

const getTaskRunner = (options, logger) => {
    let tasks = [];

    tasks = getFullTaskList(options, logger);

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    initialize,
    getFullTaskList,
    getTaskRunner
};
