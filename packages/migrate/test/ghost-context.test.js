import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ghostSource from '../sources/ghost.js';
import nock from 'nock';

describe('Ghost API context lifecycle', function () {
    it('reuses originals, remaps every run, stages rereads, and preserves the asset cache', async function () {
        const tmpPath = await mkdtemp(join(tmpdir(), 'mg-ghost-context-test-'));
        const options = {
            url: 'https://example.com',
            scrape: [],
            batch: 0,
            tmpPath,
            cacheName: 'test-ghost-source'
        };
        const task = {title: 'Initializing Workspace'};
        assert.equal(
            ghostSource.getFullTaskList(options).some(step => step.title === 'Prepare data for export'),
            false
        );

        try {
            const first = {};
            await ghostSource.getFullTaskList(options)[0].task(first, task);
            await first.migrateContext.sources.ingest({}, stage => {
                stage.put({
                    kind: 'post',
                    key: 'ghost-post-1',
                    format: 'json',
                    content: JSON.stringify({
                        id: 'ghost-post-1',
                        url: 'https://example.com/ghost-post/',
                        title: 'Original Ghost post',
                        slug: 'ghost-post',
                        html: '<p>Original HTML</p>',
                        created_at: '2026-01-01T00:00:00.000Z'
                    })
                });
            });
            await ghostSource
                .getFullTaskList(options)
                .find(step => step.title === 'Map stored Ghost content')
                .task(first);
            first.migrateContext.addLink('example.com/old/', '/new/');
            const cacheMarker = join(first.fileCache.tmpDir, 'assets-cache', 'marker.txt');
            await writeFile(cacheMarker, 'cached asset');
            first.assetScraper.close();
            await first.migrateContext.close();

            const info = {};
            await ghostSource.getInfoTaskList(options)[0].task(info, task);
            assert.equal(info.migrateContext, undefined);
            assert.equal(info.assetScraper, undefined);

            const second = {};
            await ghostSource.getFullTaskList(options)[0].task(second, task);
            assert.equal(second.hasStoredSource, true);
            assert.equal(ghostSource.getFullTaskList(options)[1].skip(second), true);
            assert.equal((await second.migrateContext.getAllPosts())[0].data.html, '<p>Original HTML</p>');
            assert.equal(await readFile(cacheMarker, 'utf8'), 'cached asset');
            const [changed] = await second.migrateContext.getAllPosts();
            changed.set('title', 'Changed mapping');
            changed.save(second.migrateContext.db);
            await ghostSource
                .getFullTaskList(options)
                .find(step => step.title === 'Map stored Ghost content')
                .task(second);
            assert.equal((await second.migrateContext.getAllPosts())[0].data.title, 'Original Ghost post');
            second.assetScraper.close();
            await second.migrateContext.close();

            const third = {};
            await ghostSource.getFullTaskList({...options, rereadSource: true})[0].task(third, task);
            assert.equal(third.migrateContext.sources.hasCompletedIngestion, true);
            assert.equal((await third.migrateContext.getAllPosts())[0].data.title, 'Original Ghost post');
            assert.equal(ghostSource.getFullTaskList({...options, rereadSource: true})[1].skip(third), false);
            assert.equal(await readFile(cacheMarker, 'utf8'), 'cached asset');
            third.assetScraper.close();
            await third.migrateContext.close();
        } finally {
            await rm(tmpPath, {recursive: true, force: true});
        }
    });
});

it('ingests Ghost API records once and remaps stored content without more API requests', async () => {
    const tmpPath = await mkdtemp(join(tmpdir(), 'mg-ghost-fetch-'));
    const url = 'https://ghost-source.example';
    const options = {
        url,
        apikey: '0123456789abcdef01234567:' + 'ab'.repeat(32),
        scrape: [],
        batch: 0,
        limit: 2,
        posts: true,
        pages: false,
        tmpPath,
        cacheName: 'api-replay',
        renderer: 'silent',
        zip: false,
        cache: true
    };
    const post = {
        id: '0123456789abcdef01234567',
        url: `${url}/post/`,
        title: 'Original',
        slug: 'post',
        html: '<p>Original HTML</p>',
        created_at: '2024-01-01T00:00:00Z'
    };
    const scope = nock(url)
        .get('/ghost/api/admin/posts/')
        .query(true)
        .reply(200, {posts: [post], meta: {pagination: {pages: 1, total: 1}}})
        .get('/ghost/api/admin/users/')
        .query(true)
        .reply(200, {users: []})
        .get('/ghost/api/admin/posts/')
        .query(true)
        .reply(200, {posts: [post], meta: {pagination: {pages: 1, total: 1}}});
    try {
        const first = {errors: [], warnings: []};
        await ghostSource.getTaskRunner(options).run(first);
        assert.ok(scope.isDone());
        assert.throws(() => first.migrateContext.db, /not initialized/);
        first.assetScraper.close();
        const initial = JSON.parse(await readFile(join(first.fileCache.zipDir, 'posts.json'), 'utf8'));
        assert.equal(initial.data.posts[0].id, post.id);
        const second = {errors: [], warnings: []};
        await ghostSource.getTaskRunner(options).run(second);
        assert.equal(second.hasStoredSource, true);
        const replayed = JSON.parse(await readFile(join(second.fileCache.zipDir, 'posts.json'), 'utf8'));
        assert.equal(replayed.data.posts[0].id, post.id);
        assert.equal(replayed.data.posts[0].html, post.html);
        assert.throws(() => second.migrateContext.db, /not initialized/);
    } finally {
        nock.cleanAll();
        await rm(tmpPath, {recursive: true, force: true});
    }
});
