import {inspect} from 'node:util';
import {join} from 'node:path';
import {ui} from '@tryghost/pretty-cli';
import {GhostLogger} from '@tryghost/logging';
import revue from '../sources/revue.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

// Internal ID in case we need one.
const id = 'revue';

const group = 'Sources:';

// The command to run and any params
const flags = 'revue <apitoken>';

// Description for the top level command
const desc = 'Migrate from Revue using the API';

// Descriptions for the individual params
const paramsDesc = ['Revue API Token'];

// Configure all the options
const setup = (sywac) => {
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
    sywac.string('-e --email', {
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general author for the posts'
    });
    sywac.boolean('--createAuthors', {
        defaultValue: true,
        desc: 'Create authors based on data from Revue'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show Revue API info only'
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
    let context = {errors: []};

    const startMigrationTime = Date.now();

    const logger = new GhostLogger({
        domain: argv.cacheName || 'revue_migration', // This can be unique per migration
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
