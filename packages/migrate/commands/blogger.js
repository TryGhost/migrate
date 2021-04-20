const blogger = require('../sources/blogger');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'blogger';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'blogger <pathToFile>';

// Description for the top level command
exports.desc = 'Migrate from a Blogger XML';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a xml file'];

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
    sywac.boolean('--drafts', {
        defaultValue: true,
        desc: 'Import draft posts'
    });
    sywac.string('--addTag', {
        defaultValue: null,
        desc: 'Provide a tag name which should be added to every post in this migration'
    });
    sywac.string('--email', {
        defaultValue: 'example.com',
        desc: 'Provide an email domain for users e.g. mycompany.com to create a general user w/ slug `john` and provided email'
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

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = blogger.getTaskRunner(argv);

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
    if (argv.zip) {
        let outputFile = await context.outputFile;
        ui.log.ok(`Successfully written output to ${outputFile.path} in ${Date.now() - timer}ms.`);
    }
};
