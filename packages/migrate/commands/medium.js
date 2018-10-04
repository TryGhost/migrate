const medium = require('../lib/medium');

// @TODO shared prettyCLI UI
// Minimal little CLI Tool
const print = (...args) => {
    console.log(...args); // eslint-disable-line
};

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
exports.run = (argv) => {
    if (argv.verbose) {
        print(`Migrating from export at ${argv.pathToZip}`);
    }

    let filename = medium.migrate(argv.pathToZip, argv.verbose);

    print('Successfully written output to', filename);
};
