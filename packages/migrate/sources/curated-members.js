import fsUtils from '@tryghost/mg-fs-utils';
import csvIngest from '@tryghost/mg-curated-members-csv';
import makeTaskRunner from '../lib/task-runner.js';

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
 * getTasks: Steps to Migrate subscribers from Curated
 *
 * Wiring of the steps to migrate subscribers from Curated.
 *
 * @param {String} pathToFile
 * @param {Object} options
 */
const getTaskRunner = (pathToFile, options) => {
    let tasks = [
        {
            title: 'Initializing',
            task: (ctx, task) => {
                ctx.options = options;

                // 0. Prep a file cache for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToFile, {contentDir: false});

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
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Create batches and write CSV files',
            task: async (ctx) => {
                try {
                    // TODO: we can/should probably move this to the package
                    const types = Object.keys(ctx.result);
                    const files = [];

                    types.forEach(async (type) => {
                        const batchSize = ctx.options.limit;
                        const batchesTotal = Math.ceil(ctx.result[type].length / batchSize);
                        let currentBatch = 1;

                        while (currentBatch <= batchesTotal) {
                            const toParse = ctx.result[type].splice(0, batchSize);
                            files.push({
                                data: toParse,
                                fileName: `gh-members-${type}-batch-${currentBatch}.csv`,
                                tmpFilename: `gh-members-${type}-batch-${currentBatch}-${Date.now()}.csv`
                            });
                            currentBatch = currentBatch + 1;
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
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write zip file',
            skip: () => !options.zip,
            task: async (ctx) => {
                try {
                    ctx.outputFile = fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, `gh-members-${ctx.fileCache.cacheName}-${Date.now()}.zip`);
                } catch (error) {
                    ctx.errors.push(error);
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
