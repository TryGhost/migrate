const wpAPISource = require('../sources/wp-api');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'wp-api';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'wp-api <url>';

// Description for the top level command
exports.desc = 'Migrate from medium';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a WordPress site'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'img', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'
    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`Migrating from site at ${argv.url}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = wpAPISource.getTaskRunner(argv.url, argv);

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
