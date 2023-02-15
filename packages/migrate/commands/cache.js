import {ui} from '@tryghost/pretty-cli';
import fsUtils from '@tryghost/mg-fs-utils';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'clear-cache';

const group = 'Commands:';

// The command to run and any params
const flags = 'clear-cache';

// Description for the top level command
const desc = 'Clear local migration cache';

// Configure all the options
const options = [
    {
        type: 'boolean',
        flags: '-V --verbose',
        defaultValue: Boolean(process?.env?.DEBUG),
        desc: 'Show verbose output'
    }
];

// Build an object of defaults to be exported - Not used here, but needs to be provided
const defaults = convertOptionsToDefaults(options);

// Convert `options` into a list of Sywac types
const setup = sywac => convertOptionsToSywac(options, sywac);

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
    run,
    defaults
};
