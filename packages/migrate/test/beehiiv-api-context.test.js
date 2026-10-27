import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/beehiiv-api.js';
import command from '../commands/beehiiv-api.js';

const PUB = 'pub_00000000-0000-0000-0000-000000000001';
const KEY = 'test-key';
const SITE = 'https://example.beehiiv.com';

const post = (id, extra = {}) => ({
    id,
    title: `Title ${id}`,
    subtitle: null,
    slug: id,
    web_url: `${SITE}/p/${id}`,
    status: 'confirmed',
    platform: 'both',
    publish_date: 1704067200,
    created: 1704067200,
    thumbnail_url: '',
    authors: ['Jane Doe'],
    content_tags: ['News'],
    web_targets: [{tier: 'free'}],
    content: {premium: {web: `<div id="content-blocks"><p><a href="${SITE}/p/post-2">Next</a></p></div>`}},
    ...extra
});

/** Serve `posts` from the beehiiv posts endpoint, requiring the API key; returns the requested query strings. */
function beehiiv(posts) {
    const requests = [];
    nock('https://api.beehiiv.com', {reqheaders: {authorization: `Bearer ${KEY}`}})
        .persist()
        .get(`/v2/publications/${PUB}/posts`)
        .query(true)
        .reply(request => {
            const url = new URL(request.url);
            requests.push(url.search);
            const limit = Number(url.searchParams.get('limit'));
            const page = Number(url.searchParams.get('page') ?? 1);
            return [200, {data: posts.slice((page - 1) * limit, page * limit), total_results: posts.length}];
        });
    return requests;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'beehiiv-api-cli-'));
    return {
        directory,
        options: {
            key: KEY,
            id: PUB,
            tmpPath: directory,
            outputPath: directory,
            cacheName: 'test',
            scrape: ['none'],
            report: true,
            renderer: 'silent'
        }
    };
}

function closed(context) {
    assert.throws(() => context.migrateContext.db, /not initialized/);
}

function zipImports(path) {
    const files = {};
    fsUtils.zip.read(path, (name, entry) => {
        if (/ghost-import(?:-\d+)?\.json$/.test(name)) {
            files[name.split('/').pop()] = JSON.parse(entry.getData().toString());
        }
    });
    return files;
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('beehiiv API context pipeline', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('registers rereading, chunking, cache naming and report options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.report, false);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            beehiiv([post('post-1')]);
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 1);
            nock.cleanAll();
            nock('https://api.beehiiv.com')
                .get(/.*/)
                .reply(500, {errors: [{message: 'Server down'}]});
            const failed = {};
            await assert.rejects(source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed));
            assert.equal(failed.failedReport, undefined);
            assert.deepEqual(
                (await readdir(fx.directory)).filter(name => name.endsWith('.json')),
                []
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes linked HTML chunks, a report and a ZIP, then remaps stored records without fetching', async () => {
        const fx = await setup();
        try {
            const posts = Array.from({length: 11}, (_, index) => post(`post-${index + 1}`));
            posts.push(post('undated', {publish_date: null, created: null}));
            const requests = beehiiv(posts);
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 10});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 12, imported: 11, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-beehiiv-api-test-\d+\.zip$/);
            assert.deepEqual(requests, [
                '?limit=1',
                '?limit=10&expand=free_web_content&expand=premium_web_content&page=1',
                '?limit=10&expand=free_web_content&expand=premium_web_content&page=2'
            ]);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Invalid beehiiv post dates'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const [firstPost] = imports['ghost-import-1.json'].data.posts;
            assert.equal(firstPost.slug, 'post-1');
            assert.equal(firstPost.html, '<p><a href="/post-2/">Next</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2024-01-01T00:00:00.000Z');
            assert.deepEqual(
                imports['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['News', '#beehiiv']
            );
            assert.deepEqual(
                imports['ghost-import-1.json'].data.users.map(user => user.email),
                ['jane-doe@example.com']
            );

            // A second run maps the stored records again; the API is no longer reachable.
            nock.cleanAll();
            const reused = {};
            const reusedRunner = source.getTaskRunner({
                ...fx.options,
                zip: false,
                addTag: 'Rerun',
                postsAfter: '2025-01-01'
            });
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.deepEqual(reused.summary, {selected: 0, imported: 0, skipped: 0});
            const reusedAll = {};
            await source.getTaskRunner({...fx.options, zip: false, addTag: 'Rerun'}).run(reusedAll);
            const result = await imported(reusedAll);
            assert.equal(result.posts[0].id, firstPost.id);
            assert.ok(result.tags.some(tag => tag.name === 'Rerun'));
            assert.equal(
                (await readdir(reusedAll.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );

            // --rereadSource fetches again and replaces the stored source.
            beehiiv([post('post-12')]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['post-12']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps publications in separate workspaces', async () => {
        const fx = await setup();
        try {
            beehiiv([post('post-1')]);
            const context = {};
            await source.getTaskRunner({...fx.options, cacheName: null, zip: false}).run(context);
            assert.equal(context.fileCache.originalName, `beehiiv-api-${PUB}`);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid or the API fails', async () => {
        const fx = await setup();
        try {
            beehiiv([post('post-1', {publish_date: null, created: null})]);
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected beehiiv post/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);

            nock.cleanAll();
            nock('https://api.beehiiv.com')
                .get(/.*/)
                .reply(500, {errors: [{message: 'Server down'}]});
            const failed = {};
            const runner = source.getTaskRunner({...fx.options, rereadSource: true});
            await assert.rejects(runner.run(failed), /Request failed: 500/);
            assert.equal(runner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(failed.failedReport)).size > 0);
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
            beehiiv([post('post-1')]);
            const context = {};
            await source
                .getTaskRunner({
                    ...fx.options,
                    cache: false,
                    outputStorage: {
                        async upload({body, fileName, size}) {
                            assert.ok(body instanceof Readable);
                            let consumed = 0;
                            for await (const chunk of body) {
                                consumed += chunk.length;
                            }
                            assert.equal(consumed, size);
                            uploaded.push(fileName);
                            return `https://storage.example/${fileName}`;
                        }
                    }
                })
                .run(context);
            assert.deepEqual(uploaded, [context.outputName, context.outputName.replace(/\.zip$/, '.report.json')]);
            assert.match(context.outputFile.path, /^https:/);
            await assert.rejects(stat(context.fileCache.cacheDir), /ENOENT/);
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('downloads assets with Posts, Tags and Authors progress', async () => {
        const fx = await setup();
        try {
            beehiiv([
                post('post-1', {
                    thumbnail_url: 'https://media.beehiiv.com/uploads/asset/file/1/thumb.jpg',
                    content: {
                        premium: {
                            web: '<div id="content-blocks"><p>Text</p><div><img src="https://media.beehiiv.com/uploads/asset/file/2/body.jpg"></div></div>'
                        }
                    }
                })
            ]);
            const imageBytes = await readFile(
                new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
            );
            const images = nock('https://media.beehiiv.com')
                .get('/uploads/asset/file/1/thumb.jpg')
                .reply(200, imageBytes, {'Content-Type': 'image/jpeg'})
                .get('/uploads/asset/file/2/body.jpg')
                .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['assets']});
            await runner.run(context);
            assert.ok(images.isDone());
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (1/1)', null],
                    ['Tags (2/2)', null],
                    ['Authors (1/1)', null]
                ]
            );
            const [result] = (await imported(context)).posts;
            assert.match(result.feature_image, /^__GHOST_URL__\/content\/images\//);
            assert.ok(result.html.includes('__GHOST_URL__/content/images/'));
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile before fetching', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
