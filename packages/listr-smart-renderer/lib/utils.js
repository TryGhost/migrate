import chalk from 'chalk';
import logSymbols from 'log-symbols';
import IndentString from 'indent-string';
import elegantSpinner from 'elegant-spinner';

const pointer = chalk.yellow('›');
const skipped = chalk.yellow('↓');

const isDefined = x => x !== null && x !== undefined;

const getSymbol = (task, options) => {
    if (!task.spinner) {
        task.spinner = elegantSpinner();
    }

    if (task.isPending()) {
        return options.showSubtasks !== false && task.subtasks?.length > 0 ? pointer : chalk.yellow(task.spinner());
    }

    if (task.isCompleted()) {
        return logSymbols.success;
    }

    if (task.hasFailed()) {
        return task.subtasks?.length > 0 ? pointer : logSymbols.error;
    }

    if (task.isSkipped()) {
        return skipped;
    }

    return ' ';
};

const indentString = (string, level) => IndentString(string, level, '  ');

/**
 * Outputs the task number in the form 05/10, so that the output doesn't jump around
 */
const taskNumber = (index, tasks) => {
    // Quick and dirty left pad
    let padSize = String(tasks.length).length;
    let padding = new Array(padSize).join(0);
    let taskNum = `${padding}${index + 1}`.slice(-padSize);

    return `${taskNum}/${tasks.length}`;
};

export {
    isDefined,
    getSymbol,
    indentString,
    taskNumber
};
