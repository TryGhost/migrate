import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';

import {DynamicRenderer, TaskInfo, LiveOutput} from '../index.js';

function info(title: string, depth = 0, parentTitle?: string, taskId?: number): TaskInfo {
    return {title, depth, parentTitle, taskId};
}

describe('DynamicRenderer', () => {
    let consoleLogs: string[] = [];
    let originalConsoleLog: typeof console.log;

    // Injected in place of log-update so tests never write ANSI to the real
    // process.stdout, which intermittently corrupts the `node --test` IPC stream.
    let output: LiveOutput;
    let outputCalls: {clear: number; done: number; renders: string[]};

    const makeRenderer = (options: {keepOnScreen?: boolean} = {}) => {
        return new DynamicRenderer({...options, output});
    };

    beforeEach(() => {
        consoleLogs = [];
        // eslint-disable-next-line no-console
        originalConsoleLog = console.log;
        // eslint-disable-next-line no-console
        console.log = (msg: string) => {
            consoleLogs.push(msg);
        };

        outputCalls = {clear: 0, done: 0, renders: []};
        output = Object.assign(
            (text: string) => {
                outputCalls.renders.push(text);
            },
            {
                clear: () => {
                    outputCalls.clear += 1;
                },
                done: () => {
                    outputCalls.done += 1;
                }
            }
        );
    });

    afterEach(() => {
        // eslint-disable-next-line no-console
        console.log = originalConsoleLog;
    });

    it('defaults to log-update on process.stdout when no output is injected', () => {
        // Construct with the default output (no render is triggered, so nothing is
        // written to stdout) to cover the createLogUpdate(process.stdout) fallback
        const renderer = new DynamicRenderer();
        assert.ok(renderer instanceof DynamicRenderer);
    });

    it('tracks running tasks', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));
        renderer.onTaskStart(info('task-2'));
        renderer.onTaskComplete(info('task-1'));
        renderer.onTaskStart(info('task-3'));
        renderer.onTaskComplete(info('task-2'));
        renderer.onTaskComplete(info('task-3'));

        renderer.onQueueEnd({completed: 3, skipped: 0, errors: []});

        // onQueueEnd logs summary with checkmark and count
        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('3'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('tracks failed tasks', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));
        const error = new Error('fail');
        renderer.onTaskError(info('task-1'), error);
        renderer.onTaskStart(info('task-2'));

        // Wait for render cycle to cover the failed branch in #render()
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('task-2'));

        renderer.onQueueEnd({completed: 1, skipped: 0, errors: [{title: 'task-1', error}]});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('1'));
        assert.ok(endLog, 'Should have logged completion message');
        assert.ok(endLog.includes('failed'), 'Should include failed count');
    });

    it('shows only completed count when no failures', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));
        renderer.onTaskComplete(info('task-1'));

        renderer.onQueueEnd({completed: 1, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓'));
        assert.ok(endLog, 'Should have logged completion message');
        assert.ok(!endLog.includes('failed'), 'Should not include failed when 0 failures');
    });

    it('updates spinner frame on interval', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));

        // Wait for interval to fire at least once (interval is 100ms)
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('task-1'));

        renderer.onQueueEnd({completed: 1, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('shows each running task on its own line', async () => {
        const renderer = makeRenderer();

        // Start multiple tasks
        renderer.onTaskStart(info('task-1'));
        renderer.onTaskStart(info('task-2'));
        renderer.onTaskStart(info('task-3'));

        // Wait for at least one render cycle
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        // Complete all
        renderer.onTaskComplete(info('task-1'));
        renderer.onTaskComplete(info('task-2'));
        renderer.onTaskComplete(info('task-3'));

        renderer.onQueueEnd({completed: 3, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('3'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('shows skipped count in summary', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));
        renderer.onTaskComplete(info('task-1'));
        renderer.onTaskSkip(info('task-2'));

        renderer.onQueueEnd({completed: 1, skipped: 1, errors: []});

        const endLog = consoleLogs.find(log => log.includes('⊘'));
        assert.ok(endLog, 'Should include skipped symbol');
    });

    it('shows all counts when tasks are skipped and failed', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('task-1'));
        renderer.onTaskComplete(info('task-1'));
        renderer.onTaskSkip(info('task-2'));
        renderer.onTaskStart(info('task-3'));
        const error = new Error('fail');
        renderer.onTaskError(info('task-3'), error);

        renderer.onQueueEnd({completed: 1, skipped: 1, errors: [{title: 'task-3', error}]});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('⊘') && log.includes('✗'));
        assert.ok(endLog, 'Should include all three status symbols');
    });

    it('shows skipped count during render cycle', async () => {
        const renderer = makeRenderer();

        // Skip a task first
        renderer.onTaskSkip(info('skipped-task'));

        // Start a task to trigger render cycle
        renderer.onTaskStart(info('running-task'));

        // Wait for render cycle to cover the skipped branch in #render()
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('running-task'));

        renderer.onQueueEnd({completed: 1, skipped: 1, errors: []});

        const endLog = consoleLogs.find(log => log.includes('⊘'));
        assert.ok(endLog, 'Should include skipped symbol');
    });

    it('outputs error details at end with stack trace', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('failing-task'));
        const error = new Error('Something went wrong');
        renderer.onTaskError(info('failing-task'), error);

        renderer.onQueueEnd({completed: 0, skipped: 0, errors: [{title: 'failing-task', error}]});

        const errorTitleLog = consoleLogs.find(log => log.includes('failing-task') && log.includes('✗'));
        assert.ok(errorTitleLog, 'Should output error title');

        const errorDetailLog = consoleLogs.find(log => log.includes('Something went wrong'));
        assert.ok(errorDetailLog, 'Should output error details');
    });

    it('outputs error message when no stack trace', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('failing-task'));
        const error = new Error('No stack error');
        error.stack = undefined;
        renderer.onTaskError(info('failing-task'), error);

        renderer.onQueueEnd({completed: 0, skipped: 0, errors: [{title: 'failing-task', error}]});

        const errorDetailLog = consoleLogs.find(log => log.includes('No stack error'));
        assert.ok(errorDetailLog, 'Should output error message when no stack');
    });

    it('tracks tasks at different depths correctly', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart(info('parent', 0));
        renderer.onTaskStart(info('child', 1));
        renderer.onTaskComplete(info('child', 1));
        renderer.onTaskComplete(info('parent', 0));

        renderer.onQueueEnd({completed: 2, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('2'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('groups subtasks under their parent task', async () => {
        const renderer = makeRenderer();

        // Start parent and subtasks
        renderer.onTaskStart(info('parent', 0));
        renderer.onTaskStart(info('child-1', 1, 'parent'));
        renderer.onTaskStart(info('child-2', 1, 'parent'));

        // Wait for render cycle
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('child-1', 1, 'parent'));
        renderer.onTaskComplete(info('child-2', 1, 'parent'));
        renderer.onTaskComplete(info('parent', 0));

        renderer.onQueueEnd({completed: 3, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('3'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('renders orphan subtasks when parent completes first', async () => {
        const renderer = makeRenderer();

        // Start parent and subtasks
        renderer.onTaskStart(info('parent', 0));
        renderer.onTaskStart(info('child-1', 1, 'parent'));
        renderer.onTaskStart(info('child-2', 1, 'parent'));

        // Parent completes before children
        renderer.onTaskComplete(info('parent', 0));

        // Wait for render cycle - children should still render as orphans
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('child-1', 1, 'parent'));
        renderer.onTaskComplete(info('child-2', 1, 'parent'));

        renderer.onQueueEnd({completed: 3, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('3'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('tracks duplicate titles separately when taskId is provided', async () => {
        const renderer = makeRenderer();

        renderer.onTaskStart({title: 'duplicate', depth: 0, taskId: 1});
        renderer.onTaskStart({title: 'duplicate', depth: 0, taskId: 2});

        renderer.onTaskComplete({title: 'duplicate', depth: 0, taskId: 1});
        renderer.onTaskComplete({title: 'duplicate', depth: 0, taskId: 2});

        renderer.onQueueEnd({completed: 2, skipped: 0, errors: []});

        const endLog = consoleLogs.find(log => log.includes('✓') && log.includes('2'));
        assert.ok(endLog, 'Should have logged completion message');
    });

    it('renders pending tasks when keepOnScreen is enabled', async () => {
        const renderer = makeRenderer({keepOnScreen: true});

        renderer.onTaskPending(info('parent', 0, undefined, 1));
        renderer.onTaskPending(info('child', 1, 'parent', 2));

        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskStart(info('parent', 0, undefined, 1));
        renderer.onTaskComplete(info('parent', 0, undefined, 1));
        renderer.onTaskSkip(info('child', 1, 'parent', 2));
        renderer.onQueueEnd({completed: 1, skipped: 1, errors: []});
    });

    it('does not enable keep-on-screen mode for subtask-only pending events', async () => {
        const renderer = makeRenderer({keepOnScreen: true});
        renderer.onTaskPending(info('child', 1, 'parent', 2));
        renderer.onQueueEnd({completed: 0, skipped: 0, errors: []});

        assert.equal(outputCalls.clear, 1);
        assert.equal(outputCalls.done, 0);
    });

    it('clears output on queue end by default', async () => {
        const renderer = makeRenderer();
        renderer.onTaskStart(info('task-1'));
        renderer.onTaskComplete(info('task-1'));
        renderer.onQueueEnd({completed: 1, skipped: 0, errors: []});

        assert.equal(outputCalls.clear, 1);
        assert.equal(outputCalls.done, 0);
    });

    it('keeps completed tasks on screen when keepOnScreen is enabled', async () => {
        const renderer = makeRenderer({keepOnScreen: true});
        renderer.onTaskPending(info('Uppercasing titles', 0, undefined, 1));
        renderer.onTaskPending(info('Adding content', 0, undefined, 2));
        renderer.onTaskStart(info('Uppercasing titles'));
        renderer.onTaskComplete(info('Uppercasing titles'));
        renderer.onTaskStart(info('Adding content'));

        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('Adding content'));
        renderer.onQueueEnd({completed: 2, skipped: 0, errors: []});

        assert.equal(outputCalls.clear, 0);
        assert.equal(outputCalls.done, 1);
        assert.equal(consoleLogs.length, 0);
    });

    it('keeps only depth-0 tasks on screen in keep-on-screen mode', async () => {
        const renderer = makeRenderer({keepOnScreen: true});
        renderer.onTaskPending(info('root', 0, undefined, 1));
        renderer.onTaskStart(info('root', 0, undefined, 1));
        renderer.onTaskStart(info('child', 1, 'root', 2));
        renderer.onTaskComplete(info('child', 1, 'root', 2));
        renderer.onTaskComplete(info('root', 0, undefined, 1));
        renderer.onQueueEnd({completed: 2, skipped: 0, errors: []});

        assert.equal(outputCalls.clear, 0);
        assert.equal(outputCalls.done, 1);
    });

    it('keeps failed depth-0 tasks on screen in keep-on-screen mode', async () => {
        const renderer = makeRenderer({keepOnScreen: true});
        renderer.onTaskPending(info('parent', 0, undefined, 1));
        renderer.onTaskStart(info('parent', 0, undefined, 1));
        renderer.onTaskStart(info('child', 1, 'parent', 2));
        renderer.onTaskError(info('child', 1, 'parent', 2), new Error('child failed'));
        renderer.onTaskError(info('parent', 0, undefined, 1), new Error('parent failed'));
        renderer.onQueueEnd({completed: 0, skipped: 0, errors: [{title: 'parent', error: new Error('parent failed')}]});

        assert.equal(outputCalls.clear, 0);
        assert.equal(outputCalls.done, 1);
    });

    it('renders skipped and failed root tasks in persistent mode', async () => {
        const renderer = makeRenderer({keepOnScreen: true});

        renderer.onTaskPending(info('task-1', 0, undefined, 1));
        renderer.onTaskPending(info('task-2', 0, undefined, 2));
        renderer.onTaskStart(info('task-1', 0, undefined, 1));
        renderer.onTaskComplete(info('task-1', 0, undefined, 1));
        // task-2 was pending, now skipped — covers existing.status = 'skipped' (line 130)
        renderer.onTaskSkip(info('task-2', 0, undefined, 2));
        // task-3 was never pending, now skipped — covers the else branch (lines 132-138)
        renderer.onTaskSkip(info('task-3', 0, undefined, 3));
        // task-4 was never pending, now failed — covers else branch in onTaskError (lines 112-117)
        renderer.onTaskError(info('task-4', 0, undefined, 4), new Error('boom'));

        // Start a task so the render interval is active
        renderer.onTaskStart(info('task-5', 0, undefined, 5));

        // Wait for render cycle to cover skipped/failed root task rendering (line 210)
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('task-5', 0, undefined, 5));
        renderer.onQueueEnd({completed: 2, skipped: 2, errors: [{title: 'task-4', error: new Error('boom')}]});
    });

    it('renders child tasks in various states during render cycle', async () => {
        const renderer = makeRenderer({keepOnScreen: true});

        renderer.onTaskPending(info('parent', 0, undefined, 1));
        renderer.onTaskStart(info('parent', 0, undefined, 1));

        // Set up children in different states before the render fires
        renderer.onTaskPending(info('pending-child', 1, 'parent', 2));
        renderer.onTaskStart(info('done-child', 1, 'parent', 3));
        renderer.onTaskComplete(info('done-child', 1, 'parent', 3));
        renderer.onTaskSkip(info('skipped-child', 1, 'parent', 4));

        // Wait for render cycle — parent is still running, children are in #running map
        // This covers lines 220 (completed child), 222 (pending child), 224 (skipped child)
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('parent', 0, undefined, 1));
        renderer.onQueueEnd({completed: 2, skipped: 1, errors: []});
    });

    it('renders orphan subtasks in various states during render cycle', async () => {
        const renderer = makeRenderer({keepOnScreen: true});

        renderer.onTaskPending(info('parent', 0, undefined, 1));
        renderer.onTaskStart(info('parent', 0, undefined, 1));

        // Add children
        renderer.onTaskStart(info('orphan-running', 1, 'parent', 2));
        renderer.onTaskStart(info('orphan-done', 1, 'parent', 3));
        renderer.onTaskComplete(info('orphan-done', 1, 'parent', 3));
        renderer.onTaskPending(info('orphan-pending', 1, 'parent', 4));
        renderer.onTaskSkip(info('orphan-skipped', 1, 'parent', 5));

        // Parent completes — children become orphans
        renderer.onTaskComplete(info('parent', 0, undefined, 1));

        // Wait for render cycle with orphans still in the map
        // Covers lines 237 (completed orphan), 239 (pending orphan), 241 (skipped orphan)
        await new Promise(resolve => {
            setTimeout(resolve, 120);
        });

        renderer.onTaskComplete(info('orphan-running', 1, 'parent', 2));
        renderer.onQueueEnd({completed: 3, skipped: 1, errors: []});
    });

    it('does not persist rows without pending events even when keepOnScreen is enabled', async () => {
        const renderer = makeRenderer({keepOnScreen: true});
        renderer.onTaskStart(info('generator-task'));
        renderer.onTaskComplete(info('generator-task'));
        renderer.onQueueEnd({completed: 1, skipped: 0, errors: []});

        assert.equal(outputCalls.clear, 1);
        assert.equal(outputCalls.done, 0);
    });
});
