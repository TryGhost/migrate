import {describe, it} from 'node:test';
import sinon from 'sinon';
import {ReuseLastCall} from '../../lib/ReuseLastCall.js';

describe('ReuseLastCall', () => {
    it('Only runs task once', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().resolves();

        const reuse = new ReuseLastCall();

        reuse.schedule('1', task1);
        await reuse.schedule('1', task2);

        sinon.assert.calledOnce(task1);
        sinon.assert.notCalled(task2);
    });

    it('Only runs task once unless already finished', async () => {
        const task1 = sinon.stub().resolves();
        const task2 = sinon.stub().resolves();

        const reuse = new ReuseLastCall();

        await reuse.schedule('1', task1);
        await reuse.schedule('1', task2);

        sinon.assert.calledOnce(task1);
        sinon.assert.calledOnce(task2);
    });
});
