const Listr = require('listr');

module.exports = (tasks, options = {}) => {
    let nonVerboseRenderer = options.renderer || 'default';

    options.renderer = options.verbose ? 'verbose' : nonVerboseRenderer;
    options.exitOnError = options.exitOnError || false;

    return new Listr(tasks, options);
};
