const curate = require('../sources/curate');
const ui = require('@tryghost/pretty-cli').ui;

// Internal ID in case we need one.
exports.id = 'curate';

exports.group = 'Sources:';

// The command to run and any params
exports.flags = 'curate <pathToZip>';

// Description for the top level command
exports.desc = 'Migrate from Medium using an export zip';

// Descriptions for the individual params
exports.paramsDesc = ['Path to a curate export zip'];

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
    sywac.string('-e --email', {
        defaultValue: false,
        desc: 'Provide an email address for posts to attributed to e.g. john@example.com'
    });
    sywac.string('-n --name', {
        defaultValue: false,
        desc: 'Provide a name for posts to attributed to e.g. John'
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
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    try {
        // Fetch the tasks, configured correctly according to the options passed in
        let migrate = curate.getTaskRunner(argv.pathToZip, argv);

        // Run the migration
        await migrate.run(context);

        if (argv.verbose) {
            ui.log.info('Done', require('util').inspect(context.result.data, false, 2));
        }
    } catch (error) {
        ui.log.info('Done with errors', context.errors);
    }

    // Report success
    ui.log.ok(`Successfully written output to ${context.outputFile} in ${Date.now() - timer}ms.`);
};
