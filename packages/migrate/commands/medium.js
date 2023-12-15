import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import medium from '../sources/medium.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../lib/loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'medium';

const group = 'Sources:';

// The command to run and any params
const flags = 'medium';

// Description for the top level command
const desc = 'Migrate from Medium using an export zip';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToZip',
        defaultValue: null,
        desc: 'Path to a medium export zip',
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
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag slug which should be added to every post in this migration'
    },
    {
        type: 'boolean',
        flags: '--addPlatformTag',
        defaultValue: true,
        desc: 'Add #medium tag to migrated content'
    },
    {
        type: 'boolean',
        flags: '--mediumAsCanonical',
        defaultValue: false,
        desc: 'Use medium article as canonical URL'
    },
    {
        type: 'boolean',
        flags: '--removeResponses',
        defaultValue: true,
        desc: 'Remove response posts such as comments from the output'
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

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = medium.getTaskRunner(argv, logger);

        // Run the migration
        await migrate.run(context);

        logger.info({
            message: 'Migration finished',
            duration: Date.now() - startMigrationTime
        });

        if (argv.verbose) {
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
