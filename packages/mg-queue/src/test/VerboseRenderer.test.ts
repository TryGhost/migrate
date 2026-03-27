import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';

import {VerboseRenderer, TaskInfo} from '../index.js';

function info(title: string, depth = 0): TaskInfo {
    return {title, depth};
}

describe('VerboseRenderer', () => {
    it('logs task start', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onTaskStart(info('my-task'));

        assert.equal(logs.length, 1);
        assert.ok(logs[0].includes('[STARTING]'));
        assert.ok(logs[0].includes('my-task'));

        mock.reset();
    });

    it('logs task complete', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onTaskComplete(info('my-task'));

        assert.equal(logs.length, 1);
        assert.ok(logs[0].includes('[COMPLETED]'));
        assert.ok(logs[0].includes('my-task'));

        mock.reset();
    });

    it('logs task error with stack trace', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        const error = new Error('Something went wrong');
        renderer.onTaskError(info('my-task'), error);

        assert.equal(logs.length, 2);
        assert.ok(logs[0].includes('[FAILED]'));
        assert.ok(logs[0].includes('my-task'));
        assert.ok(logs[1].includes('Something went wrong'));

        mock.reset();
    });

    it('logs task error message when no stack', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        const error = new Error('No stack error');
        error.stack = undefined;
        renderer.onTaskError(info('my-task'), error);

        assert.equal(logs.length, 2);
        assert.ok(logs[0].includes('[FAILED]'));
        assert.ok(logs[1].includes('No stack error'));

        mock.reset();
    });

    it('logs queue end stats', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onQueueEnd({completed: 10, skipped: 0, errors: [{title: 't1', error: new Error('e1')}, {title: 't2', error: new Error('e2')}]});

        assert.ok(logs[0].includes('10'));
        assert.ok(logs[0].includes('2'));

        mock.reset();
    });

    it('logs task skip', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onTaskSkip(info('my-task'));

        assert.equal(logs.length, 1);
        assert.ok(logs[0].includes('[SKIPPED]'));
        assert.ok(logs[0].includes('my-task'));

        mock.reset();
    });

    it('logs queue end stats with skipped', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onQueueEnd({completed: 10, skipped: 3, errors: [{title: 't1', error: new Error('e1')}, {title: 't2', error: new Error('e2')}]});

        assert.ok(logs[0].includes('10'));
        assert.ok(logs[0].includes('2'));
        assert.ok(logs[0].includes('3'));
        assert.ok(logs[0].includes('Skipped'));

        mock.reset();
    });

    it('outputs error details at end with stack trace', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        const error = new Error('Task failed badly');
        renderer.onQueueEnd({completed: 0, skipped: 0, errors: [{title: 'failing-task', error}]});

        const errorTitleLog = logs.find(log => log.includes('failing-task') && log.includes('✗'));
        assert.ok(errorTitleLog, 'Should output error title');

        const errorDetailLog = logs.find(log => log.includes('Task failed badly'));
        assert.ok(errorDetailLog, 'Should output error details');

        mock.reset();
    });

    it('outputs error message when no stack trace', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        const error = new Error('No stack error');
        error.stack = undefined;
        renderer.onQueueEnd({completed: 0, skipped: 0, errors: [{title: 'failing-task', error}]});

        const errorDetailLog = logs.find(log => log.includes('No stack error'));
        assert.ok(errorDetailLog, 'Should output error message when no stack');

        mock.reset();
    });

    it('indents output based on depth', () => {
        const logs: string[] = [];
        mock.method(console, 'log', (msg: string) => logs.push(msg));

        const renderer = new VerboseRenderer();
        renderer.onTaskStart(info('root', 0));
        renderer.onTaskStart(info('child', 1));
        renderer.onTaskStart(info('grandchild', 2));

        assert.ok(!logs[0].startsWith(' '), 'Root task should not be indented');
        assert.ok(logs[1].startsWith('  '), 'Child task should be indented by 2 spaces');
        assert.ok(logs[2].startsWith('    '), 'Grandchild task should be indented by 4 spaces');

        mock.reset();
    });
});
