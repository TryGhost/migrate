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
};

// What to do when this command is executed
exports.run = async (argv) => {
    let timer = Date.now();
    if (argv.verbose) {
        ui.log.info(`Migrating from export at ${argv.pathToZip}`);
    }

    let filename = await medium.migrate(argv.pathToZip, argv.verbose);

    ui.log.ok(`Successfully written output to ${filename} in ${Date.now() - timer}ms.`);
};
