const medium = require('../lib/medium');
const ui = require('@tryghost/pretty-cli/ui');

// Internal ID in case we need one.
exports.id = 'medium';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'medium <pathToZip>';

// Description for the top level command
exports.desc = 'Migrate from medium';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a medium export zip'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
    sywac.enumeration('-s --scrape', {
        choices: ['all', 'web', 'img', 'none'],
        defaultValue: 'all',
        desc: 'Configure scraping tasks'

    });
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    let context = {errors: []};

    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = medium.getTaskRunner(argv.pathToZip, argv);

        // Run the migration
        await migrate.run(context);

        ui.log.info('Done', require('util').inspect(context.result, false, 2));
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
