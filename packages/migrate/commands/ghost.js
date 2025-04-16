import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import ghost from '../sources/ghost.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'ghost';

const group = 'Sources:';

// The command to run and any params
const flags = 'ghost';

// Description for the top level command
const desc = 'Migrate from Ghost using the Admin API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'Ghost API URL',
        required: true
    },
    {
        type: 'string',
        flags: '--apikey',
        defaultValue: null,
        desc: 'Ghost API key',
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
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    },
    {
        type: 'number',
        flags: '--sizeLimit',
        defaultValue: false,
        desc: 'Assets larger than this size (defined in MB) will be ignored'
    },
    {
        type: 'boolean',
        flags: '-I, --info',
        defaultValue: false,
        desc: 'Show initialization info only'
    },
    {
        type: 'number',
        flags: '-b, --batch',
        defaultValue: 0,
        desc: 'Batch number to run (defaults to running all)'
    },
    {
        type: 'number',
        flags: '-l, --limit',
        defaultValue: 15,
        desc: 'Number of items fetched in a batch i.e. batch size'
    },
    {
        type: 'string',
        flags: '--postFilter',
        defaultValue: null,
        desc: 'A string of post filters, as defined in the Ghost Admin API'
    },
    {
        type: 'boolean',
        flags: '--posts',
        defaultValue: true,
        desc: 'Fetch posts (set to false to disable)'
    },
    {
        type: 'string',
        flags: '--pageFilter',
        defaultValue: null,
        desc: 'A string of page filters, as defined in the Ghost Admin API'
    },
    {
        type: 'boolean',
        flags: '--pages',
        defaultValue: true,
        desc: 'Fetch pages (set to false to disable)'
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
        ui.log.info(`Migrating from Ghost at ${argv.url}`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = ghost.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            let batches = context.info.batches.posts;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts ${batches} batches.`);
        }

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.error(error);
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
