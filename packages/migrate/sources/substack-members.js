const makeTaskRunner = require('../lib/task-runner');
const fsUtils = require('@tryghost/mg-fs-utils');
const csvIngest = require('@tryghost/mg-substack-members-csv');

/**
 * getTasks: Steps to Migrate subscribers from Substack
 *
 * Wiring of the steps to migrate subscribers from Substack.
 *
 * @param {String} pathToFile
 * @param {Object} options
 */
module.exports.getTaskRunner = (pathToFile, options) => {
    let tasks = [
        {
            title: 'Initialising',
            task: (ctx) => {
                ctx.options = options;

                // 0. Prep a file cache for the work we are about to do.
                ctx.fileCache = new fsUtils.FileCache(pathToFile);
            }
        },
        {
            title: 'Read csv file(s) and process with given options',
            task: async (ctx) => {
                // 1. Read the csv file
                try {
                    ctx.result = await csvIngest(ctx);
                    await ctx.fileCache.writeTmpJSONFile(ctx.result, 'csv-members-data.csv');
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        // },
        // TODO: Write log files and skipped members
        // TODO: write data in batches
        // {
        //     title: 'Write Ghost members import CSV batch files',
        //     task: async (ctx) => {
        //         // 8. Write a valid Ghost import zip
        //         try {
        //             await ctx.fileCache.writeGhostMembersFiles(ctx);
        //         } catch (error) {
        //             ctx.errors.push(error);
        //             throw error;
        //         }
        //     }
        }
    ];

    // Configure a new Listr task manager, we can use different renderers for different configs
    return makeTaskRunner(tasks, Object.assign({topLevel: true}, options));
};
