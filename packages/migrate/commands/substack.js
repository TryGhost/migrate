const substack = require('../sources/substack');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'substack';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'substack <pathToFile>';

// Description for the top level command
exports.desc = 'Migrate from a Substack CSV';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a csv file'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.boolean('--zip', {
        defaultValue: true,
        desc: 'Create a zip file (set to false to skip)'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'web', 'img', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
    sywac.string('-e --email', {
        defaultValue: null,
        desc: 'Provide an email for users e.g. john@mycompany.com to create a general user w/ slug `john` and provided email'
    });
    sywac.string('-u --url', {
        defaultValue: 'https://ghost.io',
        desc: 'Provide a URL (without trailing slash) to the hosted source site, so we can scrape data'
    });
    sywac.string('-p --readPosts', {
        defaultValue: null,
        desc: 'Provide a path to a posts folder that contains HTML files (file name = post id) to read the post content'
    });
    sywac.boolean('--drafts', {
        defaultValue: true,
        desc: 'Import draft posts'
    });
    sywac.boolean('--fallBackHTMLCard', {
        defaultValue: false,
        desc: 'Fall back to convert to HTMLCard, if standard Mobiledoc convert fails'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToFile}`);
    }

    if (argv.readPosts) {
        context.postsDir = argv.readPosts;
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = substack.getTaskRunner(argv.pathToFile, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    if (argv.verbose) {
        ui.log.info(`Cached files can be found at ${context.fileCache.cacheDir}`);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
