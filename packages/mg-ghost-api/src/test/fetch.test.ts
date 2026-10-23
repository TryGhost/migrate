import assert from 'node:assert/strict';
import {afterEach, it, mock} from 'node:test';
import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';
import ghostAPI from '../index.js';

const {fetch} = ghostAPI;
const options = {
    url: 'https://ghost.example',
    apikey: '0123456789abcdef01234567:' + 'ab'.repeat(32),
    limit: 2,
    posts: true,
    pages: true
};
const post = {
    id: '0123456789abcdef01234567',
    title: 'API post',
    slug: 'api-post',
    html: '<p>Original</p>',
    created_at: '2024-01-01T00:00:00Z'
};
const reply = (kind: string, records: unknown[] = [], pages = 1, total = records.length) => ({
    [kind]: records,
    meta: {pagination: {pages, total}}
});
const request = (kind: string, response: Record<string, unknown>) =>
    nock(options.url).get(`/ghost/api/admin/${kind}/`).query(true).reply(200, response);
afterEach(() => {
    nock.cleanAll();
    mock.restoreAll();
});

it('reads content counts and handles absent pagination metadata', async () => {
    for (const metadata of [true, false]) {
        for (const kind of ['posts', 'pages', 'users']) request(kind, metadata ? reply(kind, [], 1, 7) : {[kind]: []});
        assert.deepEqual(await fetch.contentStats(options), {
            posts: metadata ? 7 : 0,
            pages: metadata ? 7 : 0,
            users: metadata ? 7 : 0
        });
    }
});

it('discovers selected content and uses separate post and page filters', async () => {
    const scope = nock(options.url)
        .get('/ghost/api/admin/posts/')
        .query(query => query.filter === 'tag:posts')
        .reply(200, reply('posts', [], 3, 5))
        .get('/ghost/api/admin/pages/')
        .query(query => query.filter === 'tag:pages')
        .reply(200, reply('pages', [], 2, 4))
        .get('/ghost/api/admin/users/')
        .query(true)
        .reply(200, reply('users', [], 1, 9));
    const discovered = await fetch.discover({...options, postFilter: 'tag:posts', pageFilter: 'tag:pages'});
    assert.deepEqual(discovered.totals, {posts: 5, pages: 4, users: 9});
    assert.deepEqual(discovered.batches, {posts: 3, pages: 2});
    assert.ok(scope.isDone());
    request('users', {users: []});
    assert.deepEqual((await fetch.discover({...options, posts: false, pages: false})).totals, {
        posts: 0,
        pages: 0,
        users: 0
    });
    for (const kind of ['posts', 'pages', 'users']) request(kind, {[kind]: []});
    assert.deepEqual((await fetch.discover(options)).batches, {posts: 0, pages: 0});
});

it('stages paginated original API objects without mapping and preserves them on fetch failure', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        for (const kind of ['posts', 'pages', 'users']) request(kind, reply(kind, [], kind === 'posts' ? 2 : 1));
        const first = request('posts', reply('posts', [post]));
        const second = request('posts', reply('posts', [{...post, id: 'second'}]));
        const page = request('pages', reply('pages', [{...post, id: 'page'}]));
        await context.sources.ingest({}, async stage => {
            const tasks = await fetch.tasks(options, {migrateContext: context, sourceIngestion: stage, options});
            assert.equal(tasks.length, 3);
            for (const task of tasks) await task.task({migrateContext: context, sourceIngestion: stage, options});
            assert.equal(context.hasContent(), false);
        });
        assert.ok(first.isDone() && second.isDone() && page.isDone());
        assert.equal(context.sources.count(), 3);
        assert.deepEqual(JSON.parse(context.sources.get('post', post.id)!.content), post);
        for (const kind of ['posts', 'users']) request(kind, reply(kind));
        nock(options.url)
            .get('/ghost/api/admin/posts/')
            .query(true)
            .reply(500, {errors: [{message: 'unavailable'}]});
        mock.method(console, 'error', () => {});
        await assert.rejects(
            context.sources.ingest({replace: true}, async stage => {
                const tasks = await fetch.tasks(
                    {...options, pages: false},
                    {migrateContext: context, sourceIngestion: stage, options}
                );
                await tasks[0].task({migrateContext: context, sourceIngestion: stage, options});
            })
        );
        assert.equal(context.sources.count(), 3);
    } finally {
        await context.close();
    }
});

it('preserves direct mapped creation for existing task consumers', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        await assert.rejects(fetch.tasks(options, {options} as any), /requires ctx.migrateContext/);
        for (const kind of ['posts', 'pages', 'users']) request(kind, reply(kind));
        request('posts', reply('posts', [post]));
        request('pages', reply('pages', [{...post, id: 'page'}]));
        const tasks = await fetch.tasks(
            {...options, postFilter: 'status:published'},
            {migrateContext: context, options}
        );
        for (const task of tasks) await task.task({migrateContext: context, options});
        const stats = context.hasContent();
        assert.ok(stats);
        assert.equal(stats.pages, 1);
        assert.equal(context.sources.hasCompletedIngestion, false);
        assert.equal((await context.getAllPosts())[0].lookupKey, post.id);
    } finally {
        await context.close();
    }
});
