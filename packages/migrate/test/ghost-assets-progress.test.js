import assert from 'node:assert/strict';
import {it} from 'node:test';
import {MigrateContext, TagContext, AuthorContext} from '@tryghost/mg-context';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import ghostSource from '../sources/ghost.js';

function assetRunner() {
    const task = ghostSource.getFullTaskList({}).find(step => step.title === 'Fetch images via AssetScraper');
    return makeTaskRunner([task], {renderer: 'silent', topLevel: true});
}

async function addPosts(context) {
    for (const type of ['post', 'page']) {
        const post = await context.addPost();
        post.set('title', type);
        post.set('type', type);
        post.set('html', '<p>Original</p>');
        post.set('created_at', new Date('2024-01-01T00:00:00Z'));
        post.addTag({name: 'News', slug: 'news'});
        post.addAuthor({name: 'Writer', slug: 'writer', email: 'writer@example.com'});
        post.save(context.db);
    }
}

it('shows bounded asset subtasks with live counts and the current item, and saves processed content', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        await addPosts(context);
        new TagContext({initialData: {name: 'Unused', slug: 'unused'}}).save(context.db);
        new AuthorContext({
            initialData: {name: 'Unused', slug: 'unused', email: 'unused@example.com'}
        }).save(context.db);
        const runner = assetRunner();
        const updates = [];
        const ctx = {
            migrateContext: context,
            allowScrape: {assets: true},
            errors: [],
            assetScraper: {
                async processAssets(entity) {
                    const parent = runner.tasks[0];
                    assert.equal(parent.subtasks.length, 3);
                    assert.ok(parent.subtasks.filter(task => task.isCompleted()).every(task => task.output === null));
                    const active = parent.subtasks.find(task => task.isPending());
                    updates.push([active.title, active.output]);
                    const field = {
                        PostContext: 'html',
                        TagContext: 'feature_image',
                        AuthorContext: 'profile_image'
                    }[entity.constructor.name];
                    entity.set(field, field === 'html' ? '<p>Processed</p>' : 'https://example.com/processed.jpg');
                }
            }
        };

        await runner.run(ctx);

        assert.deepEqual(updates, [
            ['Posts (0/2)', 'post'],
            ['Posts (1/2)', 'page'],
            ['Tags (0/1)', 'news'],
            ['Authors (0/1)', 'writer']
        ]);
        assert.deepEqual(
            runner.tasks[0].subtasks.map(task => task.title),
            ['Posts (2/2)', 'Tags (1/1)', 'Authors (1/1)']
        );
        assert.ok(runner.tasks[0].subtasks.every(task => task.isCompleted()));
        assert.ok(runner.tasks[0].subtasks.every(task => task.output === null));
        const posts = await context.getAllPosts();
        assert.ok(posts.every(post => post.get('html') === '<p>Processed</p>'));
        assert.equal(posts[0].data.tags[0].get('feature_image'), 'https://example.com/processed.jpg');
        assert.equal(posts[0].data.authors[0].get('profile_image'), 'https://example.com/processed.jpg');
        assert.deepEqual(ctx.errors, []);
    } finally {
        await context.close();
    }
});

it('completes empty asset subtasks with zero counts', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        const runner = assetRunner();
        await runner.run({
            migrateContext: context,
            allowScrape: {assets: true},
            errors: [],
            assetScraper: {processAssets: () => assert.fail('No entities should be processed')}
        });
        assert.deepEqual(
            runner.tasks[0].subtasks.map(task => task.title),
            ['Posts (0/0)', 'Tags (0/0)', 'Authors (0/0)']
        );
        assert.ok(runner.tasks[0].subtasks.every(task => task.isCompleted()));
        assert.ok(runner.tasks[0].subtasks.every(task => task.output === null));
    } finally {
        await context.close();
    }
});

it('propagates asset subtask failures and stops later processing', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        await addPosts(context);
        const runner = assetRunner();
        const failure = new Error('Asset storage failed');
        let calls = 0;
        const ctx = {
            migrateContext: context,
            allowScrape: {assets: true},
            errors: [],
            assetScraper: {
                async processAssets() {
                    calls++;
                    throw failure;
                }
            }
        };
        await assert.rejects(runner.run(ctx), error => error === failure);
        assert.equal(calls, 1);
        assert.equal(runner.tasks[0].subtasks[0].hasFailed(), true);
        assert.equal(runner.tasks[0].subtasks[0].output, 'post');
        assert.ok(runner.tasks[0].subtasks.slice(1).every(task => !task.isStarted()));
        assert.deepEqual(ctx.errors, [{message: 'Failed to fetch images via AssetScraper', error: failure}]);
    } finally {
        await context.close();
    }
});
