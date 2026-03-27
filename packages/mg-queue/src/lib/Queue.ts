import type {Renderer, TaskInfo, QueueStats} from './Renderer.js';
import {SilentRenderer} from './SilentRenderer.js';
import {VerboseRenderer} from './VerboseRenderer.js';
import {DynamicRenderer} from './DynamicRenderer.js';

export class TaskError extends Error {
    readonly task: string;
    readonly cause: Error;

    constructor(task: string, cause: Error) {
        super(`Task "${task}" failed: ${cause.message}`);
        this.name = 'TaskError';
        this.task = task;
        this.cause = cause;
    }
}

export class SkipError extends Error {
    constructor() {
        super('Task skipped');
        this.name = 'SkipError';
    }
}

export class TimeoutError extends Error {
    readonly timeout: number;

    constructor(timeout: number) {
        super(`Task timed out after ${timeout}ms`);
        this.name = 'TimeoutError';
        this.timeout = timeout;
    }
}

export interface SubtasksOptions {
    sequential?: boolean;
    concurrency?: number;
    timeout?: number;
}

export class Subtasks {
    readonly tasks: Task[];
    readonly concurrency?: number;
    readonly timeout?: number;

    constructor(tasks: Task[], options?: SubtasksOptions) {
        this.tasks = tasks;
        // sequential: true is shorthand for concurrency: 1
        this.concurrency = options?.sequential ? 1 : options?.concurrency;
        this.timeout = options?.timeout;
    }
}

export interface TaskContext {
    skip(): void;
    signal: AbortSignal;
}

export interface Task {
    title: string;
    skip?: boolean | (() => boolean | Promise<boolean>);
    task: (ctx: TaskContext) => Promise<void | Subtasks>;
}

export type TaskSource = Task[] | Iterable<Task> | AsyncIterable<Task>;

export type BuiltInRenderer = 'silent' | 'verbose' | 'dynamic';

export interface QueueOptions {
    concurrency: number;
    renderer?: BuiltInRenderer | Renderer;
    timeout?: number;
    yieldEvery?: number;
}

interface TaskResult {
    completed: number;
    skipped: number;
    errors: TaskError[];
}

interface TaskEntry {
    task: Task;
    taskId: number;
}

export class Queue {
    static readonly #DEFAULT_YIELD_EVERY = 250;
    readonly #concurrency: number;
    readonly #renderer: Renderer;
    readonly #timeout?: number;
    readonly #yieldEvery: number;
    #nextTaskId = 0;
    #showPendingTasks = false;
    #yieldCounter = 0;

    constructor(options: QueueOptions) {
        this.#concurrency = Queue.#validateConcurrency(options.concurrency, 'Queue.concurrency');
        this.#renderer = Queue.#resolveRenderer(options.renderer);
        this.#timeout = options.timeout;
        this.#yieldEvery = Queue.#validateYieldEvery(options.yieldEvery);
    }

