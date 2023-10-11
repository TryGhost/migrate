import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import fsUtils from '@tryghost/mg-fs-utils';
import csvIngest from '@tryghost/mg-mailchimp-members';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const getTaskRunner = (options, logger) => {
    let tasks = [
        {
            title: 'Initializing',
            task: (ctx, task) => {
                ctx.options = options;
                ctx.logger = logger;

                // 0. Prep a file cache for the work we are about to do.
                ctx.options.cacheName = options.cacheName || fsUtils.utils.cacheNameFromPath(options.pathToCsv[0]);
                ctx.fileCache = new fsUtils.FileCache(`mailchimp-members-${ctx.options.cacheName}`, {
                    tmpPath: ctx.options.tmpPath,
                    contentDir: false
                });

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read csv file and process with given options',
            task: async (ctx) => {
                // 1. Read the csv file
                try {
                    ctx.result = await csvIngest({
                        csvPath: options.pathToCsv,
                        addLabel: options.addLabel,
                        includeUnsubscribed: options.includeUnsubscribed
                    });
                    await ctx.fileCache.writeTmpFile(ctx.result, 'csv-members-data.json', true);
                } catch (error) {
                    ctx.logger.error({message: 'Failed to read CSV file', error});
                    throw error;
                }
            }
        },
        {
            title: 'Write CSV file',
            task: async (ctx, task) => {
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const csvFinalPath = options.outputPath || process.cwd();

                    let fileName = `gh-mailchimp-members-${Date.now()}.csv`;
                    let filePath = join(csvFinalPath, fileName);
                    let data = await fsUtils.csv.jsonToCSV(ctx.result);

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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-mailchimp-members-${ctx.options.cacheName}.csv`});
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
