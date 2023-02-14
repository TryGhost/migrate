import {inspect} from 'node:util';
import {ui} from '@tryghost/pretty-cli';
import squarespace from '../sources/squarespace.js';

// Internal ID in case we need one.
const id = 'squarespace';

const group = 'Sources:';

// The command to run and any params
const flags = 'squarespace';

// Description for the top level command
const desc = 'Migrate from a Squarespace XML';

// Configure all the options
const setup = (sywac) => {
    sywac.string('--pathToFile', {
        defaultValue: null,
        desc: 'Path to xml file',
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
    sywac.boolean('--drafts', {
        defaultValue: true,
        desc: 'Import draft posts'
    });
    sywac.boolean('--posts', {
        defaultValue: true,
        desc: 'Import Squarespace posts'
    });
    sywac.boolean('--pages', {
        defaultValue: false,
        desc: 'Import Squarespace pages'
    });
    sywac.boolean('--tags', {
        defaultValue: true,
        desc: 'Set to false if you don\'t want to import WordPress tags, only categories'
    });
    sywac.string('--addTag', {
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: true,
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

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = squarespace.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
    }

    if (context.warnings.length > 0) {
        ui.log.warn(context.warnings);
    }
};

export default {
    id,
    group,
    flags,
    desc,
    setup,
    run
};
