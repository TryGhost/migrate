import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source from '../sources/jekyll.js';
import command from '../commands/jekyll.js';

const fixture = name => readFile(new URL(`../../mg-jekyll-export/src/test/fixtures/${name}`, import.meta.url), 'utf8');

const post = (attributes, body = 'Body text.') =>
    `---\n${Object.entries(attributes)
        .map(([key, value]) => `${key}: ${value}`)
        .join('\n')}\n---\n${body}\n`;

// The linking post points at the relative-links post, so its link is rewritten to the new path.
const site = {
    '_posts/2021-08-23-basic-post.md': await fixture('2021-08-23-basic-post.md'),
    '_posts/2021-08-25-relative-links.md': await fixture('2021-08-25-relative-links.md'),
    '_posts/2023-01-15-linking.md': post(
        {title: 'Linking', date: '2023-01-15 10:30:00 +0100', author: 'Persons Name'},
        'See [the other post](/relative-links) and [elsewhere](https://elsewhere.example/page).'
    ),
    '_drafts/a-draft.md': post({title: 'A draft'}),
    '_config.yml': 'title: Example'
};

/** Write a Jekyll site zip holding `files` (path → contents). */
async function writeExport(path, files = site) {
    const content = await mkdtemp(join(tmpdir(), 'jekyll-export-'));
    try {
        for (const [name, contents] of Object.entries(files)) {
            await mkdir(dirname(join(content, name)), {recursive: true});
            await writeFile(join(content, name), contents);
        }
        await mkdir(dirname(path), {recursive: true});
        await rm(path, {force: true});
        await fsUtils.zip.write(dirname(path), content, path.split('/').pop());
    } finally {
        await rm(content, {recursive: true, force: true});
    }
}

