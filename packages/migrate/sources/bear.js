import fsUtils from '@tryghost/mg-fs-utils';
import mgBearExport from '@tryghost/mg-bear-export';
import {toGhostJSON} from '@tryghost/mg-json';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import prettyMilliseconds from 'pretty-ms';

const getTaskRunner = (options) => {
    let runnerTasks = [
        {
            title: 'Initialising Workspace',
            task: (ctx, task) => {
                ctx.options = options;

                // Prep a file cache
                ctx.fileCache = new fsUtils.FileCache(options.pathToFile);

                task.output = `Workspace initialised at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read Bear Blog export CSV',
            task: async (ctx) => {
                try {
                    const rawResult = await mgBearExport({options: ctx.options});
                    ctx.result = await toGhostJSON(rawResult, ctx.options, ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'bear-export-data.json');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            title: 'Write Ghost import JSON File',
            task: async (ctx) => {
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

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(runnerTasks, Object.assign({topLevel: true}, options));
};

export default {
    getTaskRunner
}; 