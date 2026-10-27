import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source from '../sources/beehiiv.js';
import command from '../commands/beehiiv.js';

const SITE = 'https://example.beehiiv.com';
const COLUMNS = [
    'id',
    'web_title',
    'status',
    'audience',
    'content_tags',
    'url',
    'content_html',
    'thumbnail_url',
    'created_at'
];

const row = (id, values = {}) => ({
    id,
    web_title: `Title ${id}`,
    status: 'confirmed',
    audience: 'free',
    content_tags: 'News',
    url: `${SITE}/p/${id}`,
    content_html: `<table><tr id="content-blocks"><td><p><a href="${SITE}/p/second">Next</a></p></td></tr></table>`,
    thumbnail_url: '',
    created_at: '2024-01-01 00:00:00',
    ...values
});

/** Write a beehiiv posts CSV of `rows`. */
async function writeCsv(path, rows) {
    const quote = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    await mkdir(dirname(path), {recursive: true});
    await writeFile(
        path,
        `${[COLUMNS.join(','), ...rows.map(item => COLUMNS.map(column => quote(item[column])).join(','))].join('\n')}\n`
    );
}

async function setup(rows = [row('first'), row('second')]) {
    const directory = await mkdtemp(join(tmpdir(), 'beehiiv-cli-'));
    const posts = join(directory, 'input', 'posts.csv');
    await writeCsv(posts, rows);
    return {
        directory,
        posts,
        options: {
            posts,
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

describe('beehiiv CSV context pipeline', () => {
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
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 2);
            assert.equal(context.warningCount, 0);
            await writeCsv(fx.posts, [row('third', {created_at: 'never'})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected beehiiv post was invalid/
            );
            assert.equal(failed.failedReport, undefined);
            assert.deepEqual(
                (await readdir(fx.directory)).filter(name => name.endsWith('.json')),
                []
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes linked HTML chunks, a report and a ZIP, then remaps stored records without reading', async () => {
        const fx = await setup([row('first'), row('second'), row('bad', {created_at: 'never'})]);
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 1});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-beehiiv-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Invalid beehiiv post date'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const [firstPost] = imports['ghost-import-1.json'].data.posts;
            assert.equal(firstPost.slug, 'first');
            assert.equal(firstPost.html, '<p><a href="/second/">Next</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2024-01-01T00:00:00.000Z');
            assert.deepEqual(
                imports['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['News', '#beehiiv', '#beehiiv-visibility-free']
            );

            // A second run maps the stored records again, even when the CSV has gone.
            await rm(fx.posts);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, defaultAuthorName: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 2);
            const result = await imported(reused);
            assert.equal(result.posts[0].id, firstPost.id);
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );
            assert.ok(reused.reportFile.path.startsWith(reused.fileCache.cacheDir));

            // --rereadSource reads the CSV again and replaces the stored source.
            const missing = {};
            const missingRunner = source.getTaskRunner({...fx.options, zip: false, rereadSource: true});
            await assert.rejects(missingRunner.run(missing), /ENOENT/);
            assert.equal(missingRunner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(missing.failedReport)).size > 0);
            closed(missing);
            await writeCsv(fx.posts, [row('fourth', {status: 'draft'})]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            const rereadData = await imported(refreshed);
            assert.deepEqual(
                rereadData.posts.map(post => [post.slug, post.status]),
                [['fourth', 'draft']]
            );
            assert.deepEqual(
                rereadData.users.map(user => user.name),
                ['Author']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps CSVs that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherCsv = join(fx.directory, 'other', 'posts.csv');
            await writeCsv(otherCsv, [row('other')]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, posts: otherCsv}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'beehiiv-posts');
            assert.deepEqual(
                (await imported(two)).posts.map(post => post.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid', async () => {
        const fx = await setup([row('first', {id: ''})]);
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Row has no id'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats an empty CSV as a valid import', async () => {
        const fx = await setup([]);
        try {
            const context = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(context);
            assert.equal(context.summary.selected, 0);
            assert.equal((await imported(context)).posts.length, 0);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
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

    it('rejects storage adapters that resolve without consuming their readable body', async () => {
        const fx = await setup();
        try {
            const context = {};
            await assert.rejects(
                source
                    .getTaskRunner({...fx.options, outputStorage: {upload: async () => 'ignored-stream'}})
                    .run(context),
                /consume the readable body/
            );
            assert.ok((await stat(context.recoveryFile)).size > 0);
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('scrapes published posts for metadata and authors, and downloads assets', async () => {
        const remix = {
            state: {loaderData: {'routes/p/$slug': {post: {authors: [{name: 'Jane Doe'}, {name: 'Joe Bloggs'}]}}}}
        };
        const page = `<html><head><meta name="description" content="Scraped description"><meta property="og:title" content="Scraped OG title"></head><body><script>window.__remixContext = ${JSON.stringify(remix)};</script></body></html>`;
        const fx = await setup([
            row('first', {thumbnail_url: 'uploads/asset/file/1/image.jpg'}),
            row('plain'),
            row('draft', {status: 'draft'}),
            row('unlisted', {url: ''})
        ]);
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const web = nock(SITE)
            .get('/p/first')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/p/plain')
            .reply(200, '<html><head></head><body></body></html>', {'Content-Type': 'text/html'});
        const image = nock('https://media.beehiiv.com')
            .get('/cdn-cgi/image/quality=100/uploads/asset/file/1/image.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({
                ...fx.options,
                zip: false,
                scrape: ['all'],
                wait_after_scrape: 1,
                defaultAuthorName: 'Staff Writer'
            });
            await runner.run(context);
            assert.ok(web.isDone());
            assert.ok(image.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (4/4)', null]]
            );
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (4/4)', null],
                    ['Tags (3/3)', null],
                    ['Authors (3/3)', null]
                ]
            );

            const result = await imported(context);
            const authorsOf = slug => {
                const post = result.posts.find(item => item.slug === slug);
                return result.posts_authors
                    .filter(row => row.post_id === post.id)
                    .map(row => result.users.find(user => user.id === row.author_id).name);
            };
            const post = result.posts.find(item => item.slug === 'first');
            assert.equal(
                post.feature_image,
                '__GHOST_URL__/content/images/media-beehiiv-com/cdn-cgi/image/quality-100/uploads/asset/file/1/image.jpg'
            );
            const meta = result.posts_meta.find(item => item.post_id === post.id);
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped OG title');
            assert.deepEqual(authorsOf('first'), ['Jane Doe', 'Joe Bloggs']);
            // A page without authors gets the default author; drafts have it from mapping.
            assert.deepEqual(authorsOf('plain'), ['Staff Writer']);
            assert.deepEqual(authorsOf('draft'), ['Staff Writer']);
            // A post without a URL is not scraped.
            assert.deepEqual(authorsOf('title-unlisted'), []);
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports remote scrape failures but propagates scraper cache and code failures', async () => {
        const fx = await setup([row('first')]);
        try {
            const change = mock.method(WebScraper.prototype, 'scrapeUrl', async () => {
                const error = new Error('optional fetch failure');
                error.errorType = 'ScrapeError';
                throw error;
            });
            try {
                const context = {};
                await source.getTaskRunner({...fx.options, zip: false, scrape: ['web']}).run(context);
                assert.equal(context.summary.imported, 1);
                assert.equal(context.warningCount, 1);
                const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
                assert.ok(report.events.some(event => event.details.url === `${SITE}/p/first`));
            } finally {
                change.mock.restore();
            }
            const broken = mock.method(WebScraper.prototype, 'scrapeUrl', async () => {
                throw new Error('cache write failed');
            });
            try {
                const context = {};
                await assert.rejects(
                    source.getTaskRunner({...fx.options, zip: false, scrape: ['web']}).run(context),
                    /cache write failed/
                );
                closed(context);
                assert.equal(context.outputFile, undefined);
            } finally {
                broken.mock.restore();
            }
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports optional destination author fetch failures without dropping valid posts', async () => {
        const fx = await setup([row('first', {status: 'draft'})]);
        nock.disableNetConnect();
        const request = nock('https://destination.example.com')
            .get('/ghost/api/admin/users/')
            .query(true)
            .reply(401, {errors: [{message: 'Unauthorized'}]});
        try {
            const context = {};
            await source
                .getTaskRunner({
                    ...fx.options,
                    zip: false,
                    ghostApiUrl: 'https://destination.example.com',
                    ghostAdminKey:
                        '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
                })
                .run(context);
            assert.ok(request.isDone());
            assert.equal(context.summary.imported, 1);
            assert.deepEqual(
                (await imported(context)).users.map(user => user.email),
                ['author@example.com']
            );
            const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
            assert.ok(report.events.some(event => event.details.operation === 'Ghost author matching'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile before reading', async () => {
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
