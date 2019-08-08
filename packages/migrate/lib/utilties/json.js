const makeTaskRunner = require('../task-runner');
const mgHtmlMobiledoc = require('@tryghost/mg-html-mobiledoc');
const fsUtils = require('@tryghost/mg-fs-utils');

const jsonTasks = {
    html: (options) => {
        return {
            // @TODO don't duplicate this with medium
            title: 'Convert HTML -> MobileDoc',
            task: (ctx) => {
                try {
                    let tasks = mgHtmlMobiledoc.convert(ctx);
                    return makeTaskRunner(tasks, options);
                } catch (error) {
                    ctx.errors.push(error);
                    throw error;
                }
            }
        };
    }
};

module.exports.getTaskRunner = (type, pathToJSON, options) => {
    let tasks = [
        {
            title: 'Initialising',
            task: (ctx) => {
                ctx.options = options;
                ctx.fileCache = new fsUtils.FileCache(pathToJSON);
            }
        },
        {
            title: 'Read Ghost JSON file',
            task: async (ctx) => {
                ctx.result = await fsUtils.ghostJSON.read(pathToJSON);
            }
        }];

    tasks.push(jsonTasks[type](options));

    tasks.push({
        title: 'Write Ghost JSON File',
        task: async (ctx) => {
            ctx.outputFile = await ctx.fileCache.writeGhostJSONFile(ctx.result, {path: pathToJSON});
        }
    });

    return makeTaskRunner(tasks, options);
};
