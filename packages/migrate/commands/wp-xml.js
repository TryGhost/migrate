import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import wpXml from '../sources/wp-xml.js';
import {convertOptionsToSywac, convertOptionsToDefaults} from '../lib/utilties/options-to-sywac.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../lib/loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'wp-xml';

const group = 'Sources:';

// The command to run and any params
const flags = 'wp-xml';

// Description for the top level command
const desc = 'Migrate from a WordPress XML';

// Configure all the options
const options = [
    {
        type: 'string',
        flags: '--pathToFile',
        defaultValue: null,
        desc: 'Path to XML file, or folder of XML files',
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
        type: 'boolean',
        flags: '--drafts',
        defaultValue: true,
        desc: 'Import draft posts'
    },
    {
        type: 'boolean',
        flags: '--pages',
        defaultValue: true,
        desc: 'Import pages'
    },
    {
        type: 'boolean',
        flags: '--posts',
        defaultValue: true,
        desc: 'Import posts'
    },
    {
        type: 'string',
        flags: '--addTag',
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    },
    {
        type: 'enumeration',
        flags: '--datedPermalinks',
        choices: ['none', '/yyyy/mm/', '/yyyy/mm/dd/'],
        defaultValue: 'none',
        desc: 'Set the dated permalink structure (e.g. /yyyy/mm/dd/)'
    },
    {
        type: 'string',
        flags: '--postsBefore',
        defaultValue: null,
        desc: 'Only migrate posts before and including a given date e.g. \'March 20 2018\''
    },
    {
        type: 'string',
        flags: '--postsAfter',
        defaultValue: null,
        desc: 'Only migrate posts after and including a given date e.g. \'August 16 2021\''
    },
    {
        type: 'boolean',
        flags: '--fallBackHTMLCard',
        defaultValue: true,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    },
    {
        type: 'array',
        flags: '--cpt',
        defaultValue: null,
        desc: 'The slug(s) of custom post type(s), e.g. `resources,newsletters`'
    },
    {
        type: 'boolean',
        flags: '--excerpt',
        defaultValue: true,
        desc: 'Use the excerpt value from WordPress API'
    },
    {
        type: 'string',
        flags: '--excerptSelector',
        defaultValue: null,
        desc: 'Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`'
    },
    {
        type: 'string',
        flags: '--removeSelectors',
        defaultValue: null,
        desc: 'Pass in a string of CSS selectors for elements that will be removed, e.g. \'.ads, script[src*="adnetwork.com"]\''
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

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = wpXml.getTaskRunner(argv, logger);

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
