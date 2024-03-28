import sinon from 'sinon';
import {Queue} from '../../lib/Queue.js';
import assert from 'assert';

describe('Queue', () => {
    it('Runs tasks as soon as they are added', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().resolves();

        const queue = new Queue({
            maxRunningTasks: 1
        });

        queue.add(task1);
        queue.add(task2);

        await queue.waitUntilFinished();
        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });

    it('Runs can run tasks at the same time', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().resolves();

        const queue = new Queue({
            maxRunningTasks: 2
        });

        queue.add(task1);
        queue.add(task2);

        await queue.waitUntilFinished();
        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });

    it('Can add and wait', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().resolves();

        const queue = new Queue({
            maxRunningTasks: 2
        });

        queue.addAndWait(task1, 1000);
        queue.addAndWait(task2);

        await queue.waitUntilFinished();
        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });

    it('Add and wait will throw on rejects', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().rejects();

        const queue = new Queue({
            maxRunningTasks: 2
        });

        queue.addAndWait(task1, 1000);
        await assert.rejects(() => queue.addAndWait(task2));

        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });

    it('Has default options', () => {
        const queue = new Queue();
        assert(queue.maxRunningTasks === 25);
    });

    it('Does not block execution on errors', async () => {
        const task1 = sinon.stub().rejects(new Error('Failed'));
        const task2 = sinon.stub().resolves();

        const queue = new Queue({
            maxRunningTasks: 1
        });

        queue.add(task1);
        queue.add(task2);

        try {
            await queue.waitUntilFinished();
        } catch (e: any) {
            sinon.assert.calledOnce(task1);
            assert.equal(e.message, 'Failed');
        }
        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });
});
