const ui = require('@tryghost/pretty-cli').ui;
const makeTaskRunner = require('../lib/task-runner');

// Internal ID in case we need one.
exports.id = 'test';

// The command to run and any params
exports.flags = 'test';

// Description for the top level command
exports.desc = 'Test the migrate CLI UI';

// Configure all the options
exports.setup = (sywac) => {
    sywac.boolean('-V --verbose', {
        defaultValue: false,
        desc: 'Show verbose output'
    });
};

exports.hidden = true;

// What to do when this command is executed
exports.run = async (argv) => {
    // Use default renderer options, but leave this here to make it easy to play around
    const options = {};
    let context = {errors: []};
    let uniqueErrorId = 0;

    if (argv.verbose) {
        ui.log.info(`Running a test`);
    }

    try {
        const getSubTasks = (numSubTasks = 5, extra) => {
            let subtasks = [];
            for (let i = 0; i < numSubTasks; i++) {
                subtasks.push({
                    title: `Tasky McTaskFace ${i}`,
                    enabled: () => i !== 3,
                    skip: () => i === 1,
                    task: (ctx, task) => {
                        return new Promise((resolve, reject) => {
                            // no op
                            setTimeout(() => {
                                if (i === 5) {
                                    uniqueErrorId += 1;
                                    return reject(new Error(`I am error ${uniqueErrorId}`));
                                }

                                if (i === 7) {
                                    task.output = 'Hello World!';
                                }

                                return resolve('z');
                            }, 500);
                        });
                    }
                });
            }

            if (extra) {
                subtasks.push({
                    title: 'One last thing',
                    task: () => {
                        return makeTaskRunner(getSubTasks(10), options);
                    }
                });
            }

            return subtasks;
        };

        let topLevelTasks = [{
            title: 'Step 1: initialise',
            task: () => {
                // no op
            }
        },
        {
            title: 'Step 2: fucktonne of subtasks',
            task: () => {
                return makeTaskRunner(getSubTasks(35, true), options);
            }
        }, {
            title: 'Step 3: skipped',
            skip: () => true,
            task: () => {
                return Promise.resolve('lala');
            }
        },
        {
            title: 'Step 4: finalise with output',
            task: (ctx, task) => {
                task.output = 'Hello World!';
                return Promise.resolve('lala');
            }
        },
        {
            title: 'Step 5: disabled',
            enabled: () => false,
            task: () => {
                return Promise.resolve('lala');
            }
        }
        ];

        let runner;

        // Nested Runner
        if (argv.nested) {
            runner = makeTaskRunner(topLevelTasks, Object.assign({topLevel: true}, options));
        } else {
            // Simple Runner
            runner = makeTaskRunner(getSubTasks(35, true), Object.assign({topLevel: true}, options));
        }

        await runner.run(context);
    } catch (error) {
        console.log(error); // eslint-disable-line no-console
    }
};
