// const curateIngest = require('@tryghost/mg-curate-export');
const curateIngest = require('../../mg-curate-export');
const mgJSON = require('@tryghost/mg-json');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const fsUtils = require('@tryghost/mg-fs-utils');
const makeTaskRunner = require('../lib/task-runner');

/**
 * getTasks: Steps to Migrate from Curate
 *
 * Wiring of the steps to migrate from curate.
 *
 * @param {String} pathToZip
 * @param {Object} options
 */
module.exports.getTaskRunner = (pathToZip, options) => {
    let tasks = [
        {
            title: 'Initialising Workspace',
            task: (ctx, task) => {
                ctx.options = options;

                // 0. Prep a file cache, scrapers, etc, to prepare for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToZip);

                task.output = `Workspace initialised at ${ctx.fileCache.cacheDir}`;
            }
        },
        {
            title: 'Read Curate export zip',
            task: async (ctx) => {
                // 1. Read the zip file and process posts
                try {
                    ctx.result = curateIngest(pathToZip, ctx);
                    await ctx.fileCache.writeTmpFile(ctx.result, 'curate-export-data.json');
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
                    ctx.result = mgJSON.toGhostJSON(ctx.result, ctx.options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        },
        {
            // @TODO don't duplicate this with the utils json file
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                // 7. Convert post HTML -> MobileDoc
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx); // eslint-disable-line no-shadow
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
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
            title: 'Write Ghost import zip',
            skip: () => !options.zip,
            task: async (ctx) => {
                // 9. Write a valid Ghost import zip
                try {
                    ctx.outputFile = fsUtils.zip.write(process.cwd(), ctx.fileCache.zipDir, ctx.fileCache.defaultZipFileName);
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
