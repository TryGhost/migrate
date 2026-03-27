import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import {Queue, Task, TaskError, SkipError, TimeoutError, Renderer, QueueStats, TaskInfo, Subtasks} from '../index.js';

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

class TestRenderer implements Renderer {
    pending: TaskInfo[] = [];
    started: TaskInfo[] = [];
    completed: TaskInfo[] = [];
    skipped: TaskInfo[] = [];
    errors: Array<{info: TaskInfo; error: Error}> = [];
    endStats: QueueStats | null = null;

    onTaskPending(info: TaskInfo): void {
        this.pending.push(info);
    }

    onTaskStart(info: TaskInfo): void {
        this.started.push(info);
    }

    onTaskComplete(info: TaskInfo): void {
        this.completed.push(info);
    }

    onTaskSkip(info: TaskInfo): void {
        this.skipped.push(info);
    }

    onTaskError(info: TaskInfo, error: Error): void {
        this.errors.push({info, error});
    }

    onQueueEnd(stats: QueueStats): void {
        this.endStats = stats;
    }

    // Helper methods for easier assertions
    pendingTitles(): string[] {
        return this.pending.map(t => t.title);
    }

    startedTitles(): string[] {
        return this.started.map(t => t.title);
    }

    completedTitles(): string[] {
        return this.completed.map(t => t.title);
    }

    skippedTitles(): string[] {
        return this.skipped.map(t => t.title);
    }

    errorTitles(): string[] {
        return this.errors.map(e => e.info.title);
    }
}

