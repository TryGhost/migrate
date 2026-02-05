import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import libsyn from '../sources/libsyn.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'libsyn';

const group = 'Sources:';

// The command to run and any params
const flags = 'libsyn';

// Description for the top level command
const desc = 'Migrate from Libsyn using the RSS feed';

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
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    },
    {
        type: 'boolean',
        flags: '--useFeedCategories',
        defaultValue: true,
        desc: 'Use the itunes:categories as tags for each post'
    },
    {
        type: 'boolean',
        flags: '--useItemKeywords',
        defaultValue: true,
        desc: 'Use the itunes:keywords as tags for each post'
    },
    {
        type: 'boolean',
        flags: '--useEmbed',
        defaultValue: true,
        desc: 'Use Libsyn embed for audio players. If disabled, audio files will be downloaded and uploaded to Ghost as Audio cards'
    },
    {
        type: 'array',
        flags: '-s --scrape',
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
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
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from Libsyn site`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = libsyn.getTaskRunner(argv);

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
