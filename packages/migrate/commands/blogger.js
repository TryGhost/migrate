import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import bloggerXml from '../sources/blogger.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../lib/loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'blogger';

const group = 'Sources:';

// The command to run and any params
const flags = 'blogger';

// Description for the top level command
const desc = 'Migrate from a Blogger API';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--apiKey',
        defaultValue: null,
        desc: 'API Key',
        required: true
    },
    {
        type: 'array',
        flags: '--blogID',
        defaultValue: null,
        desc: 'Site ID',
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
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    },
    {
        type: 'boolean',
        flags: '--firstImageAsFeatured',
        defaultValue: true,
        desc: 'Use the first image as the post\'s feature_image'
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

    const startMigrationTime = Date.now();

    // Trim empty values from the blogID array
    argv.blogID = argv.blogID.filter(n => n);

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = bloggerXml.getTaskRunner(argv, logger);

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
