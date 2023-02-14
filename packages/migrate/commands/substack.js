import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import substack from '../sources/substack.js';
import {GhostLogger} from '@tryghost/logging';
import logConfig from '../../../loggingrc.js';
import {showLogs} from '../lib/utilties/cli-log-display.js';

const logger = new GhostLogger(logConfig);

// Internal ID in case we need one.
const id = 'substack';

const group = 'Sources:';

// The command to run and any params
const flags = 'substack';

// Description for the top level command
const desc = 'Migrate from a Substack ZIP file';

// Configure all the options
const setup = (sywac) => {
    sywac.string('--pathToZip', {
        defaultValue: null,
        desc: 'Path to a zip file',
        required: true
    });
    sywac.string('--url', {
        defaultValue: null,
        desc: 'Site URL',
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
    sywac.string('-e --email', {
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general user w/ slug `john` and provided email'
    });
    sywac.boolean('--drafts', {
        defaultValue: true,
        desc: 'Import draft posts'
    });
    sywac.boolean('--threads', {
        defaultValue: false,
        desc: 'Import thread posts'
    });
    sywac.boolean('--useMetaImage', {
        defaultValue: true,
        desc: 'Use "og:image" value as the feature image'
    });
    sywac.boolean('--useMetaAuthor', {
        defaultValue: true,
        desc: 'Use the author field from ld+json (useful for posts with multiple authors)'
    });
    sywac.string('--subscribeLink', {
        defaultValue: '#/portal/signup',
        desc: 'Provide a path that existing "subscribe" anchors will link to e.g. "/join-us" or "#/portal/signup" (# characters need to be escaped with a \\)'
    });
    sywac.boolean('--comments', {
        defaultValue: true,
        desc: 'Keep comment buttons'
    });
    sywac.string('--commentLink', {
        defaultValue: '#ghost-comments-root',
        desc: 'Provide a path that existing "comment" anchors will link to e.g. "#comments" or "#ghost-comments-root" (# characters need to be escaped with a \\)'
    });
    sywac.string('--postsBefore', {
        defaultValue: null,
        desc: 'Only migrate posts before and including a given date e.g. \'March 20 2018\''
    });
    sywac.string('--postsAfter', {
        defaultValue: null,
        desc: 'Only migrate posts after and including a given date e.g. \'August 16 2021\''
    });
    sywac.number('--wait_after_scrape', {
        defaultValue: 2000,
        desc: 'Time in ms to wait after a URL is scraped'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: true,
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
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = substack.getTaskRunner(argv.pathToZip, argv, logger);

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

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
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
