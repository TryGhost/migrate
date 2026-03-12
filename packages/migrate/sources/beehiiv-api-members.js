import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import fsUtils from '@tryghost/mg-fs-utils';
import beehiivApiMembers from '@tryghost/mg-beehiiv-api-members';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const getTaskRunner = (options) => {
    let tasks = [
        {
            title: 'Initializing',
            task: (ctx, task) => {
                ctx.options = options;
                ctx.allMembers = [];

                // Prep a file cache for the work we are about to do.
                ctx.options.cacheName = options.cacheName || options.id;
                ctx.fileCache = new fsUtils.FileCache(`beehiiv-api-members-${ctx.options.cacheName}`, {
                    tmpPath: ctx.options.tmpPath,
                    contentDir: false
                });

                ctx.result = {};

                task.output = `Workspace initialized at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Fetching subscriptions from beehiiv API',
            task: async (ctx) => {
                const fetchTasks = await beehiivApiMembers.fetchTasks(options, ctx);
                return makeTaskRunner(fetchTasks, options);
            }
        },
        {
            title: 'Mapping subscriptions to Ghost member format',
            task: async (ctx) => {
                const mapTasks = beehiivApiMembers.mapMembersTasks(options, ctx);
                return makeTaskRunner(mapTasks, options);
            }
        },
        {
            title: 'Create batches and write CSV files',
            enabled: () => !options.outputSingleCSV,
            task: async (ctx) => {
                try {
                    const types = Object.keys(ctx.result.members);
                    const files = [];

                    types.forEach(async (type) => {
                        files.push({
                            data: ctx.result.members[type],
                            fileName: `gh-members-${type}.csv`,
                            tmpFilename: `gh-members-${type}-${Date.now()}.csv`
                        });
                    });

                    await Promise.all(files.map(async ({data, fileName, tmpFilename}) => {
                        if (!data || data.length === 0) {
                            return;
                        }

                        data = await fsUtils.csv.jsonToCSV(data);

                        // write the members import file for each batch
                        await ctx.fileCache.writeGhostImportFile(data, {isJSON: false, filename: fileName, tmpFilename: tmpFilename});
                    }));

                    if (ctx.logs) {
                        await ctx.fileCache.writeErrorJSONFile(ctx.logs, {filename: `gh-members-updated-${Date.now()}.logs.json`});
                    }
                } catch (error) {
                    ctx.errors.push({message: 'Failed to batch files', error});
                    throw error;
                }
            }
        },
        {
            title: 'Create singular members list',
            enabled: () => options.outputSingleCSV,
            task: async (ctx) => {
                Object.keys(ctx.result.members).forEach((type) => {
                    ctx.allMembers.push(...ctx.result.members[type]);
                });

                let tmpFilename = `gh-beehiiv-api-members-${Date.now()}.csv`;

                let data = await fsUtils.csv.jsonToCSV(ctx.allMembers);
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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-beehiiv-api-members-${ctx.options.cacheName}.zip`});
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
            title: 'Write CSV file',
            enabled: () => !options.zip && options.outputSingleCSV && options.writeCSV,
            task: async (ctx, task) => {
                const isStorage = (options?.outputStorage && typeof options.outputStorage === 'object') ?? false;

                try {
                    let timer = Date.now();
                    const csvFinalPath = options.outputPath || process.cwd();

                    let fileName = `gh-beehiiv-api-members.csv`;
                    let filePath = join(csvFinalPath, fileName);
                    let data = await fsUtils.csv.jsonToCSV(ctx.allMembers);

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
                        ctx.outputFile.path = await storage.upload({body: fileBuffer, fileName: `gh-beehiiv-api-members-${ctx.options.cacheName}.csv`});
                        // now that the file is uploaded to the storage, delete the local zip file
                        await ctx.fileCache.deleteFileOrDir(localFilePath);
                    }

                    task.output = `Successfully written output to ${ctx.outputFile.path} in ${prettyMilliseconds(Date.now() - timer)}`;
                } catch (error) {
                    ctx.errors.push({message: 'Failed to write and upload output file', error});
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
                    ctx.errors.push({message: 'Failed to clear cache', error});
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
