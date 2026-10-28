import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/letterdrop.js';
import command from '../commands/letterdrop.js';

const TOKEN = 'test-token';
const SITE = 'https://example.com';

const post = (id, extra = {}) => ({
    id,
    title: `Post ${id}`,
    subtitle: `Subtitle ${id}`,
    body: `<p>Read <a href="${SITE}/c/post-2">the next post</a></p>`,
    author: {name: 'Jane Doe', avatar: `${SITE}/jane.jpg`},
    tags: ['News'],
    coverImage: '',
    slug: `post-${id}`,
    url: `${SITE}/p/post-${id}`,
    metaTitle: `Meta ${id}`,
    metaDescription: '',
    publishedOn: '2023-01-02T03:04:05.000Z',
    updated: '2023-01-03T03:04:05.000Z',
    ...extra
});

/** Serve pages of posts as the Letterdrop posts API, 20 per page, and return the requested offsets. */
function letterdrop(pages) {
    const requests = [];
    nock('https://app.letterdrop.com')
        .persist()
        .post('/api/v1/posts')
        .reply(async request => {
            const form = new URLSearchParams(await request.text());
            requests.push(Number(form.get('offset')));
            if (request.headers.get('api-key') !== TOKEN) {
                return [401, {message: 'Invalid API key'}];
            }
            const page = Number(form.get('offset')) / Number(form.get('limit'));
            return [200, {data: pages[page] ?? [], meta: {hasNextPage: page < pages.length - 1}}];
        });
    return requests;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'letterdrop-cli-'));
    return {
        directory,
        options: {
            apiToken: TOKEN,
            url: SITE,
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

function zipEntries(path) {
    const files = {};
    fsUtils.zip.read(path, (name, entry) => {
        files[name] = /ghost-import(?:-\d+)?\.json$/.test(name) ? JSON.parse(entry.getData().toString()) : true;
    });
    return files;
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('Letterdrop context pipeline', () => {
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
        assert.equal(command.defaults.tmpPath, null);
        assert.equal(command.defaults.outputPath, null);
        assert.equal(command.defaults.info, false);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            letterdrop([[post('1')]]);
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 1);
            nock.cleanAll();
            nock('https://app.letterdrop.com').post('/api/v1/posts').reply(500, {message: 'Server error'});
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
            const first20 = Array.from({length: 20}, (_, index) => post(String(index + 1)));
            const requests = letterdrop([
                first20,
                [
                    // A repeated post keeps its newest version.
                    post('2', {title: 'Post 2 updated', updated: '2024-01-01T00:00:00.000Z'}),
                    post('21', {slug: 'post-1'}),
                    post('invalid', {publishedOn: 'never', updated: null})
                ]
            ]);
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 20, addPrimaryTag: 'Newsletter'});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(requests, [0, 20]);
            assert.deepEqual(first.summary, {selected: 22, imported: 21, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-letterdrop-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            // The repeated post, the skipped post, and post 21 renamed from post-1 to post-1-2.
            assert.equal(report.summary.warnings, 3);
            assert.deepEqual(
                report.events
                    .map(event => event.type)
                    .filter(type => type !== 'post:inserted')
                    .sort(),
                ['record:skipped', 'slug:renamed', 'source:conflict']
            );
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Letterdrop post dates'));
            assert.equal(JSON.stringify(report).includes(TOKEN), false);

            const entries = zipEntries(first.outputFile.path);
            assert.deepEqual(
                Object.keys(entries).filter(name => !name.endsWith('/')),
                ['ghost-import-1.json', 'ghost-import-2.json']
            );
            const posts = [...entries['ghost-import-1.json'].data.posts, ...entries['ghost-import-2.json'].data.posts];
            assert.equal(posts.length, 21);
            assert.equal(posts[1].title, 'Post 2 updated');
            assert.equal(posts[20].slug, 'post-1-2');
            const [firstPost] = posts;
            assert.equal(firstPost.html, '<p>Read <a href="/post-2/">the next post</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2023-01-02T03:04:05.000Z');
            assert.deepEqual(
                entries['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['Newsletter', 'News', '#letterdrop']
            );
            assert.deepEqual(
                entries['ghost-import-1.json'].data.users.map(user => user.email),
                ['jane-doe@example.com']
            );

            // A second run maps the stored records again; the API is no longer reachable.
            nock.cleanAll();
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addPrimaryTag: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.deepEqual(reused.summary, {selected: 22, imported: 21, skipped: 1});
            const result = await imported(reused);
            assert.deepEqual(
                result.posts.map(item => [item.slug, item.id]),
                posts.map(item => [item.slug, item.id])
            );
            assert.deepEqual(
                result.tags.map(tag => tag.name),
                ['Rerun', 'News', '#letterdrop']
            );
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );

            // --rereadSource fetches again and replaces the stored source.
            const reread = letterdrop([[post('5')]]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.deepEqual(reread, [0]);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['post-5']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps each site in its own workspace', async () => {
        const fx = await setup();
        try {
            letterdrop([[post('1')]]);
            const context = {};
            await source
                .getTaskRunner({...fx.options, cacheName: null, zip: false, url: 'https://Example.com/blog/'})
                .run(context);
            assert.equal(context.fileCache.originalName, 'letterdrop-example.com-blog');
            const other = {};
            await source
                .getTaskRunner({...fx.options, cacheName: null, zip: false, url: 'https://example.org'})
                .run(other);
            assert.equal(other.fileCache.originalName, 'letterdrop-example.org');
            assert.notEqual(other.fileCache.cacheDir, context.fileCache.cacheDir);
            assert.match(other.outputName, /^gh-letterdrop-example-\d+\.zip$/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid or the API fails', async () => {
        const fx = await setup();
        try {
            letterdrop([[post('1', {publishedOn: 'never', updated: 'never'})]]);
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected Letterdrop post/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);

            const failed = {};
            const runner = source.getTaskRunner({...fx.options, apiToken: 'wrong-token', rereadSource: true});
            await assert.rejects(runner.run(failed), /page 1: 401 Invalid API key/);
            assert.equal(runner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            const failedReport = JSON.parse(await readFile(failed.failedReport, 'utf8'));
            assert.equal(JSON.stringify(failedReport).includes('wrong-token'), false);
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
            letterdrop([[post('1')]]);
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

    it('downloads assets with Posts, Tags and Authors progress and zips them', async () => {
        const fx = await setup();
        try {
            letterdrop([[post('1', {body: '<p>Text</p><p><img src="https://cdn.letterdrop.example/photo.jpg"></p>'})]]);
            const imageBytes = await readFile(
                new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
            );
            const image = nock('https://cdn.letterdrop.example')
                .get('/photo.jpg')
                .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
            const context = {};
            const runner = source.getTaskRunner({...fx.options, scrape: ['assets']});
            await runner.run(context);
            assert.ok(image.isDone());
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (1/1)', null],
                    ['Tags (2/2)', null],
                    ['Authors (1/1)', null]
                ]
            );
            const entries = zipEntries(context.outputFile.path);
            const [result] = entries['ghost-import.json'].data.posts;
            assert.ok(result.html.includes('__GHOST_URL__/content/images/'));
            assert.ok(Object.keys(entries).some(name => /^content\/images\/.+\.jpe?g$/.test(name)));
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('counts posts with --info', async () => {
        letterdrop([[post('1'), post('2')], [post('3')]]);
        const context = {};
        await source.getTaskRunner({apiToken: TOKEN, url: SITE, info: true, renderer: 'silent'}).run(context);
        assert.deepEqual(context.info, {totals: {posts: 3}});
    });

    it('rejects an invalid --postsPerFile or --url before fetching', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
            await assert.rejects(source.getTaskRunner({...fx.options, url: 'example.com'}).run({}), /--url/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
