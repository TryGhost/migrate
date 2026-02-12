import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import letterdrop from '../sources/letterdrop.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {ghostAuthOptions} from '@tryghost/mg-ghost-authors';

// Internal ID in case we need one.
const id = 'letterdrop';

const group = 'Sources:';

// The command to run and any params
const flags = 'letterdrop';

// Description for the top level command
const desc = 'Migrate from Letterdrop using the API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--apiToken',
        defaultValue: null,
        desc: 'Letterdrop API Token',
        required: true
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
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
    },
    {
        type: 'string',
        flags: '--addPrimaryTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
    },
    {
        type: 'boolean',
        flags: '--info',
        defaultValue: false,
        desc: 'Show Letterdrop API info only'
    },
    {
        type: 'number',
        flags: '--wait_after_scrape',
        defaultValue: 200,
        desc: 'Time in ms to wait after a URL is scraped'
    },
    {
        type: 'string',
        flags: '--subscribeLink',
        defaultValue: '#/portal/signup',
        desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    },
    {
        type: 'string',
        flags: '--subscribeText',
        defaultValue: 'Subscribe',
        desc: 'Provide the button text for above subscribe links'
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
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from Letterdrop site`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = letterdrop.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            ui.log.info(`Fetched ${context.info.totals.posts} posts.`);
        }

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
