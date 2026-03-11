import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import mgBeehiivApiMembers from '@tryghost/mg-beehiiv-api-members';
import beehiivApiMembers from '../sources/beehiiv-api-members.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'beehiiv-api-members';

const group = 'Sources:';

// The command to run and any params
const flags = 'beehiiv-api-members';

// Description for the top level command
const desc = 'Migrate members from beehiiv using the API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--key',
        defaultValue: null,
        desc: 'beehiiv API key',
        required: true
    },
    {
        type: 'string',
        flags: '--id',
        defaultValue: null,
        desc: 'beehiiv publication ID'
    },
    {
        type: 'boolean',
        flags: '--outputSingleCSV',
        defaultValue: false,
        desc: 'Choose whether to export a single CSV or one for each type.'
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

    // If no publication ID is provided, list publications and exit
    if (!argv.id) {
        const getPubs = await mgBeehiivApiMembers.listPublications(argv.key);

        if (!getPubs || !getPubs.length) {
            ui.log.error('Error fetching publications:', getPubs?.errors || 'No publications found');
            return;
        }

        console.table(getPubs.map(pub => ({ // eslint-disable-line no-console
            name: pub.name,
            id: pub.id,
            created: new Date(pub.created * 1000),
            subscribers: pub.stats?.active_subscriptions || '-'
        })));

        ui.log.warn('No publication ID provided. Please provide an ID using the --id flag to run the migration.');

        process.exit(0);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = beehiivApiMembers.getTaskRunner(argv);

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
