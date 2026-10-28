import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source from '../sources/squarespace.js';
import command from '../commands/squarespace.js';

const SITE = 'https://www.example.com';
const IMAGE = 'https://images.squarespace-cdn.com/content/v1/abc/photo.jpg';

const post = (id, values = {}) => ({
    id,
    title: `Title ${id}`,
    link: `/blog/${id}`,
    status: 'publish',
    type: 'post',
    creator: 'jdoe',
    date: 'Thu, 20 Feb 2025 20:49:53 +0000',
    html: `<p><a href="${SITE}/blog/second">Next</a></p>`,
    categories: '<category domain="category" nicename="news"><![CDATA[News]]></category>',
    ...values
});

const attachment = (id, url) =>
    `<item><title>image</title><link>${url}</link><wp:post_id>${id}</wp:post_id>` +
    `<wp:post_type>attachment</wp:post_type><wp:status>inherit</wp:status><wp:attachment_url>${url}</wp:attachment_url></item>`;

const itemXml = item =>
    typeof item === 'string'
        ? item
        : `<item><title>${item.title}</title><link>${item.link}</link><pubDate>${item.date}</pubDate>` +
          `<dc:creator>${item.creator}</dc:creator><content:encoded><![CDATA[${item.html}]]></content:encoded>` +
          `<wp:post_id>${item.id}</wp:post_id><wp:status>${item.status}</wp:status>` +
          `<wp:post_type>${item.type}</wp:post_type>${item.categories}</item>`;

/** Write a Squarespace WordPress-style export of `items` (post objects or raw XML). */
async function writeExport(path, items) {
    await mkdir(dirname(path), {recursive: true});
    await writeFile(
        path,
        `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:wp="http://wordpress.org/export/1.2/">
<channel><title>Example</title><link>${SITE}</link>
<wp:author><wp:author_id>1</wp:author_id><wp:author_login>jdoe</wp:author_login><wp:author_email>jane@example.com</wp:author_email><wp:author_display_name><![CDATA[Jane Doe]]></wp:author_display_name></wp:author>
${items.map(itemXml).join('\n')}
</channel></rss>`
    );
}

async function setup(items = [post('first'), post('second')]) {
    const directory = await mkdtemp(join(tmpdir(), 'squarespace-cli-'));
    const pathToFile = join(directory, 'input', 'export.xml');
    await writeExport(pathToFile, items);
    return {
        directory,
        pathToFile,
        options: {
            pathToFile,
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

/** Every file in a ZIP, with JSON files parsed. */
function zipEntries(path) {
    const files = {};
    fsUtils.zip.read(path, (name, entry) => {
        if (!entry.isDirectory) {
            files[name] = name.endsWith('.json') ? JSON.parse(entry.getData().toString()) : entry.getData();
        }
    });
    return files;
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('Squarespace context pipeline', () => {
    it('registers rereading, chunking, cache naming, report and selector options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.report, false);
        assert.equal(command.defaults.removeSelectors, null);
        assert.equal(command.defaults.pages, false);
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
            await writeExport(fx.pathToFile, [post('third', {date: 'never'})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Squarespace item was invalid/
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
        const fx = await setup([
            post('first', {html: `<p><a href="${SITE}/blog/second">Next</a></p><div class="ad">Ad</div>`}),
            post('second'),
            post('bad', {date: 'never'})
        ]);
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 1, removeSelectors: '.ad'});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-squarespace-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Squarespace publication date'));

            const entries = zipEntries(first.outputFile.path);
            assert.deepEqual(Object.keys(entries).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const [firstPost] = entries['ghost-import-1.json'].data.posts;
            assert.equal(firstPost.slug, 'first');
            assert.equal(firstPost.html, '<p><a href="/second/">Next</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2025-02-20T20:49:53.000Z');
            assert.deepEqual(
                entries['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['News', '#sqs']
            );
            assert.deepEqual(
                entries['ghost-import-1.json'].data.users.map(user => [user.name, user.email]),
                [['Jane Doe', 'jane@example.com']]
            );

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToFile);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, pages: true});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 2);
            const result = await imported(reused);
            assert.equal(result.posts[0].id, firstPost.id);
            assert.equal(result.posts[0].html, '<p><a href="/second/">Next</a></p><div class="ad">Ad</div>');
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );
            assert.ok(reused.reportFile.path.startsWith(reused.fileCache.cacheDir));

            // --rereadSource reads the export again and replaces the stored source.
            const missing = {};
            const missingRunner = source.getTaskRunner({...fx.options, zip: false, rereadSource: true});
            await assert.rejects(missingRunner.run(missing), /ENOENT/);
            assert.equal(missingRunner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(missing.failedReport)).size > 0);
            closed(missing);
            await writeExport(fx.pathToFile, [post('fourth', {status: 'draft'})]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            const rereadData = await imported(refreshed);
            assert.deepEqual(
                rereadData.posts.map(item => [item.slug, item.status]),
                [['fourth', 'draft']]
            );
            assert.deepEqual(
                rereadData.users.map(user => user.name),
                ['Jane Doe']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherFile = join(fx.directory, 'other', 'export.xml');
            await writeExport(otherFile, [post('other')]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, pathToFile: otherFile}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'squarespace-export');
            assert.deepEqual(
                (await imported(two)).posts.map(item => item.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected item is invalid', async () => {
        const fx = await setup([post('first', {date: 'never'})]);
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Squarespace publication date'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats an export without posts as a valid import', async () => {
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

    it('scrapes published posts for metadata and downloads assets', async () => {
        const page = `<html><head><meta name="description" content="Scraped description"><meta property="og:title" content="Scraped OG title"></head><body></body></html>`;
        const fx = await setup([
            post('first'),
            attachment('1', IMAGE),
            post('plain'),
            post('draft', {status: 'draft'}),
            post('unlisted', {link: ''})
        ]);
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const web = nock(SITE)
            .get('/blog/first')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/blog/plain')
            .reply(200, '<html><head></head><body></body></html>', {'Content-Type': 'text/html'});
        const image = nock('https://images.squarespace-cdn.com')
            .get('/content/v1/abc/photo.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['all'], wait_after_scrape: 1});
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
                    ['Tags (2/2)', null],
                    ['Authors (1/1)', null]
                ]
            );

            const result = await imported(context);
            const first = result.posts.find(item => item.slug === 'first');
            assert.match(first.feature_image, /^__GHOST_URL__\/content\/images\/.*photo\.jpg$/);
            const meta = result.posts_meta.find(item => item.post_id === first.id);
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped OG title');
            // A post without a URL is imported but not scraped.
            assert.ok(result.posts.some(item => item.slug === 'untitled'));
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports remote scrape failures but propagates scraper cache and code failures', async () => {
        const fx = await setup([post('first')]);
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
                assert.ok(report.events.some(event => event.details.url === `${SITE}/blog/first`));
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
        const fx = await setup([post('first', {status: 'draft'})]);
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
                ['jane@example.com']
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
