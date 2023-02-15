import {ui} from '@tryghost/pretty-cli';
import fsUtils from '@tryghost/mg-fs-utils';

// Internal ID in case we need one.
const id = 'clear-cache';

const group = 'Commands:';

// The command to run and any params
const flags = 'clear-cache';

// Description for the top level command
const desc = 'Clear local migration cache';

// Configure all the options
const setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: Boolean(process?.env?.DEBUG),
        desc: 'Show verbose output'
    });
};

// What to do when this command is executed
const run = async (argv) => {
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

export default {
    id,
    group,
    flags,
    desc,
    setup,
    run
};
