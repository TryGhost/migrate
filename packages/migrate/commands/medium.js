const medium = require('../lib/medium');
const ui = require('@tryghost/pretty-cli/ui');
const Listr = require('listr');

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
    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    // Fetch the tasks, configured correctly according to the options passed in
    let tasks = medium.getTasks(argv.pathToZip, argv);
    // Configure a new Listr task manager, we can use different renderers for different configs
    let migrate = new Listr(tasks, {renderer: argv.verbose ? 'verbose' : 'default'});
    // Run the migration
    let context = await migrate.run({errors: []});

    ui.log.info('done', require('util').inspect(context.result, false, 2));

    if (context.errors.length) {
        ui.log.error('Done with errors', context.errors);
    }
    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
