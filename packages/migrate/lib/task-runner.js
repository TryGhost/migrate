const Listr = require('listr');

module.exports = (tasks, options) => {
    return new Listr(tasks, {
        renderer: options.verbose ? 'verbose' : 'default',
        exitOnError: options.exitOnError || false
    });
};
