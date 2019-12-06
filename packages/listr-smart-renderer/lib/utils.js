'use strict';
const chalk = require('chalk');
const logSymbols = require('log-symbols');
const indentString = require('indent-string');
const figures = require('figures');
const elegantSpinner = require('elegant-spinner');
const pointer = chalk.yellow(figures.pointer);
const skipped = chalk.yellow(figures.arrowDown);

exports.isDefined = x => x !== null && x !== undefined;

exports.getSymbol = (task, options) => {
    if (!task.spinner) {
        task.spinner = elegantSpinner();
    }

    if (task.isPending()) {
        return options.showSubtasks !== false && task.subtasks.length > 0 ? pointer : chalk.yellow(task.spinner());
    }

    if (task.isCompleted()) {
        return logSymbols.success;
    }

    if (task.hasFailed()) {
        return task.subtasks.length > 0 ? pointer : logSymbols.error;
    }

    if (task.isSkipped()) {
        return skipped;
    }

    return ' ';
};

exports.indentString = (string, level) => indentString(string, level, '  ');

/**
 * Outputs the task number in the form 05/10, so that the output doesn't jump around
 */
exports.taskNumber = (index, tasks) => {
    // Quick and dirty left pad
    let padSize = String(tasks.length).length;
    let padding = new Array(padSize).join(0);
    let taskNum = `${padding}${index + 1}`.slice(-padSize);

    return `${taskNum}/${tasks.length}`;
};
