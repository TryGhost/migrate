import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import jekyll from '../sources/jekyll.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'jekyll';

const group = 'Sources:';

// The command to run and any params
const flags = 'jekyll';

// Description for the top level command
const desc = 'Migrate from Jekyll using an export zip';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to a jekyll export zip',
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
        type: 'string',
        flags: '-u --url',
        defaultValue: false,
        desc: 'Provide a URL (without trailing slash) to the hosted source site'
    },
    {
        type: 'string',
        flags: '-e --email',
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    },
    {
        type: 'string',
        flags: '--addTags',
        defaultValue: null,
        desc: 'Provide one or more tag names which should be added to every post in this migration'
    },
    {
        type: 'enumeration',
        flags: '--datedPermalinks',
        choices: ['none', '/yyyy/mm/', '/yyyy/mm/dd/'],
        defaultValue: 'none',
        desc: 'Set the dated permalink structure (e.g. /yyyy/mm/dd/)'
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

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = jekyll.getTaskRunner(argv.pathToZip, argv);

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
