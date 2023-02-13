import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import medium from '../sources/medium.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../../../loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'medium';

const group = 'Sources:';

// The command to run and any params
const flags = 'medium <pathToZip>';

// Description for the top level command
const desc = 'Migrate from Medium using an export zip';

// Descriptions for the individual params
const paramsDesc = ['Path to a medium export zip'];

// Configure all the options
const setup = (sywac) => {
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
    sywac.string('-e --email', {
        defaultValue: false,
        desc: 'Provide an email domain for users e.g. mycompany.com'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
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
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = medium.getTaskRunner(argv.pathToZip, argv, logger);

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

    showLogs(`${logger.path}/${logger.domain}_${logger.env}.log`, startMigrationTime);
};

export default {
    id,
    group,
    flags,
    desc,
    paramsDesc,
    setup,
    run
};
