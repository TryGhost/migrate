import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import ghost from '../sources/ghost.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../../../loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'ghost';

const group = 'Sources:';

// The command to run and any params
const flags = 'ghost';

// Description for the top level command
const desc = 'Migrate from Ghost using the Admin API';

// Configure all the options
const setup = (sywac) => {
    sywac.string('--url', {
        defaultValue: null,
        desc: 'Ghost API URL',
        required: true
    });
    sywac.string('--apikey', {
        defaultValue: null,
        desc: 'Ghost API key',
        required: true
    });
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('--zip', {
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
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show initialization info only'
    });
    sywac.number('-b, --batch', {
        defaultValue: 0,
        desc: 'Batch number to run (defaults to running all)'
    });
    sywac.number('-l, --limit', {
        defaultValue: 15,
        desc: 'Number of items fetched in a batch i.e. batch size'
    });
    sywac.string('--postFilter', {
        defaultValue: null,
        desc: 'A string of post filters, as defined in the Ghost Admin API'
    });
    sywac.boolean('--posts', {
        defaultValue: true,
        desc: 'Fetch posts (set to false to disable)'
    });
    sywac.string('--pageFilter', {
        defaultValue: null,
        desc: 'A string of page filters, as defined in the Ghost Admin API'
    });
    sywac.boolean('--pages', {
        defaultValue: true,
        desc: 'Fetch pages (set to false to disable)'
    });
    sywac.boolean('--cache', {
        defaultValue: true,
        desc: 'Persist local cache after migration is complete (Only if `--zip` is `true`)'
    });
};

// What to do when this command is executed
const run = async (argv) => {
    let context = {
        errors: [],
        warnings: []
    };

    const startMigrationTime = Date.now();

    if (argv.verbose) {
        ui.log.info(`Migrating from Ghost at ${argv.url}`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = ghost.getTaskRunner(argv, logger);

        // Run the migration
        await migrate.run(context);

        logger.info({
            message: 'Migration finished',
            duration: Date.now() - startMigrationTime
        });

        if (argv.info && context.info) {
            let batches = context.info.batches.posts;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts ${batches} batches.`);
        }

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
