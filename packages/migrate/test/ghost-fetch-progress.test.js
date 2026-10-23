import assert from 'node:assert/strict';
import {it, mock} from 'node:test';
import {MigrateContext} from '@tryghost/mg-context';
import ghostAPI from '@tryghost/mg-ghost-api';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import ghostSource from '../sources/ghost.js';

function fetchRunner(options) {
    const rendered = [];
    class RecordingRenderer {
        static nonTTY = true;
        constructor(tasks) {
            rendered.push(tasks);
        }
        render() {}
        end() {}
    }
    const task = ghostSource
        .getFullTaskList({...options, renderer: RecordingRenderer})
        .find(step => step.title === 'Fetching content');
    const runner = makeTaskRunner([task], {renderer: RecordingRenderer, topLevel: true});
    return {runner, rendered};
}

it('shows one fetching task, hides page-task rendering, and clears successful progress', async () => {
    for (const [jobs, batch] of [
        [2, 0],
        [2, 2],
        [0, 0]
    ]) {
        const context = new MigrateContext({storage: 'memory'});
        await context.init();
        const options = {url: 'https://example.com', batch};
        const {runner, rendered} = fetchRunner(options);
        const total = batch > 0 ? 1 : jobs;
        const change = mock.method(ghostAPI.fetch, 'tasks', async () => {
            assert.equal(runner.tasks[0].output, 'Discovering content');
            return Array.from({length: jobs}, (_, index) => ({
                title: `Fetching posts, page ${index + 1} of ${jobs}`,
                task: async ctx => {
                    assert.equal(runner.tasks[0].output, `Fetching ${total} content batches`);
                    ctx.sourceIngestion.put({kind: 'post', key: String(index), content: '{}', format: 'json'});
                }
            }));
        });
        try {
            await runner.run({migrateContext: context, options, errors: []});
            assert.equal(rendered.length, 1);
            assert.equal(rendered[0].length, 1);
            assert.equal(runner.tasks[0].title, 'Fetching content');
            assert.equal(runner.tasks[0].isCompleted(), true);
            assert.equal(runner.tasks[0].hasSubtasks(), false);
            assert.equal(runner.tasks[0].output, null);
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.equal(context.sources.count(), total);
            if (batch > 0) {
                assert.equal(context.sources.get('post', '0'), null);
                assert.ok(context.sources.get('post', '1'));
            }
        } finally {
            change.mock.restore();
            await context.close();
        }
    }
});

it('keeps fetch failure details visible and preserves previously completed source data', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    await context.sources.ingest({}, stage => {
        stage.put({kind: 'post', key: 'original', content: 'original', format: 'text'});
    });
    const options = {url: 'https://example.com', batch: 0, rereadSource: true};
    const {runner, rendered} = fetchRunner(options);
    const failure = new Error('Fetching posts, page 2 failed');
    const change = mock.method(ghostAPI.fetch, 'tasks', async () => [
        {
            title: 'Fetching posts, page 2',
            task: async ctx => {
                ctx.sourceIngestion.put({kind: 'post', key: 'replacement', content: '{}', format: 'json'});
                throw failure;
            }
        }
    ]);
    const ctx = {migrateContext: context, options, hasStoredSource: true, errors: []};
    try {
        await assert.rejects(runner.run(ctx), error => error === failure);
        assert.equal(rendered.length, 1);
        assert.equal(runner.tasks[0].title, 'Fetching content');
        assert.equal(runner.tasks[0].hasFailed(), true);
        assert.equal(runner.tasks[0].output, failure.message);
        assert.equal(context.sources.count(), 1);
        assert.equal(context.sources.get('post', 'original').content, 'original');
        assert.equal(context.sources.get('post', 'replacement'), null);
        assert.deepEqual(ctx.errors, [{message: 'Failed to get content from Ghost API', error: failure}]);
    } finally {
        change.mock.restore();
        await context.close();
    }
});
