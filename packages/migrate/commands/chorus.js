import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import chorus from '../sources/chorus.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../lib/loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'chorus';

const group = 'Sources:';

// The command to run and any params
const flags = 'chorus';

// Description for the top level command
const desc = 'Migrate from Chorus using a JSON export';

// Configure all the options
const options = [
    {
        type: 'array',
        flags: '--entries',
        defaultValue: null,
        desc: 'Path(s) to Chorus exports ZIPs',
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
        choices: ['web'],
        defaultValue: ['all'],
        desc: 'Configure scraping tasks'
    },
    {
        type: 'string',
        flags: '--addPrimaryTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
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

    const startMigrationTime = Date.now();

    // Remove trailing slash from URL
    if (argv.url.endsWith('/')) {
        argv.url = argv.url.slice(0, -1);
    }

    // Remove empty array items from argv.entries
    argv.entries = argv.entries.filter(str => str !== '');

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = chorus.getTaskRunner(argv, logger);

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

    showLogs(logger, startMigrationTime);
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
