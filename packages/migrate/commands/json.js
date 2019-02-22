/**
 * JSON is a top level command
 * It has sub-tasks, each one represented by a file in the 'json' directory
 */

// Internal ID in case we need one.
exports.id = 'json';

exports.group = 'Utilities:';

// The command to run and any params
exports.flags = 'json <subtask> <pathToJson>';

// Description for the top level command
exports.desc = 'Run a utility task on a Ghost JSON file';

exports.ignore = ['<subtask>', '<pathToJson>'];

// Configure all the options
exports.setup = (sywac) => {
    sywac.commandDirectory('json');
};
