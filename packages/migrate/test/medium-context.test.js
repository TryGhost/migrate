import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source, {postProcessor} from '../sources/medium.js';
import command from '../commands/medium.js';

const profile = `<!DOCTYPE html><html><body><section class="h-card"><h3 class="p-name">Joe Bloggs</h3>
<ul><li><b>Profile:</b> <a class="u-url" href="https://medium.com/@JoeBloggs">@JoeBloggs</a></li>
<li><b>Email address:</b> joe@example.org</li></ul></section></body></html>`;

/** A Medium export post page; a missing `canonical` gives it no post ID unless its file name has one. */
const post = ({title, canonical, body = '<p>First.</p><p>Second.</p>', tags = [], author = true}) => `<!DOCTYPE html>
<html><body><article class="h-entry">
<header><h1 class="p-name">${title}</h1></header>
<section data-field="body" class="e-content">${body}</section>
<footer>
<p class="p-tags">${tags.map(tag => `<a href="https://medium.com/tag/${tag.toLowerCase()}" class="p-tag">${tag}</a>`).join(', ')}</p>
${author ? '<p>By <a href="https://medium.com/@JoeBloggs" class="p-author h-card">Joe Bloggs</a> on <time class="dt-published" datetime="2023-04-05T06:07:08.000Z">April 5, 2023</time>.</p>' : ''}
${canonical ? `<p><a href="${canonical}" class="p-canonical">Canonical link</a></p>` : ''}
</footer></article></body></html>`;

const files = {
    'profile/profile.html': profile,
    'posts/2023-04-05_First-abc123.html': post({
        title: 'First',
        canonical: 'https://medium.com/@JoeBloggs/first-abc123',
        body: '<p>Read <a href="https://medium.com/@JoeBloggs/second-def456">the second</a>.</p><p>More.</p>',
        tags: ['Travel']
    }),
    'posts/2023-04-06_Second-def456.html': post({
        title: 'Second',
        canonical: 'https://medium.com/@JoeBloggs/second-def456'
    }),
    'posts/draft_Third-fed789.html': post({title: 'Third', author: false})
};

