import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import tinynews from '../sources/tinynews.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'tinynews';

const group = 'Sources:';

// The command to run and any params
const flags = 'tinynews';

// Description for the top level command
const desc = 'Migrate from Tiny News using JSON files';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--articles',
        defaultValue: null,
        desc: 'Path to articles JSON file',
        required: true
    },
    {
        type: 'string',
        flags: '--pages',
        defaultValue: null,
        desc: 'Path to pages JSON file',
        required: false
    },
    {
        type: 'string',
        flags: '--newsletters',
        defaultValue: null,
        desc: 'Path to newsletters JSON file',
        required: false
    },
    {
        type: 'string',
        flags: '--authors',
        defaultValue: null,
        desc: 'Path to authors JSON file',
        required: false
    },
    {
        type: 'string',
        flags: '--url',
        defaultValue: null,
        desc: 'URL to live site',
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
        flags: '--scrape',
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks'
    },
    {
        type: 'number',
        flags: '--wait_after_scrape',
        defaultValue: 200,
        desc: 'Time in ms to wait after a URL is scraped'
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

    // Remove trailing slash from URL
    if (argv.url && argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = tinynews.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose && context.result) {
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
