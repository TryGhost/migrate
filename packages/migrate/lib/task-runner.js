const Listr = require('listr');
const smartRenderer = require('@tryghost/listr-smart-renderer');

module.exports = (tasks, options = {}) => {
    let nonVerboseRenderer = options.renderer || smartRenderer;

    options.renderer = options.verbose ? 'verbose' : nonVerboseRenderer;
    options.exitOnError = options.exitOnError || false;
    options.concurrent = options.concurrent !== undefined ? options.concurrent : 3;

    return new Listr(tasks, options);
};