/** Write a Medium export zip of `entries` (path in the zip → contents). */
async function writeExport(path, entries = files) {
    const content = await mkdtemp(join(tmpdir(), 'medium-export-'));
    try {
        for (const [name, contents] of Object.entries(entries)) {
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

async function setup(entries = files) {
    const directory = await mkdtemp(join(tmpdir(), 'medium-cli-'));
    const pathToZip = join(directory, 'input', 'export.zip');
    await writeExport(pathToZip, entries);
    return {
        directory,
        pathToZip,
        options: {
            pathToZip,
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
    const imports = {};
    fsUtils.zip.read(path, (name, entry) => {
        if (/ghost-import(?:-\d+)?\.json$/.test(name)) {
            imports[name.split('/').pop()] = JSON.parse(entry.getData().toString());
        }
    });
    return imports;
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('Medium context pipeline', () => {
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
            assert.equal(context.summary.imported, 3);
            assert.equal(context.warningCount, 0);
            await writeExport(fx.pathToZip, {'posts/no-id.html': post({title: 'No ID'})});
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Medium post was invalid/
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
        const fx = await setup({...files, 'posts/no-id.html': post({title: 'No ID'})});
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 2});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 4, imported: 3, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-medium-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.type === 'record:skipped'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const posts = [...imports['ghost-import-1.json'].data.posts, ...imports['ghost-import-2.json'].data.posts];
            assert.deepEqual(posts.map(item => [item.slug, item.status]).sort(), [
                ['first', 'published'],
                ['second', 'published'],
                ['third', 'draft']
            ]);
            const firstPost = posts.find(item => item.slug === 'first');
            assert.equal(firstPost.html, '<p>Read <a href="/second/">the second</a>.</p><p>More.</p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2023-04-05T06:07:08.000Z');
            const data = imports['ghost-import-1.json'].data;
            assert.deepEqual(
                data.users.map(user => [user.slug, user.email]),
                [['joebloggs', 'joe@example.org']]
            );
            assert.ok(data.tags.some(tag => tag.slug === 'hash-medium'));

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToZip);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addTag: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 3);
            const result = await imported(reused);
            assert.equal(result.posts.find(item => item.slug === 'first').id, firstPost.id);
            assert.ok(result.tags.some(tag => tag.name === 'Rerun'));
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
            await writeExport(fx.pathToZip, {
                'posts/2023-05-01_Fourth-aaa111.html': post({
                    title: 'Fourth',
                    canonical: 'https://medium.com/@JoeBloggs/fourth-aaa111'
                })
            });
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['fourth']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reads a directory of export zips', async () => {
        const fx = await setup();
        try {
            const exports = join(fx.directory, 'exports');
            await writeExport(join(exports, 'a.zip'));
            await writeExport(join(exports, 'b.zip'), {
                'posts/2023-05-01_Fourth-aaa111.html': post({
                    title: 'Fourth',
                    canonical: 'https://medium.com/@JoeBloggs/fourth-aaa111'
                })
            });
            const context = {};
            await source.getTaskRunner({...fx.options, pathToZip: exports, zip: false}).run(context);
            assert.equal(context.summary.imported, 4);
            const result = await imported(context);
            assert.deepEqual(result.posts.map(item => item.slug).sort(), ['first', 'fourth', 'second', 'third']);
            assert.equal(result.users.length, 1);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherZip = join(fx.directory, 'other', 'export.zip');
            await writeExport(otherZip, {
                'posts/2023-05-01_Other-bbb222.html': post({
                    title: 'Other',
                    canonical: 'https://medium.com/@JoeBloggs/other-bbb222'
                })
            });
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, pathToZip: otherZip}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'medium-export');
            assert.deepEqual(
                (await imported(two)).posts.map(item => item.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid', async () => {
        const fx = await setup({'posts/no-id.html': post({title: 'No ID'})});
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(
                report.events.some(
                    event => event.details.reason === 'No Medium post ID in the canonical URL or file name'
                )
            );
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats an export without posts as a valid import', async () => {
        const fx = await setup({'profile/profile.html': profile});
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

    it('scrapes published posts for tags, metadata and author images, and downloads assets', async () => {
        // Without a profile, the post's author link is the author, and it has no image.
        const {'profile/profile.html': _profile, ...noProfile} = files;
        const fx = await setup(noProfile);
        const page = `<!DOCTYPE html><html><head>
<meta name="description" content="Scraped description">
<meta property="og:image" content="https://cdn-images-1.medium.com/max/1200/og.jpeg">
<meta property="og:title" content="Scraped title">
</head><body><div id="root">
<a href="https://medium.com/@JoeBloggs"><img src="https://cdn-images-1.medium.com/small.jpeg"></a>
<a href="/@JoeBloggs?source=post_page"><img src="https://cdn-images-1.medium.com/fit/c/88/88/joe.jpeg"></a>
</div>
<script>var other = 1;</script>
<script>window.__APOLLO_STATE__ = {"Tag:travel":{"__typename":"Tag","normalizedTagSlug":"travel","displayTitle":"Travel"},"Tag:food":{"__typename":"Tag","normalizedTagSlug":"food","displayTitle":"Food"},"User:1":{"__typename":"User"}}</script>
</body></html>`;
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const web = nock('https://medium.com')
            .get('/@JoeBloggs/first-abc123')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/@JoeBloggs/second-def456')
            .reply(404);
        const images = nock('https://cdn-images-1.medium.com')
            .get('/max/1200/og.jpeg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'})
            .get('/fit/c/88/88/joe.jpeg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['all'], wait_after_scrape: 1});
            await runner.run(context);
            assert.ok(web.isDone());
            assert.ok(images.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (3/3)', null]]
            );
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (3/3)', null],
                    ['Tags (3/3)', null],
                    ['Authors (1/1)', null]
                ]
            );
            // The second page failed to load, which is a warning.
            assert.equal(context.warningCount, 1);

            const result = await imported(context);
            const first = result.posts.find(item => item.slug === 'first');
            const meta = result.posts_meta.find(item => item.post_id === first.id);
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped title');
            assert.equal(meta.og_image, '__GHOST_URL__/content/images/cdn-images-1-medium-com/max/1200/og.jpg');
            const tags = result.posts_tags
                .filter(pt => pt.post_id === first.id)
                .sort((a, b) => a.sort_order - b.sort_order)
                .map(pt => result.tags.find(tag => tag.id === pt.tag_id).name);
            assert.deepEqual(tags, ['Travel', 'Food', '#medium']);
            assert.deepEqual(
                result.users.map(user => [user.slug, user.profile_image]),
                [['joebloggs', '__GHOST_URL__/content/images/cdn-images-1-medium-com/fit/c/88/88/joe.jpg']]
            );
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('collects scraped Apollo tags and leaves pages without them alone', () => {
        assert.deepEqual(
            postProcessor({
                scrapedTags: [{}, {scriptTag: [{url: 'https://medium.com/tag/a', data: {name: 'A', slug: 'a'}}]}]
            }),
            {tags: [{url: 'https://medium.com/tag/a', name: 'A', slug: 'a'}]}
        );
        assert.deepEqual(postProcessor({og_title: 'Title'}), {og_title: 'Title'});
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
                assert.equal(context.summary.imported, 3);
                assert.equal(context.warningCount, 2);
                const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
                assert.ok(
                    report.events.some(event => event.details.url === 'https://medium.com/@JoeBloggs/first-abc123')
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
            assert.equal(context.summary.imported, 3);
            assert.deepEqual(
                (await imported(context)).users.map(user => user.email),
                ['joe@example.org']
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
