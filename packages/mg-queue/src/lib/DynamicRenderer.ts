/* eslint-disable no-console */
import logUpdate from 'log-update';
import chalk from 'chalk';
import type {Renderer, QueueStats, TaskInfo} from './Renderer.js';

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

interface RunningTask {
    title: string;
    depth: number;
    parentTitle?: string;
    status: 'pending' | 'running' | 'completed' | 'skipped' | 'failed';
}

export interface DynamicRendererOptions {
    keepOnScreen?: boolean;
}

export class DynamicRenderer implements Renderer {
    #running: Map<string, RunningTask> = new Map();
    #completed = 0;
    #failed = 0;
    #skipped = 0;
    #frameIndex = 0;
    #interval: ReturnType<typeof setInterval> | null = null;
    #keepOnScreen: boolean;
    #persistentMode = false;

    constructor(options?: DynamicRendererOptions) {
        this.#keepOnScreen = options?.keepOnScreen ?? false;
    }

    #taskKey(info: TaskInfo): string {
        if (info.taskId !== undefined) {
            return String(info.taskId);
        }

        return `${info.depth}:${info.parentTitle ?? ''}:${info.title}`;
    }

    onTaskPending(info: TaskInfo): void {
        if (!this.#keepOnScreen) {
            return;
        }
        if (info.depth > 0) {
            return;
        }

        this.#persistentMode = true;
        const key = this.#taskKey(info);
        /* c8 ignore next 3 -- guard against duplicate pending events; not reachable via Queue */
        if (this.#running.has(key)) {
            return;
        }

        this.#running.set(key, {
            title: info.title,
            depth: info.depth,
            parentTitle: info.parentTitle,
            status: 'pending'
        });
        this.#startInterval();
    }

    onTaskStart(info: TaskInfo): void {
        const key = this.#taskKey(info);
        const existing = this.#running.get(key);

        if (existing) {
            existing.title = info.title;
            existing.depth = info.depth;
            existing.parentTitle = info.parentTitle;
            existing.status = 'running';
        } else {
            this.#running.set(key, {
                title: info.title,
                depth: info.depth,
                parentTitle: info.parentTitle,
                status: 'running'
            });
        }
        this.#startInterval();
    }

    onTaskComplete(info: TaskInfo): void {
        const key = this.#taskKey(info);
        const runningTask = this.#running.get(key);
        if (this.#persistentMode && info.depth === 0) {
            if (runningTask) {
                runningTask.status = 'completed';
            /* c8 ignore next 8 -- task is always pending/started before completing; guard for safety */
            } else {
                this.#running.set(key, {
                    title: info.title,
                    depth: info.depth,
                    parentTitle: info.parentTitle,
                    status: 'completed'
                });
            }
        } else {
            this.#running.delete(key);
        }
        this.#completed += 1;
    }

    onTaskError(info: TaskInfo, _error: Error): void {
        const key = this.#taskKey(info);
        if (this.#persistentMode && info.depth === 0) {
            const existing = this.#running.get(key);
            if (existing) {
                existing.status = 'failed';
            } else {
                this.#running.set(key, {
                    title: info.title,
                    depth: info.depth,
                    parentTitle: info.parentTitle,
                    status: 'failed'
                });
            }
        } else {
            this.#running.delete(key);
        }
        this.#failed += 1;
    }

    onTaskSkip(info: TaskInfo): void {
        if (this.#persistentMode && info.depth === 0) {
            const key = this.#taskKey(info);
            const existing = this.#running.get(key);

            if (existing) {
                existing.status = 'skipped';
            } else {
                this.#running.set(key, {
                    title: info.title,
                    depth: info.depth,
                    parentTitle: info.parentTitle,
                    status: 'skipped'
                });
            }
        }

        this.#skipped += 1;
    }

    onQueueEnd(stats: QueueStats): void {
        this.#stopInterval();
        if (this.#persistentMode) {
            this.#render();
            logUpdate.done();
        } else {
            logUpdate.clear();
        }
        if (!this.#persistentMode) {
            let summary = chalk.green(`✓ ${stats.completed}`);
            if (stats.skipped > 0) {
                summary += ` | ${chalk.yellow(`⊘ ${stats.skipped}`)}`;
            }
            if (stats.errors.length > 0) {
                summary += ` | ${chalk.red(`✗ ${stats.errors.length} failed`)}`;
            }
            console.log(summary);
        }

        // Output error details
        for (const {title, error} of stats.errors) {
            console.log(chalk.red(`\n✗ ${title}`));
            console.log(`  ${error.stack || error.message}`);
        }
    }

    #startInterval(): void {
        if (this.#interval) {
            return;
        }
        this.#render(); // Immediate first render
        this.#interval = setInterval(() => {
            this.#frameIndex = (this.#frameIndex + 1) % SPINNER_FRAMES.length;
            this.#render();
        }, 100);
    }

    #stopInterval(): void {
        if (this.#interval) {
            clearInterval(this.#interval);
            this.#interval = null;
        }
    }

    #render(): void {
        const spinner = SPINNER_FRAMES[this.#frameIndex];
        const lines: string[] = [];
        const tasks = [...this.#running.values()];
        const rootTasks = tasks.filter(t => !t.parentTitle);
        const childTasks = tasks.filter(t => t.parentTitle);

        // Group children by parent
        const childrenByParent = new Map<string, RunningTask[]>();
        for (const child of childTasks) {
            const siblings = childrenByParent.get(child.parentTitle!) || [];
            siblings.push(child);
            childrenByParent.set(child.parentTitle!, siblings);
        }

        // Render root tasks with their children nested below
        for (const task of rootTasks) {
            if (task.status === 'completed') {
                lines.push(chalk.green(`✓ ${task.title}`));
            } else if (task.status === 'pending') {
                lines.push(chalk.gray(`- ${task.title}`));
            } else if (task.status === 'skipped') {
                lines.push(chalk.yellow(`⊘ ${task.title}`));
            } else if (task.status === 'failed') {
                lines.push(chalk.rgb(255, 165, 0)(`! ${task.title}`));
            } else {
                lines.push(`${spinner} ${task.title}`);
            }
            const children = childrenByParent.get(task.title) || [];
            for (const child of children) {
                const indent = '  '.repeat(child.depth);
                /* c8 ignore next 6 -- children are removed from #running on complete/skip/pending so only 'running' is reachable */
                if (child.status === 'completed') {
                    lines.push(chalk.green(`${indent}✓ ${child.title}`));
                } else if (child.status === 'pending') {
                    lines.push(chalk.gray(`${indent}- ${child.title}`));
                } else if (child.status === 'skipped') {
                    lines.push(chalk.yellow(`${indent}⊘ ${child.title}`));
                } else {
                    lines.push(`${indent}${spinner} ${child.title}`);
                }
            }
            childrenByParent.delete(task.title);
        }

        // Render orphan subtasks (parent already completed)
        for (const children of childrenByParent.values()) {
            for (const child of children) {
                const indent = '  '.repeat(child.depth);
                /* c8 ignore next 6 -- orphan children are only in #running while 'running'; other statuses cause removal */
                if (child.status === 'completed') {
                    lines.push(chalk.green(`${indent}✓ ${child.title}`));
                } else if (child.status === 'pending') {
                    lines.push(chalk.gray(`${indent}- ${child.title}`));
                } else if (child.status === 'skipped') {
                    lines.push(chalk.yellow(`${indent}⊘ ${child.title}`));
                } else {
                    lines.push(`${indent}${spinner} ${child.title}`);
                }
            }
        }

        // Always show status line (keeps line count stable, reduces flicker)
        let status = chalk.green(`✓ ${this.#completed}`);
        if (this.#skipped > 0) {
            status += ` | ${chalk.yellow(`⊘ ${this.#skipped}`)}`;
        }
        if (this.#failed > 0) {
            status += ` | ${chalk.red(`✗ ${this.#failed}`)}`;
        }
        lines.push(status);

        logUpdate(lines.join('\n'));
    }
}
