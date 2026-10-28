import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/blogger.js';
import command from '../commands/blogger.js';

const KEY = 'test-key';
const BLOG = '12345678';
const OTHER = '87654321';
const SITE = 'http://example.blogspot.com';

const post = (id, extra = {}) => ({
    kind: 'blogger#post',
    id,
    blog: {id: BLOG},
    published: '2020-01-02T03:04:05-05:00',
    updated: '2020-01-03T03:04:05-05:00',
    url: `${SITE}/2020/01/post-${id}.html`,
    title: `Post ${id}`,
    content: `<p>Read <a href="${SITE}/2020/01/post-2.html">the next post</a></p>`,
    author: {id: 'author-1', displayName: 'Jane Doe'},
    labels: ['News'],
    ...extra
});

/** Serve each blog's pages of posts, chained by page tokens, and return the requested blogs and page tokens. */
function blogger(blogs) {
    const requests = [];
    nock('https://www.googleapis.com')
        .persist()
        .get(/^\/blogger\/v3\/blogs\/\d+\/posts$/)
        .query(true)
        .reply(request => {
            const url = new URL(request.url);
            const blog = url.pathname.split('/')[4];
            const page = Number(url.searchParams.get('pageToken') ?? 1);
            requests.push(`${blog}:${page}`);
            if (url.searchParams.get('key') !== KEY) {
                return [400, {error: {code: 400, message: 'API key not valid'}}];
            }
            const pages = blogs[blog] ?? [[]];
            const body = {kind: 'blogger#postList', items: pages[page - 1]};
            if (page < pages.length) {
                body.nextPageToken = String(page + 1);
            }
            return [200, body];
        });
    return requests;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'blogger-cli-'));
    return {
        directory,
        options: {
            apiKey: KEY,
            blogID: [BLOG],
            tmpPath: directory,
            outputPath: directory,
            cacheName: 'test',
            scrape: ['none'],
            report: true,
            requestDelay: 0,
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

describe('Blogger context pipeline', () => {
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
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            blogger({[BLOG]: [[post('1')]]});
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 1);
            nock.cleanAll();
            nock('https://www.googleapis.com')
                .get(/.*/)
                .query(true)
                .reply(500, {error: {code: 500, message: 'Backend Error'}});
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
            const requests = blogger({
                [BLOG]: [
                    [post('1'), post('2')],
                    [post('3'), post('invalid', {published: 'never', updated: null})]
                ],
                [OTHER]: [[post('4', {blog: {id: OTHER}, url: 'http://other.blogspot.com/2020/01/post-1.html'})]]
            });
            const first = {};
            const runner = source.getTaskRunner({...fx.options, blogID: [BLOG, OTHER], postsPerFile: 2});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(requests, [`${BLOG}:1`, `${BLOG}:2`, `${OTHER}:1`]);
            assert.deepEqual(first.summary, {selected: 5, imported: 4, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-blogger-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            // The skipped post, and the second blog's post-1 renamed to post-1-2.
            assert.equal(report.summary.warnings, 2);
            assert.deepEqual(
                report.events
                    .map(event => event.type)
                    .filter(type => type !== 'post:inserted')
                    .sort(),
                ['record:skipped', 'slug:renamed']
            );
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Blogger post dates'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const posts = [...imports['ghost-import-1.json'].data.posts, ...imports['ghost-import-2.json'].data.posts];
            assert.deepEqual(
                posts.map(item => item.slug),
                ['post-1', 'post-2', 'post-3', 'post-1-2']
            );
            const [firstPost] = posts;
            assert.equal(firstPost.html, '<p>Read <a href="/post-2/">the next post</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2020-01-02T08:04:05.000Z');
            assert.deepEqual(
                imports['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['News', '#blogger-site-12345678', '#blogger']
            );
            assert.deepEqual(
                imports['ghost-import-1.json'].data.users.map(user => user.email),
                ['jane-doe@example.com']
            );

            // A second run maps the stored records again; the API is no longer reachable.
            nock.cleanAll();
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, blogID: [OTHER], addTag: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.deepEqual(reused.summary, {selected: 1, imported: 1, skipped: 0});
            const result = await imported(reused);
            assert.deepEqual(
                result.posts.map(item => [item.slug, item.id]),
                [['post-1', posts[3].id]]
            );
            assert.ok(result.tags.some(tag => tag.name === 'Rerun'));
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );

            // A blog that was not fetched needs --rereadSource.
            const missing = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, blogID: [BLOG, '999']}).run(missing),
                /does not include blog 999\. Fetch it again with --rereadSource/
            );
            closed(missing);

            // --rereadSource fetches again and replaces the stored source.
            const reread = blogger({[BLOG]: [[post('5')]], 999: [[post('6', {blog: {id: '999'}})]]});
            const refreshed = {};
            await source
                .getTaskRunner({...fx.options, zip: false, blogID: [BLOG, '999'], rereadSource: true})
                .run(refreshed);
            assert.deepEqual(reread, [`${BLOG}:1`, '999:1']);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['post-5', 'post-6']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps each set of blogs in its own workspace', async () => {
        const fx = await setup();
        try {
            blogger({[BLOG]: [[post('1')]], [OTHER]: [[]]});
            const context = {};
            await source
                .getTaskRunner({...fx.options, cacheName: null, zip: false, blogID: [BLOG, '', OTHER]})
                .run(context);
            assert.equal(context.fileCache.originalName, `blogger-${BLOG}-${OTHER}`);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid or the API fails', async () => {
        const fx = await setup();
        try {
            blogger({[BLOG]: [[post('1', {published: 'never', updated: 'never'})]]});
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected Blogger post/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);

            const failed = {};
            const runner = source.getTaskRunner({...fx.options, apiKey: 'wrong', rereadSource: true});
            await assert.rejects(runner.run(failed), /400 API key not valid/);
            assert.equal(runner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            const failedReport = JSON.parse(await readFile(failed.failedReport, 'utf8'));
            assert.equal(JSON.stringify(failedReport).includes('wrong'), false);
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
            blogger({[BLOG]: [[post('1')]]});
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

    it('scrapes post metadata from the original post URL', async () => {
        const fx = await setup();
        try {
            blogger({[BLOG]: [[post('1'), post('2', {url: undefined})]]});
            const page = nock(SITE)
                .get('/2020/01/post-1.html')
                .reply(
                    200,
                    '<html><head><title>Scraped title</title><meta name="description" content="Scraped description"><meta property="og:image" content="https://example.com/og.jpg"></head><body></body></html>'
                );
            const context = {};
            const runner = source.getTaskRunner({
                ...fx.options,
                zip: false,
                scrape: ['web'],
                featureImage: 'og:image'
            });
            await runner.run(context);
            assert.ok(page.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (2/2)', null]]
            );
            const result = await imported(context);
            const meta = result.posts_meta.find(row => row.post_id === result.posts[0].id);
            assert.equal(meta.meta_title, 'Scraped title');
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(result.posts[0].feature_image, 'https://example.com/og.jpg');
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('records failed scrapes as warnings', async () => {
        const fx = await setup();
        try {
            blogger({[BLOG]: [[post('1')]]});
            nock(SITE).get('/2020/01/post-1.html').replyWithError('connection reset');
            const context = {};
            await source.getTaskRunner({...fx.options, zip: false, scrape: ['web']}).run(context);
            const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
            assert.ok(report.events.some(event => event.details.operation === 'Web scraping'));
            assert.equal(report.summary.warnings, 1);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('downloads assets with Posts, Tags and Authors progress', async () => {
        const fx = await setup();
        try {
            blogger({
                [BLOG]: [
                    [
                        post('1', {
                            content: '<p>Text</p><p><img src="https://1.bp.blogspot.com/-abc/s320/photo.jpg"></p>'
                        })
                    ]
                ]
            });
            const imageBytes = await readFile(
                new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
            );
            const image = nock('https://1.bp.blogspot.com')
                .get('/-abc/s2000/photo.jpg')
                .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['assets']});
            await runner.run(context);
            assert.ok(image.isDone());
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (1/1)', null],
                    ['Tags (3/3)', null],
                    ['Authors (1/1)', null]
                ]
            );
            const [result] = (await imported(context)).posts;
            assert.ok(result.html.includes('__GHOST_URL__/content/images/'));
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile or a missing --blogID before fetching', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
            await assert.rejects(source.getTaskRunner({...fx.options, blogID: ['']}).run({}), /at least one --blogID/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
