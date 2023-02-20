import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import curatedMembers from '../sources/curated-members.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'curated-members';

const group = 'Sources:';

// The command to run and any params
const flags = 'curated-members';

// Description for the top level command
const desc = 'Migrate from Curated subscribers CSV';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToFile',
        defaultValue: null,
        desc: 'Path to the signups CSV file',
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
        flags: '--zip',
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    },
    {
        type: 'number',
        flags: '-l, --limit',
        defaultValue: 50000,
        desc: 'Define the batch limit for import files.'
    },
    {
        type: 'string',
        flags: '--freeLabel',
        defaultValue: 'curated-free',
        desc: 'Provide a label for Curated free subscribers'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
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
        ui.log.info(`Migrating from export at ${argv.pathToFile}${argv.subs ? ` and ${argv.subs}` : ``}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = curatedMembers.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
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

    if (context.warnings.length > 0) {
        ui.log.warn(context.warnings);
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
