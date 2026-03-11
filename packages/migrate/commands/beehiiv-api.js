import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import mgBeehiiv from '@tryghost/mg-beehiiv-api';
import beehiiv from '../sources/beehiiv-api.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

// Internal ID in case we need one.
const id = 'beehiiv-api';

const group = 'Sources:';

// The command to run and any params
const flags = 'beehiiv-api';

// Description for the top level command
const desc = 'Migrate from beehiiv using CSV files';

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
    // {
    //     type: 'string',
    //     flags: '--defaultAuthorName',
    //     defaultValue: null,
    //     desc: 'The full name of the default author to assign to posts, if one cannot be found'
    // },
    {
        type: 'string',
        flags: '--postsAfter',
        defaultValue: null,
        desc: 'Only migrate posts published on or after this date (YYYY-MM-DD)'
    },
    {
        type: 'string',
        flags: '--postsBefore',
        defaultValue: null,
        desc: 'Only migrate posts published on or before this date (YYYY-MM-DD)'
    },
    {
        type: 'array',
        flags: '--scrape',
        choices: ['all', 'web', 'assets', 'none', 'img', 'media', 'files'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks (all = web + assets, web = metadata only, assets = download assets only). Legacy aliases for assets: img, media, files'
    },
    // {
    //     type: 'string',
    //     flags: '--subscribeLink',
    //     defaultValue: '#/portal/signup',
    //     desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    // },
    // {
    //     type: 'boolean',
    //     flags: '--comments',
    //     defaultValue: true,
    //     desc: 'Keep comment buttons'
    // },
    // {
    //     type: 'string',
    //     flags: '--commentLink',
    //     defaultValue: '#ghost-comments-root',
    //     desc: 'Provide a path that existing "comment" anchors will link to e.g. "#comments" or "#ghost-comments-root" (# characters need to be escaped with a \\)'
    // },
    // {
    //     type: 'boolean',
    //     flags: '--fallBackHTMLCard',
    //     defaultValue: true,
    //     desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    // },
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
        flags: '--veryVerbose',
        defaultValue: false,
        desc: 'Show very verbose output (implies --verbose)'
    },
    {
        type: 'boolean',
        flags: '--zip',
        defaultValue: true,
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

    // Remove trailing slash from URL
    if (argv.url && argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    // If no publication ID is provided, list publications and exit
    if (!argv.id) {
        const getPubs = await mgBeehiiv.listPublications(argv.key);

        if (!getPubs || !getPubs.length) {
            ui.log.error('Error fetching publications:', getPubs.errors);
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
        let migrate = beehiiv.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose && context.result) {
            ui.log.info('Done');
        }

        if (argv.veryVerbose && context.result) {
            ui.log.info(inspect(context.result.data, false, 2));
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
