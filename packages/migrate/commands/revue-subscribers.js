import {inspect} from 'node:util';
import {join} from 'node:path';
import {ui} from '@tryghost/pretty-cli';
import {GhostLogger} from '@tryghost/logging';
import revue from '../sources/revue-subscribers.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

// Internal ID in case we need one.
const id = 'revue-subscribers';

const group = 'Sources:';

// The command to run and any params
const flags = 'revue-subscribers <apitoken>';

// Description for the top level command
const desc = 'Migrate subscribers from Revue using the API';

// Descriptions for the individual params
const paramsDesc = ['Revue API Token'];

// Configure all the options
const setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.string('--addLabel', {
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post as primary tag'
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
    let context = {errors: []};

    const startMigrationTime = Date.now();

    const logger = new GhostLogger({
        domain: argv.cacheName || 'revue_subscriber_migration', // This can be unique per migration
        mode: 'long',
        transports: (argv.verbose) ? ['stdout', 'file'] : ['file'],
        path: join(process.cwd(), '/logs')
    });

    if (argv.verbose) {
        ui.log.info(`${argv.info ? 'Fetching info' : 'Migrating'} from Revue site`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = revue.getTaskRunner(argv, logger);

        // Run the migration
        await migrate.run(context);

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

    logger.info({
        message: 'Migration finished',
        duration: Date.now() - startMigrationTime
    });

    const errorLogPath = join(logger.path, `${logger.domain}_${logger.env}.error.log`);
    showLogs(errorLogPath, startMigrationTime);

    const logPath = join(logger.path, `${logger.domain}_${logger.env}.log`);
    showLogs(logPath, startMigrationTime);
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