    static #resolveRenderer(renderer?: BuiltInRenderer | Renderer): Renderer {
        if (renderer === undefined || renderer === 'silent') {
            return new SilentRenderer();
        }
        if (renderer === 'verbose') {
            return new VerboseRenderer();
        }
        if (renderer === 'dynamic') {
            return new DynamicRenderer();
        }
        return renderer;
    }

    static #validateConcurrency(value: number, fieldName: string): number {
        if (!Number.isInteger(value) || value < 1) {
            throw new RangeError(`${fieldName} must be an integer greater than 0`);
        }

        return value;
    }

    static #validateYieldEvery(value?: number): number {
        if (value === undefined) {
            return Queue.#DEFAULT_YIELD_EVERY;
        }

        if (!Number.isInteger(value) || value < 1) {
            throw new RangeError('Queue.yieldEvery must be an integer greater than 0');
        }

        return value;
    }

    #allocateTaskId(): number {
        const taskId = this.#nextTaskId;
        this.#nextTaskId += 1;
        return taskId;
    }

    #createTimeout(timeout: number, controller: AbortController): {promise: Promise<never>; clear: () => void} {
        let timeoutId: ReturnType<typeof setTimeout>;
        const promise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
                controller.abort();
                reject(new TimeoutError(timeout));
            }, timeout);
        });
        return {
            promise,
            clear: () => clearTimeout(timeoutId)
        };
    }

    async #shouldSkip(task: Task): Promise<boolean> {
        if (task.skip === undefined) {
            return false;
        }
        if (typeof task.skip === 'boolean') {
            return task.skip;
        }
        return task.skip();
    }

    async #runSubtasks(
        subtasks: Task[],
        depth: number,
        parentTitle: string,
        concurrency: number,
        timeout?: number
    ): Promise<TaskResult> {
        const subtaskEntries = subtasks.map((task) => {
            const taskId = this.#allocateTaskId();
            if (this.#showPendingTasks) {
                this.#renderer.onTaskPending?.({title: task.title, depth, parentTitle, taskId});
            }

            return {task, taskId};
        });

        // Sequential execution (concurrency === 1)
        if (concurrency === 1) {
            let completed = 0;
            let skipped = 0;
            const errors: TaskError[] = [];

            for (const subtaskEntry of subtaskEntries) {
                if (await this.#shouldSkip(subtaskEntry.task)) {
                    skipped += 1;
                    this.#renderer.onTaskSkip({title: subtaskEntry.task.title, depth, parentTitle, taskId: subtaskEntry.taskId});
                } else {
                    const result = await this.#executeTask(subtaskEntry.task, depth, parentTitle, timeout, subtaskEntry.taskId);
                    completed += result.completed;
                    skipped += result.skipped;
                    errors.push(...result.errors);
                    await this.#yieldIfNeeded(result.completed + result.skipped + result.errors.length);
                }
            }

            return {completed, skipped, errors};
        }

        // Parallel execution
        let running = 0;
        let completed = 0;
        let skipped = 0;
        const errors: TaskError[] = [];
        let index = 0;

        let resolveSlotAvailable: (() => void) | null = null;
        let resolveAllDone: (() => void) | null = null;
        let allStarted = false;

        const runOne = async (subtaskEntry: TaskEntry) => {
            const result = await this.#executeTask(subtaskEntry.task, depth, parentTitle, timeout, subtaskEntry.taskId);
            completed += result.completed;
            skipped += result.skipped;
            errors.push(...result.errors);
            await this.#yieldIfNeeded(result.completed + result.skipped + result.errors.length);

            running -= 1;
            resolveSlotAvailable?.();
            resolveSlotAvailable = null;
            if (allStarted && running === 0) {
                resolveAllDone?.();
            }
        };

        while (index < subtaskEntries.length) {
            while (running >= concurrency && index < subtaskEntries.length) {
                await new Promise<void>((resolve) => {
                    resolveSlotAvailable = resolve;
                });
            }

            if (index < subtaskEntries.length) {
                const subtaskEntry = subtaskEntries[index];
                index += 1;
                if (await this.#shouldSkip(subtaskEntry.task)) {
                    skipped += 1;
                    this.#renderer.onTaskSkip({
                        title: subtaskEntry.task.title,
                        depth,
                        parentTitle,
                        taskId: subtaskEntry.taskId
                    });
                } else {
                    running += 1;
                    runOne(subtaskEntry);
                }
            }
        }

        allStarted = true;

        if (running > 0) {
            await new Promise<void>((resolve) => {
                resolveAllDone = resolve;
            });
        }

        return {completed, skipped, errors};
    }

    async #executeTask(task: Task, depth: number, parentTitle?: string, timeout?: number, taskId?: number): Promise<TaskResult> {
        /* c8 ignore next -- taskId is always provided by callers */
        const info: TaskInfo = {title: task.title, depth, parentTitle, taskId: taskId ?? this.#allocateTaskId()};
        this.#renderer.onTaskStart(info);

        const controller = new AbortController();
        const ctx: TaskContext = {
            skip(): void {
                throw new SkipError();
            },
            signal: controller.signal
        };

        // Use provided timeout, or fall back to queue's default timeout
        const effectiveTimeout = timeout ?? this.#timeout;
        const timeoutHandle = effectiveTimeout ? this.#createTimeout(effectiveTimeout, controller) : null;

        let timedOut = false;
        const taskPromise = task.task(ctx);
        try {
            const result = timeoutHandle
                ? await Promise.race([taskPromise, timeoutHandle.promise])
                : await taskPromise;

            timeoutHandle?.clear();

            // Check if task returned subtasks
            if (result instanceof Subtasks && result.tasks.length > 0) {
                const subtaskConcurrency = Queue.#validateConcurrency(
                    result.concurrency ?? this.#concurrency,
                    `Subtasks.concurrency for "${task.title}"`
                );
                const subtaskTimeout = result.timeout ?? effectiveTimeout;
                const subtaskResult = await this.#runSubtasks(
                    result.tasks,
                    depth + 1,
                    task.title,
                    subtaskConcurrency,
                    subtaskTimeout
                );

                if (subtaskResult.errors.length > 0) {
                    // Parent fails if any subtask failed
                    this.#renderer.onTaskError(info, subtaskResult.errors[0].cause);
                    return {
                        completed: subtaskResult.completed,
                        skipped: subtaskResult.skipped,
                        errors: subtaskResult.errors
                    };
                }

                this.#renderer.onTaskComplete(info);
                return {
                    completed: subtaskResult.completed + 1,
                    skipped: subtaskResult.skipped,
                    errors: []
                };
            }

            this.#renderer.onTaskComplete(info);
            return {completed: 1, skipped: 0, errors: []};
        } catch (err) {
            timeoutHandle?.clear();
            if (err instanceof TimeoutError) {
                timedOut = true;
            }
            if (err instanceof SkipError) {
                this.#renderer.onTaskSkip(info);
                return {completed: 0, skipped: 1, errors: []};
            }
            this.#renderer.onTaskError(info, err as Error);
            if (timedOut) {
                // Keep queue slot occupied until task work has actually settled.
                await taskPromise.catch(() => {});
            }
            return {completed: 0, skipped: 0, errors: [new TaskError(task.title, err as Error)]};
        }
    }

    async #yieldIfNeeded(increment: number): Promise<void> {
        /* c8 ignore next 3 -- defensive guard; yieldEvery is validated > 0 and increment is always >= 1 */
        if (this.#yieldEvery === 0 || increment === 0) {
            return;
        }

        this.#yieldCounter += increment;
        if (this.#yieldCounter < this.#yieldEvery) {
            return;
        }

        this.#yieldCounter = 0;
        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }

    async run(source: TaskSource): Promise<QueueStats> {
        this.#yieldCounter = 0;
        let running = 0;
        let finished = false;
        let completed = 0;
        let skipped = 0;
        const errors: TaskError[] = [];

        let resolveSlotAvailable: (() => void) | null = null;
        let resolveAllDone: (() => void) | null = null;

        const runTask = async (taskEntry: TaskEntry) => {
            const result = await this.#executeTask(taskEntry.task, 0, undefined, undefined, taskEntry.taskId);
            completed += result.completed;
            skipped += result.skipped;
            errors.push(...result.errors);
            await this.#yieldIfNeeded(result.completed + result.skipped + result.errors.length);

            running -= 1;
            resolveSlotAvailable?.();
            resolveSlotAvailable = null;
            if (finished && running === 0) {
                resolveAllDone?.();
            }
        };

        try {
            if (Array.isArray(source)) {
                this.#showPendingTasks = true;
                const sourceEntries: TaskEntry[] = source.map((task) => {
                    const taskId = this.#allocateTaskId();
                    this.#renderer.onTaskPending?.({title: task.title, depth: 0, taskId});

                    return {task, taskId};
                });
                const iterator: AsyncIterator<TaskEntry> = this.#getAsyncIterator(sourceEntries);

                // Pull and execute tasks
                let done = false;
                while (!done) {
                    while (running >= this.#concurrency) {
                        await new Promise<void>((resolve) => {
                            resolveSlotAvailable = resolve;
                        });
                    }

                    const result = await iterator.next();
                    if (result.done) {
                        finished = true;
                        done = true;
                    } else {
                        const taskEntry = result.value;
                        if (await this.#shouldSkip(taskEntry.task)) {
                            skipped += 1;
                            this.#renderer.onTaskSkip({title: taskEntry.task.title, depth: 0, taskId: taskEntry.taskId});
                        } else {
                            running += 1;
                            runTask(taskEntry);
                        }
                    }
                }
            } else {
                this.#showPendingTasks = false;
                const iterator: AsyncIterator<Task> = this.#getAsyncIterator(source);

                // Pull and execute tasks
                let done = false;
                while (!done) {
                    while (running >= this.#concurrency) {
                        await new Promise<void>((resolve) => {
                            resolveSlotAvailable = resolve;
                        });
                    }

                    const result = await iterator.next();
                    if (result.done) {
                        finished = true;
                        done = true;
                    } else {
                        const taskEntry: TaskEntry = {task: result.value, taskId: this.#allocateTaskId()};

                        if (await this.#shouldSkip(taskEntry.task)) {
                            skipped += 1;
                            this.#renderer.onTaskSkip({title: taskEntry.task.title, depth: 0, taskId: taskEntry.taskId});
                        } else {
                            running += 1;
                            runTask(taskEntry);
                        }
                    }
                }
            }

            // Wait for remaining tasks
            if (running > 0) {
                await new Promise<void>((resolve) => {
                    resolveAllDone = resolve;
                });
            }

            const stats: QueueStats = {
                completed,
                skipped,
                errors: errors.map(e => ({title: e.task, error: e.cause}))
            };

            this.#renderer.onQueueEnd(stats);

            return stats;
        } finally {
            this.#showPendingTasks = false;
        }
    }

    #getAsyncIterator<T>(source: T[] | Iterable<T> | AsyncIterable<T>): AsyncIterator<T> {
        if (Symbol.asyncIterator in source) {
            return (source as AsyncIterable<T>)[Symbol.asyncIterator]();
        }
        const syncIterator = (source as Iterable<T>)[Symbol.iterator]();
        return {
            async next() {
                return syncIterator.next();
            }
        };
    }
}
