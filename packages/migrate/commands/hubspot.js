import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import hubspot from '../sources/hubspot.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'hubspot';

const group = 'Sources:';

// The command to run and any params
const flags = 'hubspot';

// Description for the top level command
const desc = 'Migrate from Hubspot using the API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'URL of the blog you want to migrate',
        required: true
    },
    {
        type: 'string',
        flags: '--hapikey',
        defaultValue: null,
        desc: 'Hubspot API Key (hapikey)',
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
        flags: '-z, --zip',
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    },
    {
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks'
    },
    {
        type: 'number',
        flags: '--sizeLimit',
        defaultValue: false,
        desc: 'Assets larger than this size (defined in MB) will be ignored'
    },
    {
        type: 'string',
        flags: '-e --email',
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    },
    {
        type: 'boolean',
        flags: '-I, --info',
        defaultValue: false,
        desc: 'Show hubspot blog info only'
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
        defaultValue: 100,
        desc: 'Number of items fetched in a batch i.e. batch size'
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
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from hubspot site`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = hubspot.getTaskRunner(argv);

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
