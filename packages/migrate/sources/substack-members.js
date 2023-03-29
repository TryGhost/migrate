import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import fsUtils from '@tryghost/mg-fs-utils';
import csvIngest from '@tryghost/mg-substack-members-csv';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const MAX_COMP_BATCH_SIZE = 500;
const MEMBERS_IMPORT_FIELDS = [
    'email',
    'subscribed_to_emails',
    'complimentary_plan',
    'stripe_customer_id',
    'created_at',
    'labels',
    'note'
];

/**
 * getTasks: Steps to Migrate subscribers from Substack
 *
 * Wiring of the steps to migrate subscribers from Substack.
 *
 * @param {Object} options
 */
const getTaskRunner = (options, logger) => {
    let tasks = [
        {
            title: 'Initializing',
            task: (ctx, task) => {
                ctx.options = options;
                ctx.logger = logger;
                ctx.allMembers = [];

                // 0. Prep a file cache for the work we are about to do.
                ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(options.pathToFile);
                ctx.fileCache = new fsUtils.FileCache(`substack-members-${ctx.options.cacheName}`, {
                    tmpPath: ctx.options.tmpPath
                });

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read csv file(s) and process with given options',
            task: async (ctx) => {
                // 1. Read the csv file
                try {
                    ctx.result = await csvIngest(ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'csv-members-data.json', true);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to read CSV file', error});
                    throw error;
                }
            }
        },
        {
            title: 'Create batches and write CSV files',
            enabled: () => !options.outputSingleCSV,
            task: async (ctx) => {
                try {
                    // TODO: we can/should probably move this to the package
                    const types = Object.keys(ctx.result);
                    const files = [];

                    types.forEach(async (type) => {
                        const batchSize = (type === 'comp' && ctx.options.limit > MAX_COMP_BATCH_SIZE) ? MAX_COMP_BATCH_SIZE : ctx.options.limit;
                        const batchesTotal = Math.ceil(ctx.result[type].length / batchSize);
                        let currentBatch = 1;

                        if (type === 'skip') {
                            await ctx.fileCache.writeErrorJSONFile(ctx.result.skip, {filename: `gh-members-skipped-${Date.now()}.logs.json`});
                        } else {
                            while (currentBatch <= batchesTotal) {
                                const toParse = ctx.result[type].splice(0, batchSize);
                                files.push({
                                    data: toParse,
                                    fileName: `gh-members-${type}-batch-${currentBatch}.csv`,
                                    tmpFilename: `gh-members-${type}-batch-${currentBatch}-${Date.now()}.csv`
                                });
                                currentBatch = currentBatch + 1;
                            }
                        }
                    });

                    await Promise.all(files.map(async ({data, fileName, tmpFilename}) => {
                        data = await fsUtils.csv.jsonToCSV(data, MEMBERS_IMPORT_FIELDS);

                        // write the members import file for each batch
                        await ctx.fileCache.writeGhostImportFile(data, {isJSON: false, filename: fileName, tmpFilename: tmpFilename});
                    }));

                    if (ctx.logs) {
                        await ctx.fileCache.writeErrorJSONFile(ctx.logs, {filename: `gh-members-updated-${Date.now()}.logs.json`});
                    }
                } catch (error) {
                    ctx.logger.error({message: 'Failed to batch files', error});
                    throw error;
                }
            }
        },
        {
            title: 'Create singular members list',
            enabled: () => options.outputSingleCSV,
            task: async (ctx) => {
                Object.keys(ctx.result).forEach((type) => {
                    ctx.allMembers.push(...ctx.result[type]);
                });

                let tmpFilename = `gh-substack-members-${Date.now()}.csv`;

                let data = await fsUtils.csv.jsonToCSV(ctx.allMembers, MEMBERS_IMPORT_FIELDS);
                await ctx.fileCache.writeTmpFile(data, tmpFilename, false);
            }
        },
        {
            title: 'Write zip file',
            enabled: () => !options.outputSingleCSV,
            skip: () => !options.zip,
            task: async (ctx, task) => {
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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-substack-members-${ctx.options.cacheName}.zip`});
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
            title: 'Write CSV file',
            enabled: () => !options.zip && options.outputSingleCSV && options.writeCSV,
            task: async (ctx, task) => {
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const csvFinalPath = options.outputPath || process.cwd();

                    let fileName = `gh-substack-members.csv`;
                    let filePath = join(csvFinalPath, fileName);
                    let data = await fsUtils.csv.jsonToCSV(ctx.allMembers, MEMBERS_IMPORT_FIELDS);

                    // save the file
                    await ctx.fileCache.saveFile(filePath, data);
                    ctx.outputFile = {
                        path: filePath
                    };

                    if (isStorage) {
                        const storage = options.outputStorage;
                        const localFilePath = ctx.outputFile.path;

                        // read the file buffer
                        const fileBuffer = await readFileSync(ctx.outputFile.path);
                        // Upload the file to the storage
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-substack-members-${ctx.options.cacheName}.csv`});
                        // now that the file is uploaded to the storage, delete the local zip file
                        await ctx.fileCache.deleteFileOrDir(localFilePath);
                    }

                    task.output = `Successfully written output to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.logger.error({message: 'Failed to write and upload output file', error});
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
                    ctx.logger.error({message: 'Failed to clear cache', error});
                    throw error;
                }
            }
        }
    ];

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};

export default {
    getTaskRunner
};
