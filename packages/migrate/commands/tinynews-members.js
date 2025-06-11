import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import tinynewsMembers from '../sources/tinynews-members.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'tinynews-members';

const group = 'Sources:';

// The command to run and any params
const flags = 'tinynews-members';

// Description for the top level command
const desc = 'Migrate from Tiny News subscribers CSV';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToFile',
        defaultValue: null,
        desc: 'Path to the subscribers CSV file',
        required: true
    },
    {
        type: 'boolean',
        flags: '-V --verbose',
        defaultValue: Boolean(process?.env?.DEBUG),
        desc: 'Show verbose output'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    },
    {
        type: 'string',
        flags: '--tmpPath',
        defaultValue: null,
        desc: 'Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)'
    },
    {
        type: 'string',
        flags: '--outputPath',
        defaultValue: null,
        desc: 'Specify the full path where the final zip file will be saved to (Defaults to CWD)'
    },
    {
        type: 'string',
        flags: '--cacheName',
        defaultValue: null,
        desc: 'Provide a unique name for the cache directory (defaults to a UUID)'
    }
];

// Build an object of defaults to be exported - Not used here, but needs to be provided
const defaults = convertOptionsToDefaults(options);

// Convert `options` into a list of Sywac types
const setup = sywac => convertOptionsToSywac(options, sywac);

// What to do when this command is executed
const run = async (argv) => {
    let context = {
        errors: [],
        warnings: []
    };

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = tinynewsMembers.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.error(error);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);

        if (context.logs) {
            ui.log.info(`Adjusted members due to passed in options:`);

            context.logs.forEach((log) => {
                ui.log.info(log.info);
            });
        }
    }

    if (context.result.skip) {
        context.result.skip.forEach((skipped) => {
            ui.log.warn(`Skipped import: ${skipped.info}`);
        });
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
