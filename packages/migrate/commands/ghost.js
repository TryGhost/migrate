const ghost = require('../sources/ghost');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'ghost';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'ghost <url> <apikey>';

// Description for the top level command
exports.desc = 'Migrate from Ghost using the Admin API';

// Descriptions for the individual params
exports.paramsDesc = ['Ghost API URL ', 'Ghost API key'];

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
        choices: ['img', 'none'],
        defaultValue: 'img',
        desc: 'Configure scraping tasks'
    });
    sywac.boolean('-I, --info', {
        defaultValue: false,
        desc: 'Show initialisation info only'
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
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`Migrating from Ghost at ${argv.url}`);
    }

    if (argv.batch !== 0) {
        ui.log.info(`Running batch ${argv.batch} (groups of ${argv.limit} posts)`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = ghost.getTaskRunner(argv);

        // Run the migration
        await migrate.run(context);

        if (argv.info && context.info) {
            let batches = context.info.batches.posts;
            ui.log.info(`Batch info: ${context.info.totals.posts} posts ${batches} batches.`);
        }

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
