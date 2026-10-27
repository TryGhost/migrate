import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdtemp, readdir, readFile, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import ghostSource from '../sources/ghost.js';
import nock from 'nock';

describe('Ghost API context lifecycle', function () {
    it('reuses originals, remaps every run, stages rereads, and preserves the asset cache', async function () {
        const tmpPath = await mkdtemp(join(tmpdir(), 'mg-ghost-context-test-'));
        const options = {
            url: 'https://example.com',
            scrape: ['assets'],
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
                .task(first, {});
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
                .task(second, {});
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
        assert.equal(first.assetScraper, undefined);
        const initial = JSON.parse(await readFile(join(first.fileCache.zipDir, 'ghost-import.json'), 'utf8'));
        assert.equal(initial.data.posts[0].id, post.id);
        const second = {errors: [], warnings: []};
        await ghostSource.getTaskRunner(options).run(second);
        assert.equal(second.hasStoredSource, true);
        const replayed = JSON.parse(await readFile(join(second.fileCache.zipDir, 'ghost-import.json'), 'utf8'));
        assert.equal(replayed.data.posts[0].id, post.id);
        assert.equal(replayed.data.posts[0].html, post.html);
        assert.throws(() => second.migrateContext.db, /not initialized/);
    } finally {
        nock.cleanAll();
        await rm(tmpPath, {recursive: true, force: true});
    }
});

it('rewrites source links, publishes a ZIP with a report, and writes a failed report when a reread fails', async () => {
    const tmpPath = await mkdtemp(join(tmpdir(), 'mg-ghost-output-'));
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
        outputPath: tmpPath,
        cacheName: 'output',
        report: true,
        renderer: 'silent'
    };
    const posts = [
        {
            id: '0123456789abcdef01234567',
            url: `${url}/blog/first/`,
            title: 'First',
            slug: 'first',
            html: `<p><a href="${url}/blog/second/">Second</a> <a href="https://elsewhere.example/">Away</a></p>`,
            created_at: '2024-01-01T00:00:00Z'
        },
        {
            id: '0123456789abcdef01234568',
            url: `${url}/blog/second/`,
            title: 'Second',
            slug: 'second',
            html: '<p>Second</p>',
            created_at: '2024-01-02T00:00:00Z'
        }
    ];
    const scope = nock(url)
        .get('/ghost/api/admin/posts/')
        .query(true)
        .reply(200, {posts, meta: {pagination: {pages: 1, total: 2}}})
        .get('/ghost/api/admin/users/')
        .query(true)
        .reply(200, {users: []})
        .get('/ghost/api/admin/posts/')
        .query(true)
        .reply(200, {posts, meta: {pagination: {pages: 1, total: 2}}});
    try {
        const first = {errors: [], warnings: []};
        await ghostSource.getTaskRunner(options).run(first);
        assert.ok(scope.isDone());
        assert.deepEqual(first.summary, {selected: 2, imported: 2, skipped: 0});
        assert.equal(first.exportedFiles, 1);
        assert.equal(first.outputFile.path, join(tmpPath, first.outputName));
        assert.ok((await stat(first.outputFile.path)).size > 0);
        const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
        assert.equal(report.summary.status, 'complete');
        assert.equal(report.summary.imported, 2);
        const exported = JSON.parse(await readFile(join(first.fileCache.zipDir, 'ghost-import.json'), 'utf8'));
        const html = exported.data.posts.find(post => post.slug === 'first').html;
        assert.match(html, /href="\/blog\/second\/"/);
        assert.match(html, /href="https:\/\/elsewhere\.example\/"/);
        assert.deepEqual(
            (await readdir(first.fileCache.zipDir)).filter(name => name.endsWith('.json')),
            ['ghost-import.json']
        );

        nock(url)
            .get('/ghost/api/admin/posts/')
            .query(true)
            .reply(500, {errors: [{message: 'Down'}]});
        const failed = {errors: [], warnings: []};
        await assert.rejects(ghostSource.getTaskRunner({...options, rereadSource: true}).run(failed));
        assert.equal(dirname(failed.failedReport), tmpPath);
        assert.match(failed.failedReport, /\.failed-report\.json$/);
        assert.equal(JSON.parse(await readFile(failed.failedReport, 'utf8')).summary.status, 'failed');
        assert.throws(() => failed.migrateContext.db, /not initialized/);

        // Without --report, neither a report nor a failed report is written.
        const reports = async () => (await readdir(tmpPath)).filter(name => name.endsWith('.json')).sort();
        const before = await reports();
        const quiet = {errors: [], warnings: []};
        await ghostSource.getTaskRunner({...options, report: false}).run(quiet);
        assert.equal(quiet.reportFile, undefined);
        assert.equal(quiet.summary.imported, 2);
        nock(url)
            .get('/ghost/api/admin/posts/')
            .query(true)
            .reply(500, {errors: [{message: 'Down'}]});
        const quietFailure = {errors: [], warnings: []};
        await assert.rejects(
            ghostSource.getTaskRunner({...options, report: false, rereadSource: true}).run(quietFailure)
        );
        assert.equal(quietFailure.failedReport, undefined);
        assert.deepEqual(await reports(), before);
    } finally {
        nock.cleanAll();
        await rm(tmpPath, {recursive: true, force: true});
    }
});
