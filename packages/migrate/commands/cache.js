const fsUtils = require('@tryghost/mg-fs-utils');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'clear-cache';

exports.group = 'Commands:';

// The command to run and any params
exports.flags = 'clear-cache';

// Description for the top level command
exports.desc = 'Clear local migration cache';

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    try {
        let fsCache = new fsUtils.FileCache('test.dev', 'yolo');
        let cacheDir = fsCache.cacheBaseDir;

        ui.log.info(`Emptying the directory located at: ${cacheDir}/`);

        const clear = await fsCache.emptyCacheDir();

        if (argv.verbose) {
            clear.files.forEach((item) => {
                ui.log.info(`Deleted: ${item}`);
            });
        }

        ui.log.ok(`Deleted ${clear.files.length} files`);
    } catch (error) {
        ui.log.info('Done with errors', error);
    }
};
