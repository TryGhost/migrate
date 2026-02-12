import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import curated from '../sources/curated.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'curated';

const group = 'Sources:';

// The command to run and any params
const flags = 'curated';

// Description for the top level command
const desc = 'Migrate from Curated using an export zip';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to a curated export zip',
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
        type: 'string',
        flags: '-e --email',
        defaultValue: false,
        desc: 'Provide an email address for posts to attributed to e.g. john@example.com'
    },
    {
        type: 'string',
        flags: '-n --name',
        defaultValue: false,
        desc: 'Provide a name for posts to attributed to e.g. John'
    },
    {
        type: 'string',
        flags: '-t --tag',
        defaultValue: false,
        desc: 'Provide a tag to be applied to every post'
    },
    {
        type: 'boolean',
        flags: '--fallBackHTMLCard',
        defaultValue: true,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    },
    {
        type: 'boolean',
        flags: '--cache',
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    },
    ...ghostAuthOptions
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

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = curated.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
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
