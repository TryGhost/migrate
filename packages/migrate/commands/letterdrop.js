import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import letterdrop from '../sources/letterdrop.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../../../loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'letterdrop';

const group = 'Sources:';

// The command to run and any params
const flags = 'letterdrop';

// Description for the top level command
const desc = 'Migrate from Letterdrop using the API';

// Configure all the options
const setup = (sywac) => {
    sywac.string('--apiToken', {
        defaultValue: null,
        desc: 'Letterdrop API Token',
        required: true
    });
    sywac.string('--url', {
        defaultValue: null,
        desc: 'URL to live site',
        required: true
    });
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('-z, --zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.array('-s --scrape', {
        choices: ['all', 'img', 'web', 'media', 'files', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.number('--sizeLimit', {
        defaultValue: false,
        desc: 'Assets larger than this size (defined in MB) will be ignored'
    });
    sywac.string('--addPrimaryTag', {
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show Letterdrop API info only'
    });
    sywac.number('--wait_after_scrape', {
        defaultValue: 200,
        desc: 'Time in ms to wait after a URL is scraped'
    });
    sywac.string('--subscribeLink', {
        defaultValue: '#/portal/signup',
        desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    });
    sywac.string('--subscribeText', {
        defaultValue: 'Subscribe',
        desc: 'Provide the button text for above subscribe links'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    });
    sywac.boolean('--cache', {
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    });
    sywac.string('--tmpPath', {
        defaultValue: null,
        desc: 'Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)'
    });
    sywac.string('--outputPath', {
        defaultValue: null,
        desc: 'Specify the full path where the final zip file will be saved to (Defaults to CWD)'
    });
    sywac.string('--cacheName', {
        defaultValue: null,
        desc: 'Provide a unique name for the cache directory (defaults to a UUID)'
    });
};

// What to do when this command is executed
const run = async (argv) => {
    let context = {
        errors: [],
        warnings: []
    };

    const startMigrationTime = Date.now();

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from Letterdrop site`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = letterdrop.getTaskRunner(argv, logger);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            ui.log.info(`Fetched ${context.info.totals.posts} posts.`);
        }

        logger.info({
            message: 'Migration finished',
            duration: Date.now() - startMigrationTime
        });

        if (argv.verbose && context.result) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        logger.info({
            message: 'Migration finished but with errors',
            error,
            duration: Date.now() - startMigrationTime
        });
    }

    showLogs(`${logger.path}/${logger.domain}_${logger.env}.log`, startMigrationTime);
};

export default {
    id,
    group,
    flags,
    desc,
    setup,
    run
};
