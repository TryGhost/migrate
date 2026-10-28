import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source from '../sources/tinynews.js';
import command from '../commands/tinynews.js';

const fixtures = new URL('../../mg-tinynews/src/test/fixtures/', import.meta.url);

const FILES = {
    articles: 'articles.json',
    pages: 'pages.json',
    newsletters: 'newsletters.json',
    authors: 'author-multiple.json'
};

/** An article with one paragraph of `text`. */
const article = (id, values = {}, text = 'Body text.') => ({
    id,
    slug: `article-${id}`,
    live_url: `https://demo-site.example.com/articles/news/article-${id}`,
    translations: [
        {
            published: true,
            first_published_at: '2024-01-01T10:00:00+00:00',
            last_published_at: '2024-01-02T10:00:00+00:00',
            headline: `Article ${id}`,
            content: [{type: 'text', style: 'NORMAL_TEXT', children: [{content: text, style: {}}]}]
        }
    ],
    ...values
});

/** Copy the package's fixtures into `directory/input`, and return their paths by option. */
async function writeFixtures(directory) {
    const input = join(directory, 'input');
    await mkdir(input, {recursive: true});
    const paths = {};
    for (const [option, name] of Object.entries(FILES)) {
        paths[option] = join(input, name);
        await copyFile(new URL(name, fixtures), paths[option]);
    }
    return paths;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'tinynews-cli-'));
    const files = await writeFixtures(directory);
    return {
        directory,
        files,
        options: {
            ...files,
            url: 'https://demo-site.example.com',
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

/** The ZIP's entries: parsed Ghost import files, and the names of everything else. */
function zipContents(path) {
    const imports = {};
    const files = [];
    fsUtils.zip.read(path, (name, entry) => {
        if (/ghost-import(?:-\d+)?\.json$/.test(name)) {
            imports[name.split('/').pop()] = JSON.parse(entry.getData().toString());
        } else if (!entry.isDirectory) {
            files.push(name);
        }
    });
    return {imports, files};
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('Tiny News context pipeline', () => {
    it('registers rereading, chunking, cache naming and report options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.tmpPath, null);
        assert.equal(command.defaults.outputPath, null);
        assert.equal(command.defaults.report, false);
        assert.equal(command.defaults.articles, null);
        assert.equal(command.defaults.url, null);
        assert.deepEqual(command.defaults.scrape, ['all']);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 7);
            assert.equal(context.warningCount, 0);
            await writeFile(fx.files.articles, JSON.stringify([{id: 1}]));
            const failed = {};
            await assert.rejects(
                source
                    .getTaskRunner({...fx.options, pages: null, newsletters: null, report: false, rereadSource: true})
                    .run(failed),
                /Every selected Tiny News item was invalid/
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
        const fx = await setup();
        try {
            // A page without a translation is skipped and reported.
            const pages = JSON.parse(await readFile(fx.files.pages, 'utf8'));
            await writeFile(fx.files.pages, JSON.stringify([...pages, {id: 99, slug: 'broken', translations: []}]));
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 4});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 8, imported: 7, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-tinynews-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Page has no translation'));

            const {imports, files} = zipContents(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            assert.deepEqual(files, []);
            const chunks = [imports['ghost-import-1.json'].data, imports['ghost-import-2.json'].data];
            const posts = chunks.flatMap(data => data.posts);
            assert.deepEqual(
                posts.map(item => [item.slug, item.title, item.type, item.status]),
                [
                    ['all-embeds-and-formatting', 'All embeds and Formatting', 'post', 'published'],
                    ['images', 'Images', 'post', 'published'],
                    ['all-embeds', 'All embeds', 'post', 'published'],
                    ['about', 'About us', 'page', 'published'],
                    ['contact', 'Contact', 'page', 'draft'],
                    ['weekly-roundup-1', 'Weekly roundup #1', 'post', 'published'],
                    ['weekly-roundup-2', 'Weekly roundup #2', 'post', 'published']
                ]
            );
            const roundup = posts.find(item => item.slug === 'weekly-roundup-2');
            assert.equal(roundup.lexical, undefined);
            // The newsletter's link to an article is rewritten to the article's new path.
            assert.equal(
                roundup.html,
                '<!--kg-card-begin: html--><p>Second edition with <a href="/images/">a link</a>.</p><!--kg-card-end: html-->'
            );
            const users = chunks.flatMap(data => data.users);
            assert.deepEqual([...new Set(users.map(user => `${user.slug} ${user.email}`))].sort(), [
                'author author@example.com',
                'dolor-simet dolor@simet.com',
                'editor editor@demo-site.example.com',
                'newsletter newsletter@example.com'
            ]);
            const tags = chunks.flatMap(data => data.tags);
            assert.deepEqual([...new Set(tags.map(tag => tag.slug))].sort(), [
                'community',
                'embeds',
                'hash-newsletter',
                'hash-tinynews',
                'images',
                'test',
                'testing'
            ]);

            // A second run maps the stored records again, even when the export has gone.
            await rm(join(fx.directory, 'input'), {recursive: true});
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 7);
            const result = await imported(reused);
            assert.equal(result.posts.find(item => item.slug === 'weekly-roundup-2').id, roundup.id);
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
            await mkdir(join(fx.directory, 'input'));
            await writeFile(fx.files.articles, JSON.stringify([article(1)]));
            const refreshed = {};
            await source
                .getTaskRunner({
                    ...fx.options,
                    pages: null,
                    newsletters: null,
                    authors: null,
                    zip: false,
                    rereadSource: true
                })
                .run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['article-1']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps different input files in separate workspaces', async () => {
        const fx = await setup();
        try {
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner({...options, pages: null, newsletters: null, authors: null}).run(one);
            const two = {};
            await source.getTaskRunner(options).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'tinynews-articles');
            assert.equal(one.summary.imported, 3);
            assert.equal(two.summary.imported, 7);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected item is invalid', async () => {
        const fx = await setup();
        try {
            await writeFile(fx.files.articles, JSON.stringify([{id: 1, translations: []}]));
            const invalid = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, pages: null, newsletters: null}).run(invalid),
                /Every selected/
            );
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Article has no translation'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('imports an empty export, and rejects a malformed one keeping the stored source', async () => {
        const fx = await setup();
        try {
            await source.getTaskRunner({...fx.options, zip: false}).run({});
            await writeFile(fx.files.articles, '[{"id": 1},');
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(failed),
                /articles\.json: Unexpected end of JSON/
            );
            const kept = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(kept);
            assert.equal(kept.summary.imported, 7);

            await writeFile(fx.files.articles, '[]');
            const empty = {};
            await source
                .getTaskRunner({
                    ...fx.options,
                    pages: null,
                    newsletters: null,
                    authors: null,
                    zip: false,
                    rereadSource: true
                })
                .run(empty);
            assert.deepEqual(empty.summary, {selected: 0, imported: 0, skipped: 0});
            assert.deepEqual((await imported(empty)).posts, []);
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
            assert.match(context.reportFile.path, /^https:/);
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

    it('scrapes published items from the live site, warning when a page cannot be fetched', async () => {
        const fx = await setup();
        const page = `<!DOCTYPE html><html><head>
<meta name="description" content="Scraped description">
<meta property="og:title" content="Scraped OG title">
<meta property="og:description" content="">
<meta property="twitter:title" content="Scraped Twitter title">
</head><body></body></html>`;
        const empty = '<html><head></head><body></body></html>';
        nock.disableNetConnect();
        const web = nock('https://demo-site.example.com')
            .get('/articles/testing/all-embeds-and-formatting')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/articles/community/images')
            .reply(404)
            .get('/articles/community/all-embeds')
            .reply(200, empty, {'Content-Type': 'text/html'})
            .get('/about')
            .reply(200, empty, {'Content-Type': 'text/html'})
            .get('/newsletters/weekly-roundup-1')
            .reply(200, empty, {'Content-Type': 'text/html'})
            .get('/newsletters/weekly-roundup-2')
            .reply(200, empty, {'Content-Type': 'text/html'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['web'], wait_after_scrape: 1});
            await runner.run(context);
            assert.ok(web.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (7/7)', null]]
            );
            // The second page failed to load, which is a warning; the draft page was not fetched.
            assert.equal(context.warningCount, 1);

            const result = await imported(context);
            const post = result.posts.find(item => item.slug === 'all-embeds-and-formatting');
            const meta = result.posts_meta.find(item => item.post_id === post.id);
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped OG title');
            assert.equal(meta.og_description, 'FB desc - An article that shows Google Docs integration elements');
            assert.equal(meta.twitter_title, 'Scraped Twitter title');
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports remote scrape failures but propagates scraper cache and code failures', async () => {
        const fx = await setup();
        try {
            const change = mock.method(WebScraper.prototype, 'scrapeUrl', async () => {
                const error = new Error('optional fetch failure');
                error.errorType = 'ScrapeError';
                throw error;
            });
            try {
                const context = {};
                await source.getTaskRunner({...fx.options, zip: false, scrape: ['web']}).run(context);
                assert.equal(context.summary.imported, 7);
                assert.equal(context.warningCount, 6);
                const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
                assert.ok(
                    report.events.some(
                        event => event.details.url === 'https://demo-site.example.com/newsletters/weekly-roundup-1'
                    )
                );
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

    it('downloads assets with counted sub-tasks', async () => {
        const fx = await setup();
        await writeFile(
            fx.files.articles,
            JSON.stringify([
                article(1, {
                    translations: [
                        {
                            ...article(1).translations[0],
                            content: [
                                {
                                    type: 'image',
                                    children: [{imageUrl: 'https://assets.example.com/photo.jpg', imageAlt: 'A photo'}]
                                }
                            ]
                        }
                    ]
                }),
                article(2)
            ])
        );
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const image = nock('https://assets.example.com')
            .get('/photo.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({
                ...fx.options,
                pages: null,
                newsletters: null,
                authors: null,
                zip: false,
                scrape: ['assets']
            });
            await runner.run(context);
            assert.ok(image.isDone());
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (2/2)', null],
                    ['Tags (1/1)', null],
                    ['Authors (1/1)', null]
                ]
            );
            const photo = (await imported(context)).posts.find(item => item.slug === 'article-1');
            assert.match(photo.html, /src="__GHOST_URL__\/content\/images\/assets-example-com\/photo\.jpg"/);
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('matches authors to Ghost users by email', async () => {
        const fx = await setup();
        nock.disableNetConnect();
        const request = nock('https://destination.example.com')
            .get('/ghost/api/admin/users/')
            .query(true)
            .reply(200, {
                users: [
                    {
                        id: '0123456789abcdef01234567',
                        slug: 'existing',
                        name: 'Existing Person',
                        email: 'dolor@simet.com',
                        roles: [{name: 'Editor'}]
                    }
                ],
                meta: {pagination: {page: 1, pages: 1}}
            });
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
            const data = await imported(context);
            const existing = data.users.find(user => user.id === '0123456789abcdef01234567');
            assert.equal(existing.slug, 'existing');
            assert.deepEqual(existing.roles, ['Editor']);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports optional destination author fetch failures without dropping valid posts', async () => {
        const fx = await setup();
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
            assert.equal(context.summary.imported, 7);
            const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
            assert.ok(report.events.some(event => event.details.operation === 'Ghost author matching'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile, a missing --articles or a missing --url', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
            await assert.rejects(source.getTaskRunner({...fx.options, articles: null}).run({}), /--articles/);
            await assert.rejects(source.getTaskRunner({...fx.options, url: null}).run({}), /--url/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
