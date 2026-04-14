/* eslint-disable no-console */
import chalk from 'chalk';
import type {Renderer, QueueStats, TaskInfo} from './Renderer.js';

export class VerboseRenderer implements Renderer {
    #indent(depth: number): string {
        return '  '.repeat(depth);
    }

    onTaskStart(info: TaskInfo): void {
        console.log(`${this.#indent(info.depth)}[STARTING] ${info.title}`);
    }

    onTaskComplete(info: TaskInfo): void {
        console.log(chalk.green(`${this.#indent(info.depth)}[COMPLETED] ${info.title}`));
    }

    onTaskError(info: TaskInfo, error: Error): void {
        console.log(chalk.red(`${this.#indent(info.depth)}[FAILED] ${info.title}`));
        console.log(`${this.#indent(info.depth)}  ${error.stack || error.message}`);
    }

    onTaskSkip(info: TaskInfo): void {
        console.log(chalk.yellow(`${this.#indent(info.depth)}[SKIPPED] ${info.title}`));
    }

    onQueueEnd(stats: QueueStats): void {
        let summary = chalk.green(`Completed: ${stats.completed}`);
        if (stats.skipped > 0) {
            summary += ` | ${chalk.yellow(`Skipped: ${stats.skipped}`)}`;
        }
        summary += ` | ${chalk.red(`Failed: ${stats.errors.length}`)}`;
        console.log(`\n${summary}`);

        // Output error details
        for (const {title, error} of stats.errors) {
            console.log(chalk.red(`\n✗ ${title}`));
            console.log(`  ${error.stack || error.message}`);
        }
    }
}