async function setup(files = site) {
    const directory = await mkdtemp(join(tmpdir(), 'jekyll-cli-'));
    const pathToZip = join(directory, 'input', 'site.zip');
    await writeExport(pathToZip, files);
    return {
        directory,
        pathToZip,
        options: {
            pathToZip,
            url: 'https://example.com',
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

describe('Jekyll context pipeline', () => {
    it('registers rereading, chunking, cache naming and report options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.tmpPath, null);
        assert.equal(command.defaults.outputPath, null);
        assert.equal(command.defaults.report, false);
        assert.equal(command.defaults.url, null);
        assert.equal(command.defaults.datedPermalinks, 'none');
        assert.deepEqual(command.defaults.scrape, ['all']);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 4);
            assert.equal(context.warningCount, 0);
            await writeExport(fx.pathToZip, {'_posts/undated.md': post({title: 'Undated'})});
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Jekyll post was invalid/
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
        const fx = await setup({...site, '_posts/undated.md': post({title: 'Undated'})});
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 2, addTags: 'News'});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 5, imported: 4, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-jekyll-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(
                report.events.some(event => event.details.reason === 'No valid date in the front matter or file name')
            );

            const {imports, files} = zipContents(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            assert.deepEqual(files, []);
            const posts = [...imports['ghost-import-1.json'].data.posts, ...imports['ghost-import-2.json'].data.posts];
            assert.deepEqual(posts.map(item => [item.slug, item.title, item.status, item.published_at]).sort(), [
                ['a-draft', 'A draft', 'draft', posts.find(item => item.slug === 'a-draft').published_at],
                ['basic-post', 'This is a Basic Post', 'published', '2021-08-23T00:00:00.000Z'],
                ['linking', 'Linking', 'published', '2023-01-15T09:30:00.000Z'],
                ['relative-links', 'This has relative links', 'published', '2021-08-25T00:00:00.000Z']
            ]);
            const linking = posts.find(item => item.slug === 'linking');
            assert.equal(linking.lexical, undefined);
            assert.equal(
                linking.html,
                '<p>See <a href="/relative-links/">the other post</a> and <a href="https://elsewhere.example/page">elsewhere</a>.</p>'
            );
            assert.ok(
                posts
                    .find(item => item.slug === 'relative-links')
                    .html.includes('<img src="https://example.com/images/photo.jpg" alt="A nice photo">')
            );
            const data = imports['ghost-import-1.json'].data;
            const users = [...data.users, ...imports['ghost-import-2.json'].data.users];
            assert.deepEqual([...new Set(users.map(user => `${user.slug} ${user.email}`))].sort(), [
                'exampleuser exampleuser@example.com',
                'persons-name persons-name@example.com'
            ]);
            const tags = [...data.tags, ...imports['ghost-import-2.json'].data.tags];
            assert.deepEqual([...new Set(tags.map(tag => tag.slug))].sort(), ['hash-jekyll', 'news']);

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToZip);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addTags: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 4);
            const result = await imported(reused);
            assert.equal(result.posts.find(item => item.slug === 'linking').id, linking.id);
            assert.ok(result.tags.some(tag => tag.name === 'Rerun'));
            assert.equal(
                result.tags.some(tag => tag.name === 'News'),
                false
            );
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
            await writeExport(fx.pathToZip, {'_posts/2024-01-01-fresh.md': post({title: 'Fresh'})});
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['fresh']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reads a site directory and keeps dated permalinks in rewritten links', async () => {
        const fx = await setup();
        try {
            const folder = join(fx.directory, 'folder');
            for (const [name, contents] of Object.entries({
                '_posts/2021-08-25-target.md': post({title: 'Target'}),
                '_posts/2021-08-26-linking.md': post(
                    {title: 'Linking'},
                    '[Dated](https://example.com/2021/08/25/target) [Undated](https://example.com/target)'
                )
            })) {
                await mkdir(dirname(join(folder, name)), {recursive: true});
                await writeFile(join(folder, name), contents);
            }
            const context = {};
            await source
                .getTaskRunner({...fx.options, pathToZip: folder, zip: false, datedPermalinks: '/yyyy/mm/dd/'})
                .run(context);
            assert.equal(context.summary.imported, 2);
            const linking = (await imported(context)).posts.find(item => item.slug === 'linking');
            assert.equal(
                linking.html,
                '<p><a href="/2021/08/25/target/">Dated</a> <a href="https://example.com/target">Undated</a></p>'
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherZip = join(fx.directory, 'other', 'site.zip');
            await writeExport(otherZip, {'_posts/2021-01-01-other.md': post({title: 'Other'})});
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, pathToZip: otherZip}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'jekyll-site');
            assert.deepEqual(
                (await imported(two)).posts.map(item => item.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid', async () => {
        const fx = await setup({'_posts/2021-01-01-bad.md': '---\ntitle: [unclosed\n---\nBody'});
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason?.startsWith('Invalid front matter')));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an export without posts, keeping the stored source', async () => {
        const fx = await setup();
        try {
            await source.getTaskRunner({...fx.options, zip: false}).run({});
            await writeExport(fx.pathToZip, {'_config.yml': 'title: Example', 'about.md': post({title: 'About'})});
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(failed),
                /No Jekyll posts found/
            );
            const kept = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(kept);
            assert.equal(kept.summary.imported, 4);
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

    it('scrapes published posts from the live site, warning when a page cannot be fetched', async () => {
        const fx = await setup();
        const page = `<!DOCTYPE html><html><head>
<title>Scraped title</title>
<meta name="description" content="Scraped description">
<meta property="og:image" content="https://example.com/images/card-1200x630.jpg">
<meta property="og:title" content="Scraped OG title">
<meta property="og:description" content="">
<meta name="twitter:image" content="https://example.com/images/card-600x300.png">
</head><body></body></html>`;
        nock.disableNetConnect();
        const web = nock('https://example.com')
            .get('/basic-post')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/relative-links')
            .reply(404)
            .get('/linking')
            .reply(200, '<html><head></head><body></body></html>', {'Content-Type': 'text/html'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['web'], wait_after_scrape: 1});
            await runner.run(context);
            assert.ok(web.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (4/4)', null]]
            );
            // The second page failed to load, which is a warning; the draft was not fetched.
            assert.equal(context.warningCount, 1);

            const result = await imported(context);
            const basic = result.posts.find(item => item.slug === 'basic-post');
            const meta = result.posts_meta.find(item => item.post_id === basic.id);
            assert.equal(meta.meta_title, 'Scraped title');
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped OG title');
            assert.equal(meta.og_description ?? null, null);
            assert.equal(meta.og_image, 'https://example.com/images/card.jpg');
            assert.equal(meta.twitter_image, 'https://example.com/images/card.png');
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
                assert.equal(context.summary.imported, 4);
                assert.equal(context.warningCount, 3);
                const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
                assert.ok(report.events.some(event => event.details.url === 'https://example.com/linking'));
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
        const fx = await setup({
            '_posts/2021-01-01-photo.md': post({title: 'Photo'}, '![A photo](/images/photo.jpg)'),
            '_posts/2021-01-02-plain.md': post({title: 'Plain'})
        });
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const image = nock('https://example.com')
            .get('/images/photo.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['assets']});
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
            const photo = (await imported(context)).posts.find(item => item.slug === 'photo');
            assert.match(photo.html, /src="__GHOST_URL__\/content\/images\/example-com\/images\/photo\.jpg"/);
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('matches authors to Ghost users by placeholder email', async () => {
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
                        email: 'persons-name@example.com',
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
            assert.equal(context.summary.imported, 4);
            const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
            assert.ok(report.events.some(event => event.details.operation === 'Ghost author matching'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile or a missing --url before mapping', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
            await assert.rejects(source.getTaskRunner({...fx.options, url: null}).run({}), /--url/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
