import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import beehiivMembers from '../sources/beehiiv-members.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'beehiiv-members';

const group = 'Sources:';

// The command to run and any params
const flags = 'beehiiv-members';

// Description for the top level command
const desc = 'Migrate members from beehiiv using CSV files';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToCsv',
        defaultValue: null,
        desc: 'Path to members CSV file',
        required: true
    },
    {
        type: 'boolean',
        flags: '--outputSingleCSV',
        defaultValue: false,
        desc: 'Choose where to export a single CSV or one for each type.'
    },
    {
        type: 'boolean',
        flags: '--writeCSV',
        defaultValue: false,
        desc: 'Create a final CSV file'
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
        defaultValue: false,
        desc: 'Create a zip file (set to false to skip)'
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

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = beehiivMembers.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose && context.result) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.error(error);
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
