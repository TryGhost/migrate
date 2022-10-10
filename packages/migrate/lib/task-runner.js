import Listr from 'listr';
import smartRenderer from '@tryghost/listr-smart-renderer';

const makeTaskRunner = (tasks, options = {}) => {
    let nonVerboseRenderer = options.renderer || smartRenderer;

    options.renderer = options.verbose ? 'verbose' : nonVerboseRenderer;
    options.exitOnError = options.exitOnError || false;
    options.concurrent = options.concurrent !== undefined ? options.concurrent : 3;

    // Allow a simple flag to be passed in to set "top level" settings
    if (options.topLevel) {
        // Top level tasks should exit on error, subtasks should report errors, not exit entirely
        options.exitOnError = true;
        // Top level tasks should execute one-after-the-other, most subtasks can have some concurrency
        options.concurrent = false;
    }

    return new Listr(tasks, options);
};

export default makeTaskRunner;
