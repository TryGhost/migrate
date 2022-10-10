/**
 * JSON is a top level command
 * It has sub-tasks, each one represented by a file in the 'json' directory
 */

// Internal ID in case we need one.
const id = 'json';

const group = 'Utilities:';

// The command to run and any params
const flags = 'json <subtask> <pathToJson>';

// Description for the top level command
const desc = 'Run a utility task on a Ghost JSON file';

const ignore = ['<subtask>', '<pathToJson>'];

// Configure all the options
const setup = (sywac) => {
    sywac.commandDirectory('json');
};

export default {
    id,
    group,
    flags,
    desc,
    setup
};
