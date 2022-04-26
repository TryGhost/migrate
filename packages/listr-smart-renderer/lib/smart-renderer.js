'use strict';
const logUpdate = require('log-update');
const chalk = require('chalk');
const cliTruncate = require('cli-truncate');
const stripAnsi = require('strip-ansi');
const {indentString, getSymbol, isDefined, taskNumber} = require('./utils');
const arrowRight = '→';
const arrowDown = '↓';

const dataRenderer = (data, prefix = '') => {
    if (typeof data === 'string') {
        data = stripAnsi(data.trim().split('\n').filter(Boolean).pop());

        if (data === '') {
            data = undefined;
        }
    }

    if (isDefined(data)) {
        return `   ${chalk.gray(cliTruncate(`${arrowRight} ${prefix} ${data}`, process.stdout.columns - 3))}`;
    }
};

const fullRenderer = (tasks, options, level = 0) => {
    let output = [];

    for (const task of tasks) {
        if (!task.isEnabled()) {
            continue;
        }

        // Skipped logic
        const skipped = task.isSkipped() ? ` ${chalk.dim('[skipped]')}` : '';

        // Main output
        output.push(indentString(`${getSymbol(task, options)} ${task.title}${skipped}`, level));

        // Handle any task data that needs to be output
        if (isDefined(task.output)) {
            let data = dataRenderer(task.output);
            if (isDefined(data)) {
                output.push(data);
            }
        }

        // Deal with subtasks
        if (task.hasSubtasks()) {
            output = output.concat(renderHelper(task.subtasks, options, level + 1));
        }
    }

    return output.join('\n');
};

const summaryRenderer = (tasks, options, level = 0) => {
    let output = [];
    let states = {complete: [], failed: [], skipped: [], disabled: []};

    tasks.forEach((task, index) => {
        if (task.hasFailed()) {
            states.failed.push(task);

            if (!task.output && task.hasSubtasks()) {
                task.output = `${chalk.red.dim(`Subtask failed ${arrowDown}`)}`;
            }
            output.push(indentString(`${getSymbol(task, options)} ${taskNumber(index, tasks)}: ${task.title} - ${task.output}`, level));
        } else {
            // Handle any task data that needs to be output
            if (isDefined(task.output)) {
                let data = dataRenderer(task.output, taskNumber(index, tasks));
                if (isDefined(data)) {
                    output.push(indentString(data, level));
                }
            }
        }
        if (task.isPending()) {
            output.push(indentString(`${getSymbol(task, options)} ${taskNumber(index, tasks)}: ${task.title}`, level));
        }

        if (task.hasSubtasks()) {
            output = output.concat(renderHelper(task.subtasks, options, level + 1));
        }

        if (task.isCompleted()) {
            states.complete.push(task);
        }

        if (task.isSkipped()) {
            states.skipped.push(task);
        }

        if (!task.isEnabled()) {
            states.disabled.push(task);
        }
    });

    output.push(indentString(`Total: ${tasks.length}. Complete: ${states.complete.length}, Failed: ${states.failed.length}, Skipped: ${states.skipped.length}, Disabled: ${states.disabled.length}`, level));

    return output.join('\n');
};

const renderHelper = (tasks, options, level = 0) => {
    // Decide which renderer we want to use
    const renderer = tasks.length > options.maxFullTasks ? summaryRenderer : fullRenderer;
    return renderer(tasks, options, level);
};

const render = (tasks, options, level = 0) => {
    logUpdate(renderHelper(tasks, options, level));
};

class SmartRenderer {
    constructor(tasks, options) {
        this._tasks = tasks;
        this._mode = 'full';
        this._options = Object.assign({
            maxFullTasks: 30,
            clearOutput: false
        }, options);
    }

    render() {
        if (this._id) {
            // Do not render if we are already rendering
            return;
        }

        this._id = setInterval(() => {
            render(this._tasks, this._options);
        }, 100);
    }

    end(err) {
        if (this._id) {
            clearInterval(this._id);
            this._id = undefined;
        }

        render(this._tasks, this._options);

        if (this._options.clearOutput && err === undefined) {
            logUpdate.clear();
        } else {
            logUpdate.done();
        }
    }
}

module.exports = SmartRenderer;