describe('Queue', () => {
    describe('configuration validation', () => {
        it('throws when queue concurrency is less than 1', () => {
            assert.throws(() => {
                new Queue({concurrency: 0});
            }, /Queue\.concurrency must be an integer greater than 0/);
        });

        it('uses a default yieldEvery value when not provided', async () => {
            const originalSetImmediate = globalThis.setImmediate;
            let setImmediateCalls = 0;

            globalThis.setImmediate = ((...immediateArgs: Parameters<typeof setImmediate>) => {
                setImmediateCalls += 1;
                return originalSetImmediate(...immediateArgs);
            }) as typeof setImmediate;

            try {
                const queue = new Queue({concurrency: 1});
                const tasks: Task[] = Array.from({length: 251}, (_, i) => ({
                    title: `task-${i + 1}`,
                    task: async () => {}
                }));

                await queue.run(tasks);

                assert.ok(setImmediateCalls >= 1, 'Expected at least one cooperative yield with default yieldEvery');
            } finally {
                globalThis.setImmediate = originalSetImmediate;
            }
        });

        it('throws when yieldEvery is less than 1', () => {
            assert.throws(() => {
                new Queue({concurrency: 1, yieldEvery: 0});
            }, /Queue\.yieldEvery must be an integer greater than 0/);
        });
    });

    describe('basic array processing', () => {
        it('processes all tasks from an array', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'task-1',
                    task: async () => {
                        await delay(1);
                    }
                },
                {
                    title: 'task-2',
                    task: async () => {
                        await delay(1);
                    }
                },
                {
                    title: 'task-3',
                    task: async () => {
                        await delay(1);
                    }
                }
            ];

            await queue.run(tasks);

            assert.equal(renderer.completed.length, 3);
            assert.ok(renderer.completedTitles().includes('task-1'));
            assert.ok(renderer.completedTitles().includes('task-2'));
            assert.ok(renderer.completedTitles().includes('task-3'));
        });

        it('handles empty array', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({concurrency: 5, renderer});
            await queue.run([]);
            assert.equal(renderer.endStats?.completed, 0);
            assert.equal(renderer.endStats?.skipped, 0);
            assert.equal(renderer.endStats?.errors.length, 0);
        });
    });

    describe('async generator processing', () => {
        it('processes tasks from async generator', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            async function* generateTasks(): AsyncGenerator<Task> {
                yield {
                    title: 'gen-1',
                    task: async () => {
                        await delay(1);
                    }
                };
                yield {
                    title: 'gen-2',
                    task: async () => {
                        await delay(1);
                    }
                };
                yield {
                    title: 'gen-3',
                    task: async () => {
                        await delay(1);
                    }
                };
            }

            await queue.run(generateTasks());

            assert.equal(renderer.completed.length, 3);
            assert.ok(renderer.completedTitles().includes('gen-1'));
            assert.ok(renderer.completedTitles().includes('gen-2'));
            assert.ok(renderer.completedTitles().includes('gen-3'));
        });

        it('pulls tasks lazily from generator', async () => {
            let pullCount = 0;
            const queue = new Queue({concurrency: 1});

            async function* generateTasks(): AsyncGenerator<Task> {
                for (let i = 0; i < 5; i += 1) {
                    pullCount += 1;
                    yield {
                        title: `lazy-${i}`,
                        task: async () => {
                            await delay(5);
                        }
                    };
                }
            }

            const runPromise = queue.run(generateTasks());

            // After a short delay, only ~1-2 tasks should have been pulled
            // (concurrency is 1, so we pull one, start it, then pull next when done)
            await delay(2);
            assert.ok(pullCount <= 2, `Expected at most 2 pulls, got ${pullCount}`);

            await runPromise;
            assert.equal(pullCount, 5);
        });
    });

    describe('concurrency enforcement', () => {
        it('never exceeds concurrency limit', async () => {
            let currentRunning = 0;
            let maxRunning = 0;
            const queue = new Queue({concurrency: 3});

            const tasks: Task[] = Array.from({length: 10}, (_, i) => ({
                title: `concurrent-${i}`,
                task: async () => {
                    currentRunning += 1;
                    maxRunning = Math.max(maxRunning, currentRunning);
                    await delay(10);
                    currentRunning -= 1;
                }
            }));

            await queue.run(tasks);

            assert.equal(maxRunning, 3);
            assert.equal(currentRunning, 0);
        });

        it('runs tasks in parallel up to concurrency', async () => {
            const startTimes: number[] = [];
            const renderer = new TestRenderer();
            renderer.onTaskStart = () => startTimes.push(Date.now());

            const queue = new Queue({
                concurrency: 3,
                renderer
            });

            const tasks: Task[] = Array.from({length: 3}, (_, i) => ({
                title: `parallel-${i}`,
                task: async () => {
                    await delay(50);
                }
            }));

            await queue.run(tasks);

            // All 3 tasks should start nearly simultaneously
            const maxDiff = Math.max(...startTimes) - Math.min(...startTimes);
            assert.ok(maxDiff < 20, `Expected tasks to start together, diff was ${maxDiff}ms`);
        });
    });

    describe('error handling', () => {
        it('collects errors and continues processing', async () => {
            const renderer = new TestRenderer();

            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'ok-1',
                    task: async () => {
                        await delay(1);
                    }
                },
                {
                    title: 'fail-1',
                    task: async () => {
                        throw new Error('fail-1');
                    }
                },
                {
                    title: 'ok-2',
                    task: async () => {
                        await delay(1);
                    }
                },
                {
                    title: 'fail-2',
                    task: async () => {
                        throw new Error('fail-2');
                    }
                },
                {
                    title: 'ok-3',
                    task: async () => {
                        await delay(1);
                    }
                }
            ];

            const stats = await queue.run(tasks);

            assert.equal(stats.errors.length, 2);
            assert.deepEqual(renderer.completedTitles().sort(), ['ok-1', 'ok-2', 'ok-3']);
            assert.deepEqual(renderer.errorTitles().sort(), ['fail-1', 'fail-2']);
            assert.equal(stats.completed, 3);
            assert.equal(stats.skipped, 0);
        });

        it('returns errors in stats with task titles', async () => {
            const queue = new Queue({concurrency: 5});

            const tasks: Task[] = [
                {
                    title: 'e1',
                    task: async () => {
                        throw new Error('error-1');
                    }
                },
                {
                    title: 'e2',
                    task: async () => {
                        throw new Error('error-2');
                    }
                },
                {
                    title: 'e3',
                    task: async () => {
                        throw new Error('error-3');
                    }
                }
            ];

            const stats = await queue.run(tasks);

            assert.equal(stats.errors.length, 3);
            const taskNames = stats.errors.map((e: {title: string; error: Error}) => e.title).sort();
            assert.deepEqual(taskNames, ['e1', 'e2', 'e3']);
            const messages = stats.errors.map((e: {title: string; error: Error}) => e.error.message).sort();
            assert.deepEqual(messages, ['error-1', 'error-2', 'error-3']);
        });

        it('resolves successfully when no errors', async () => {
            const queue = new Queue({concurrency: 2});
            const tasks: Task[] = [
                {title: 't1', task: async () => {}},
                {title: 't2', task: async () => {}}
            ];

            await queue.run(tasks);
        });
    });

    describe('renderer callbacks', () => {
        it('announces pending tasks for array sources', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            await queue.run([
                {title: 'pending-1', task: async () => {}},
                {title: 'pending-2', task: async () => {}},
                {title: 'pending-3', task: async () => {}}
            ]);

            assert.deepEqual(renderer.pendingTitles(), ['pending-1', 'pending-2', 'pending-3']);
        });

        it('does not announce pending tasks for generator sources', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            async function* generateTasks(): AsyncGenerator<Task> {
                yield {title: 'generated-1', task: async () => {}};
                yield {title: 'generated-2', task: async () => {}};
            }

            await queue.run(generateTasks());

            assert.equal(renderer.pending.length, 0);
        });

        it('provides a unique taskId for each started task', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            await queue.run([
                {title: 'duplicate-title', task: async () => {}},
                {title: 'duplicate-title', task: async () => {}},
                {title: 'duplicate-title', task: async () => {}}
            ]);

            const taskIds = renderer.started.map(t => t.taskId);
            assert.equal(taskIds.length, 3);
            assert.ok(taskIds.every(id => id !== undefined));
            assert.equal(new Set(taskIds).size, 3);
        });

        it('calls onTaskStart with correct title', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            await queue.run([
                {title: 'start-1', task: async () => {}},
                {title: 'start-2', task: async () => {}}
            ]);

            assert.deepEqual(renderer.startedTitles(), ['start-1', 'start-2']);
        });

        it('calls onTaskComplete with correct title', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            await queue.run([
                {title: 'complete-1', task: async () => {}},
                {title: 'complete-2', task: async () => {}}
            ]);

            assert.deepEqual(renderer.completedTitles(), ['complete-1', 'complete-2']);
        });

        it('calls onTaskError with correct title and error', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            const testError = new Error('test error');

            try {
                await queue.run([
                    {
                        title: 'error-task',
                        task: async () => {
                            throw testError;
                        }
                    }
                ]);
            } catch {
                // expected
            }

            assert.equal(renderer.errors.length, 1);
            assert.equal(renderer.errors[0].info.title, 'error-task');
            assert.equal(renderer.errors[0].error, testError);
        });

        it('calls onTaskStart before task runs', async () => {
            const events: string[] = [];
            const renderer = new TestRenderer();
            renderer.onTaskStart = info => events.push(`start:${info.title}`);

            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            await queue.run([{
                title: 'order-test',
                task: async () => {
                    events.push('running:order-test');
                }
            }]);

            assert.deepEqual(events, ['start:order-test', 'running:order-test']);
        });

        it('calls onTaskComplete after task finishes', async () => {
            const events: string[] = [];
            const renderer = new TestRenderer();
            renderer.onTaskComplete = info => events.push(`complete:${info.title}`);

            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            await queue.run([{
                title: 'order-test',
                task: async () => {
                    events.push('running:order-test');
                }
            }]);

            assert.deepEqual(events, ['running:order-test', 'complete:order-test']);
        });

        it('calls onQueueEnd with correct stats', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            const tasks: Task[] = [
                {title: 't1', task: async () => {}},
                {title: 't2', task: async () => {}},
                {
                    title: 't3',
                    task: async () => {
                        throw new Error('fail');
                    }
                }
            ];

            try {
                await queue.run(tasks);
            } catch {
                // expected
            }

            assert.equal(renderer.endStats?.completed, 2);
            assert.equal(renderer.endStats?.skipped, 0);
            assert.equal(renderer.endStats?.errors.length, 1);
        });
    });

    describe('iterable support', () => {
        it('processes tasks from Set', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            const taskSet = new Set<Task>([
                {title: 'set-1', task: async () => {}},
                {title: 'set-2', task: async () => {}}
            ]);

            await queue.run(taskSet);

            assert.equal(renderer.completed.length, 2);
            assert.ok(renderer.completedTitles().includes('set-1'));
            assert.ok(renderer.completedTitles().includes('set-2'));
        });

        it('processes tasks from generator function', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            function* generateTasks(): Generator<Task> {
                yield {title: 'sync-gen-1', task: async () => {}};
                yield {title: 'sync-gen-2', task: async () => {}};
            }

            await queue.run(generateTasks());

            assert.deepEqual(renderer.completedTitles().sort(), ['sync-gen-1', 'sync-gen-2']);
        });
    });

    describe('no renderer', () => {
        it('works without a renderer', async () => {
            const queue = new Queue({concurrency: 2});
            const results: string[] = [];

            await queue.run([
                {
                    title: 'silent-1',
                    task: async () => {
                        results.push('done-1');
                    }
                },
                {
                    title: 'silent-2',
                    task: async () => {
                        results.push('done-2');
                    }
                }
            ]);

            assert.equal(results.length, 2);
        });
    });

    describe('task skipping', () => {
        describe('pre-execution skip', () => {
            it('skips task when skip is true', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'skip-me',
                        skip: true,
                        task: async () => {
                            executed.push('skip-me');
                        }
                    },
                    {
                        title: 'run-me',
                        task: async () => {
                            executed.push('run-me');
                        }
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(executed, ['run-me']);
                assert.deepEqual(renderer.skippedTitles(), ['skip-me']);
                assert.deepEqual(renderer.completedTitles(), ['run-me']);
                assert.equal(renderer.endStats?.completed, 1);
                assert.equal(renderer.endStats?.skipped, 1);
                assert.equal(renderer.endStats?.errors.length, 0);
            });

            it('does not skip task when skip is false', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});

                const tasks: Task[] = [
                    {
                        title: 'run-me',
                        skip: false,
                        task: async () => {}
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(renderer.skippedTitles(), []);
                assert.deepEqual(renderer.completedTitles(), ['run-me']);
            });

            it('skips task when skip function returns true', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});

                const tasks: Task[] = [
                    {
                        title: 'skip-fn',
                        skip: () => true,
                        task: async () => {}
                    },
                    {
                        title: 'run-fn',
                        skip: () => false,
                        task: async () => {}
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(renderer.skippedTitles(), ['skip-fn']);
                assert.deepEqual(renderer.completedTitles(), ['run-fn']);
            });

            it('skips task when async skip function returns true', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});

                const tasks: Task[] = [
                    {
                        title: 'async-skip',
                        skip: async () => {
                            await delay(1);
                            return true;
                        },
                        task: async () => {}
                    },
                    {
                        title: 'async-run',
                        skip: async () => {
                            await delay(1);
                            return false;
                        },
                        task: async () => {}
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(renderer.skippedTitles(), ['async-skip']);
                assert.deepEqual(renderer.completedTitles(), ['async-run']);
            });

            it('does not call onTaskStart for pre-skipped tasks', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});

                await queue.run([
                    {title: 'skipped', skip: true, task: async () => {}},
                    {title: 'started', task: async () => {}}
                ]);

                assert.deepEqual(renderer.startedTitles(), ['started']);
            });
        });

        describe('in-execution skip', () => {
            it('skips task when ctx.skip() is called', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'skip-mid',
                        task: async (ctx) => {
                            executed.push('before-skip');
                            ctx.skip();
                            executed.push('after-skip');
                        }
                    },
                    {
                        title: 'normal',
                        task: async () => {
                            executed.push('normal');
                        }
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(executed, ['before-skip', 'normal']);
                assert.deepEqual(renderer.skippedTitles(), ['skip-mid']);
                assert.deepEqual(renderer.completedTitles(), ['normal']);
                assert.equal(renderer.endStats?.completed, 1);
                assert.equal(renderer.endStats?.skipped, 1);
                assert.equal(renderer.endStats?.errors.length, 0);
            });

            it('calls onTaskStart before in-execution skip', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 1, renderer});

                await queue.run([
                    {
                        title: 'started-then-skipped',
                        task: async (ctx) => {
                            ctx.skip();
                        }
                    }
                ]);

                assert.deepEqual(renderer.startedTitles(), ['started-then-skipped']);
                assert.deepEqual(renderer.skippedTitles(), ['started-then-skipped']);
            });
        });

        describe('SkipError', () => {
            it('has correct name and message', () => {
                const err = new SkipError();
                assert.equal(err.name, 'SkipError');
                assert.equal(err.message, 'Task skipped');
            });
        });

        describe('combined skip scenarios', () => {
            it('handles mix of pre-skip, in-execution skip, success, and failure', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 2, renderer});

                const tasks: Task[] = [
                    {title: 'pre-skip', skip: true, task: async () => {}},
                    {
                        title: 'in-skip',
                        task: async (ctx) => {
                            ctx.skip();
                        }
                    },
                    {title: 'success', task: async () => {}},
                    {
                        title: 'failure',
                        task: async () => {
                            throw new Error('fail');
                        }
                    }
                ];

                try {
                    await queue.run(tasks);
                } catch {
                    // expected
                }

                assert.deepEqual(renderer.skippedTitles().sort(), ['in-skip', 'pre-skip']);
                assert.deepEqual(renderer.completedTitles(), ['success']);
                assert.equal(renderer.errors.length, 1);
                assert.equal(renderer.endStats?.completed, 1);
                assert.equal(renderer.endStats?.skipped, 2);
                assert.equal(renderer.endStats?.errors.length, 1);
            });
        });
    });

    describe('task timeout', () => {
        it('completes tasks that finish before timeout', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                timeout: 1000,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'fast-1',
                    task: async () => {
                        await delay(10);
                    }
                },
                {
                    title: 'fast-2',
                    task: async () => {
                        await delay(10);
                    }
                }
            ];

            await queue.run(tasks);

            assert.deepEqual(renderer.completedTitles().sort(), ['fast-1', 'fast-2']);
            assert.equal(renderer.errors.length, 0);
        });

        it('fails tasks that exceed timeout', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                timeout: 50,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'slow-task',
                    task: async () => {
                        await delay(200);
                    }
                },
                {
                    title: 'fast-task',
                    task: async () => {
                        await delay(10);
                    }
                }
            ];

            const stats = await queue.run(tasks);

            assert.equal(stats.errors.length, 1);
            assert.equal(stats.errors[0].title, 'slow-task');
            assert.ok(stats.errors[0].error instanceof TimeoutError);
            assert.equal((stats.errors[0].error as TimeoutError).timeout, 50);
            assert.deepEqual(renderer.completedTitles(), ['fast-task']);
        });

        it('does not timeout when timeout is undefined', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 1,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'long-task',
                    task: async () => {
                        await delay(100);
                    }
                }
            ];

            await queue.run(tasks);

            assert.deepEqual(renderer.completedTitles(), ['long-task']);
            assert.equal(renderer.errors.length, 0);
        });

        it('handles mix of timeout and other errors', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 3,
                timeout: 50,
                renderer
            });

            const tasks: Task[] = [
                {
                    title: 'timeout-task',
                    task: async () => {
                        await delay(200);
                    }
                },
                {
                    title: 'error-task',
                    task: async () => {
                        throw new Error('regular error');
                    }
                },
                {
                    title: 'success-task',
                    task: async () => {
                        await delay(10);
                    }
                }
            ];

            const stats = await queue.run(tasks);

            assert.equal(stats.errors.length, 2);
            assert.deepEqual(renderer.completedTitles(), ['success-task']);
            assert.equal(stats.completed, 1);
        });

        it('does not free a concurrency slot until a timed-out task settles', async () => {
            const queue = new Queue({concurrency: 1, timeout: 30});
            const startedAt: Record<string, number> = {};

            const tasks: Task[] = [
                {
                    title: 'slow-timeout',
                    task: async () => {
                        startedAt['slow-timeout'] = Date.now();
                        await delay(80);
                    }
                },
                {
                    title: 'next-task',
                    task: async () => {
                        startedAt['next-task'] = Date.now();
                    }
                }
            ];

            await queue.run(tasks);

            const delta = startedAt['next-task'] - startedAt['slow-timeout'];
            assert.ok(delta >= 70, `Expected next task to wait for settlement, delta was ${delta}ms`);
        });

        describe('TimeoutError', () => {
            it('has correct name, message, and timeout', () => {
                const err = new TimeoutError(5000);
                assert.equal(err.name, 'TimeoutError');
                assert.equal(err.message, 'Task timed out after 5000ms');
                assert.equal(err.timeout, 5000);
            });
        });

        describe('AbortSignal', () => {
            it('provides signal to task context', async () => {
                const queue = new Queue({concurrency: 1});
                let receivedSignal: AbortSignal | undefined;

                const tasks: Task[] = [
                    {
                        title: 'task',
                        task: async (ctx) => {
                            receivedSignal = ctx.signal;
                        }
                    }
                ];

                await queue.run(tasks);

                assert.ok(receivedSignal instanceof AbortSignal);
                assert.equal(receivedSignal!.aborted, false);
            });

            it('aborts signal when timeout occurs', async () => {
                const queue = new Queue({concurrency: 1, timeout: 50});
                let signalAborted = false;

                const tasks: Task[] = [
                    {
                        title: 'slow-task',
                        task: async (ctx) => {
                            ctx.signal.addEventListener('abort', () => {
                                signalAborted = true;
                            });
                            await delay(200);
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.equal(signalAborted, true);
                assert.equal(stats.errors.length, 1);
            });

            it('does not abort signal when task completes successfully', async () => {
                const queue = new Queue({concurrency: 1, timeout: 200});
                let signalAborted = false;

                const tasks: Task[] = [
                    {
                        title: 'fast-task',
                        task: async (ctx) => {
                            ctx.signal.addEventListener('abort', () => {
                                signalAborted = true;
                            });
                            await delay(20);
                        }
                    }
                ];

                await queue.run(tasks);

                assert.equal(signalAborted, false);
            });

            it('can be used with fetch for cooperative cancellation', async () => {
                const queue = new Queue({concurrency: 1, timeout: 50});
                let fetchAborted = false;

                const tasks: Task[] = [
                    {
                        title: 'fetch-task',
                        task: async (ctx) => {
                            // Simulate a fetch that respects AbortSignal
                            await new Promise((resolve, reject) => {
                                const timeout = setTimeout(resolve, 200);
                                ctx.signal.addEventListener('abort', () => {
                                    clearTimeout(timeout);
                                    fetchAborted = true;
                                    reject(new Error('Aborted'));
                                });
                            });
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.equal(fetchAborted, true);
                assert.equal(stats.errors.length, 1);
            });
        });
    });

    describe('subtasks', () => {
        it('throws when Subtasks concurrency is less than 1', async () => {
            const queue = new Queue({concurrency: 2});
            const tasks: Task[] = [
                {
                    title: 'parent',
                    task: async () => {
                        return new Subtasks([{title: 'child', task: async () => {}}], {concurrency: 0});
                    }
                }
            ];

            const stats = await queue.run(tasks);
            assert.equal(stats.errors.length, 1);
            assert.match(stats.errors[0].error.message, /Subtasks\.concurrency for "parent" must be an integer greater than 0/);
        });

        describe('basic subtask execution', () => {
            it('executes subtasks returned by parent task', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            executed.push('parent');
                            return new Subtasks([
                                {
                                    title: 'child-1',
                                    task: async () => {
                                        executed.push('child-1');
                                    }
                                },
                                {
                                    title: 'child-2',
                                    task: async () => {
                                        executed.push('child-2');
                                    }
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                assert.ok(executed.includes('parent'));
                assert.ok(executed.includes('child-1'));
                assert.ok(executed.includes('child-2'));
                assert.equal(renderer.endStats?.completed, 3);
            });

            it('reports correct depth for subtasks', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child',
                                    task: async () => {}
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                const parentStart = renderer.started.find(t => t.title === 'parent');
                const childStart = renderer.started.find(t => t.title === 'child');

                assert.equal(parentStart?.depth, 0);
                assert.equal(childStart?.depth, 1);
            });

            it('handles tasks without subtasks', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'no-subtasks',
                        task: async () => {
                            // Returns undefined (no subtasks)
                        }
                    }
                ];

                await queue.run(tasks);

                assert.equal(renderer.endStats?.completed, 1);
                assert.deepEqual(renderer.completedTitles(), ['no-subtasks']);
            });

            it('handles empty subtask array', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'empty-subtasks',
                        task: async () => {
                            return new Subtasks([]);
                        }
                    }
                ];

                await queue.run(tasks);

                assert.equal(renderer.endStats?.completed, 1);
            });
        });

        describe('parallel subtask execution', () => {
            it('runs subtasks in parallel by default', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const startTimes: Record<string, number> = {};

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child-1',
                                    task: async () => {
                                        startTimes['child-1'] = Date.now();
                                        await delay(50);
                                    }
                                },
                                {
                                    title: 'child-2',
                                    task: async () => {
                                        startTimes['child-2'] = Date.now();
                                        await delay(50);
                                    }
                                },
                                {
                                    title: 'child-3',
                                    task: async () => {
                                        startTimes['child-3'] = Date.now();
                                        await delay(50);
                                    }
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                const times = Object.values(startTimes);
                const maxDiff = Math.max(...times) - Math.min(...times);
                assert.ok(maxDiff < 20, `Expected subtasks to start together, diff was ${maxDiff}ms`);
            });

            it('respects concurrency limit for subtasks', async () => {
                const queue = new Queue({concurrency: 2});
                let maxRunning = 0;
                let currentRunning = 0;

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks(Array.from({length: 5}, (_, i) => ({
                                title: `child-${i}`,
                                task: async () => {
                                    currentRunning += 1;
                                    maxRunning = Math.max(maxRunning, currentRunning);
                                    await delay(20);
                                    currentRunning -= 1;
                                }
                            })));
                        }
                    }
                ];

                await queue.run(tasks);

                assert.equal(maxRunning, 2);
            });
        });

        describe('sequential subtask execution', () => {
            it('runs subtasks sequentially when using Subtasks class with sequential: true', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const order: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child-1',
                                    task: async () => {
                                        order.push('child-1-start');
                                        await delay(30);
                                        order.push('child-1-end');
                                    }
                                },
                                {
                                    title: 'child-2',
                                    task: async () => {
                                        order.push('child-2-start');
                                        await delay(30);
                                        order.push('child-2-end');
                                    }
                                }
                            ], {sequential: true});
                        }
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(order, [
                    'child-1-start',
                    'child-1-end',
                    'child-2-start',
                    'child-2-end'
                ]);
            });

            it('runs subtasks in parallel when using Subtasks class without sequential', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const startTimes: Record<string, number> = {};

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child-1',
                                    task: async () => {
                                        startTimes['child-1'] = Date.now();
                                        await delay(50);
                                    }
                                },
                                {
                                    title: 'child-2',
                                    task: async () => {
                                        startTimes['child-2'] = Date.now();
                                        await delay(50);
                                    }
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                const times = Object.values(startTimes);
                const maxDiff = Math.max(...times) - Math.min(...times);
                assert.ok(maxDiff < 20, `Expected subtasks to start together, diff was ${maxDiff}ms`);
            });

            it('respects custom concurrency on Subtasks', async () => {
                const queue = new Queue({concurrency: 10});
                let maxRunning = 0;
                let currentRunning = 0;

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks(
                                Array.from({length: 6}, (_, i) => ({
                                    title: `child-${i}`,
                                    task: async () => {
                                        currentRunning += 1;
                                        maxRunning = Math.max(maxRunning, currentRunning);
                                        await delay(30);
                                        currentRunning -= 1;
                                    }
                                })),
                                {concurrency: 2}
                            );
                        }
                    }
                ];

                await queue.run(tasks);

                assert.equal(maxRunning, 2, 'Should respect Subtasks concurrency of 2');
            });

            it('respects custom timeout on Subtasks', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, timeout: 1000, renderer});

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'fast-child',
                                    task: async () => {
                                        await delay(10);
                                    }
                                },
                                {
                                    title: 'slow-child',
                                    task: async () => {
                                        await delay(200);
                                    }
                                }
                            ], {timeout: 50});
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.ok(stats.errors.length > 0);
                // slow-child should have timed out with the 50ms subtask timeout
                assert.ok(renderer.errorTitles().includes('slow-child'));
            });
        });

        describe('nested subtasks', () => {
            it('supports multiple levels of nesting', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'level-0',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'level-1',
                                    task: async () => {
                                        return new Subtasks([
                                            {
                                                title: 'level-2',
                                                task: async () => {}
                                            }
                                        ]);
                                    }
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                const level0 = renderer.started.find(t => t.title === 'level-0');
                const level1 = renderer.started.find(t => t.title === 'level-1');
                const level2 = renderer.started.find(t => t.title === 'level-2');

                assert.equal(level0?.depth, 0);
                assert.equal(level1?.depth, 1);
                assert.equal(level2?.depth, 2);
                assert.equal(renderer.endStats?.completed, 3);
            });
        });

        describe('subtask error handling', () => {
            it('continues processing subtasks after one fails', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child-ok-1',
                                    task: async () => {
                                        executed.push('child-ok-1');
                                    }
                                },
                                {
                                    title: 'child-fail',
                                    task: async () => {
                                        throw new Error('child error');
                                    }
                                },
                                {
                                    title: 'child-ok-2',
                                    task: async () => {
                                        executed.push('child-ok-2');
                                    }
                                }
                            ]);
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.ok(stats.errors.length > 0);
                assert.ok(executed.includes('child-ok-1'));
                assert.ok(executed.includes('child-ok-2'));
            });

            it('marks parent as failed when subtask fails', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'child-fail',
                                    task: async () => {
                                        throw new Error('child error');
                                    }
                                }
                            ]);
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.ok(stats.errors.length > 0);
                // Parent should be marked as errored due to subtask failure
                assert.equal(renderer.errors.length, 2); // child and parent
                assert.ok(renderer.errorTitles().includes('parent'));
                assert.ok(renderer.errorTitles().includes('child-fail'));
            });

            it('does not run subtasks if parent throws', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async (): Promise<Subtasks> => {
                            throw new Error('parent error');
                        }
                    }
                ];

                const stats = await queue.run(tasks);

                assert.ok(stats.errors.length > 0);
                assert.deepEqual(executed, []);
                assert.equal(stats.completed, 0);
            });
        });

        describe('subtask skipping', () => {
            it('skips subtasks with skip: true', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'skip-child',
                                    skip: true,
                                    task: async () => {
                                        executed.push('skip-child');
                                    }
                                },
                                {
                                    title: 'run-child',
                                    task: async () => {
                                        executed.push('run-child');
                                    }
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(executed, ['run-child']);
                assert.ok(renderer.skippedTitles().includes('skip-child'));
                assert.equal(renderer.endStats?.skipped, 1);
            });

            it('reports correct depth for skipped subtasks', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'skip-child',
                                    skip: true,
                                    task: async () => {}
                                }
                            ]);
                        }
                    }
                ];

                await queue.run(tasks);

                const skippedChild = renderer.skipped.find(t => t.title === 'skip-child');
                assert.equal(skippedChild?.depth, 1);
            });

            it('skips subtasks with skip: true in sequential mode', async () => {
                const renderer = new TestRenderer();
                const queue = new Queue({concurrency: 5, renderer});
                const executed: string[] = [];

                const tasks: Task[] = [
                    {
                        title: 'parent',
                        task: async () => {
                            return new Subtasks([
                                {
                                    title: 'skip-child',
                                    skip: true,
                                    task: async () => {
                                        executed.push('skip-child');
                                    }
                                },
                                {
                                    title: 'run-child',
                                    task: async () => {
                                        executed.push('run-child');
                                    }
                                }
                            ], {sequential: true});
                        }
                    }
                ];

                await queue.run(tasks);

                assert.deepEqual(executed, ['run-child']);
                assert.ok(renderer.skippedTitles().includes('skip-child'));
                assert.equal(renderer.endStats?.skipped, 1);
            });
        });
    });

    describe('renderer shorthand strings', () => {
        it('accepts "dynamic" as renderer', async () => {
            const queue = new Queue({
                concurrency: 1,
                renderer: 'dynamic'
            });

            const stats = await queue.run([
                {title: 'task', task: async () => {}}
            ]);

            assert.equal(stats.completed, 1);
        });

        it('accepts "verbose" as renderer', async () => {
            const queue = new Queue({
                concurrency: 1,
                renderer: 'verbose'
            });

            const stats = await queue.run([
                {title: 'task', task: async () => {}}
            ]);

            assert.equal(stats.completed, 1);
        });
    });

    describe('yieldEvery validation', () => {
        it('accepts a custom yieldEvery value', async () => {
            const queue = new Queue({
                concurrency: 1,
                yieldEvery: 50
            });

            const stats = await queue.run([
                {title: 'task', task: async () => {}}
            ]);

            assert.equal(stats.completed, 1);
        });

        it('throws on invalid yieldEvery', () => {
            assert.throws(() => {
                new Queue({concurrency: 1, yieldEvery: 0});
            }, /yieldEvery must be an integer greater than 0/);
        });
    });

    describe('generator source with skipped tasks', () => {
        it('skips tasks from a generator source', async () => {
            const renderer = new TestRenderer();
            const queue = new Queue({
                concurrency: 2,
                renderer
            });

            async function* tasks(): AsyncGenerator<Task> {
                yield {title: 'skipped', skip: true, task: async () => {}};
                yield {title: 'runs', task: async () => {}};
            }

            const stats = await queue.run(tasks());

            assert.equal(stats.completed, 1);
            assert.equal(stats.skipped, 1);
            assert.ok(renderer.skippedTitles().includes('skipped'));
        });
    });
});
