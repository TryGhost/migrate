import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/libsyn.js';
import command from '../commands/libsyn.js';

const SITE = 'https://example.com';

/** An `<item>` linking to episode 2, overridden by `values`. */
const item = (id, values = {}) => {
    const fields = {
        title: `Episode ${id}`,
        pubDate: 'Mon, 10 Aug 2020 07:00:00 +0000',
        guid: `guid-${id}`,
        link: `https://traffic.libsyn.com/secure/exampleshow/episode-${id}.mp3`,
        description: `<p>Listen to <a href="${SITE}/episode-2">episode 2</a></p>`,
        'itunes:duration': '10:00',
        'libsyn:itemId': id,
        'itunes:keywords': 'news',
        ...values
    };
    return `<item>${Object.entries(fields)
        .map(([name, value]) => `<${name}><![CDATA[${value}]]></${name}>`)
        .join('')}</item>`;
};

const feed = items => `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:libsyn="http://libsyn.com/libsyn-rss-spec">
    <channel>
        <title>Example Show</title>
        <itunes:category text="Business"><itunes:category text="Careers"/></itunes:category>
        <itunes:owner><itunes:name>Example User</itunes:name><itunes:email>person@example.com</itunes:email></itunes:owner>
        ${items.join('\n')}
    </channel>
</rss>`;

/** Serve `body` as the site's feed and return the requested URLs. */
function libsyn(body, {status = 200, site = SITE, path = '/rss/'} = {}) {
    const requests = [];
    nock(site)
        .get(path)
        .query({'include-libsyn-metadata': 'true'})
        .reply(request => {
            requests.push(request.url);
            return [status, body, {'Content-Type': 'application/rss+xml'}];
        });
    return requests;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'libsyn-cli-'));
    return {
        directory,
        options: {
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

describe('Libsyn context pipeline', () => {
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
        assert.equal(command.defaults.useEmbed, true);
        assert.equal(command.defaults.useFeedCategories, true);
        assert.equal(command.defaults.useItemKeywords, true);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes no report or failed report unless asked', async () => {
        const fx = await setup();
        try {
            libsyn(feed([item('1')]));
            const context = {};
            await source.getTaskRunner({...fx.options, report: false}).run(context);
            assert.equal(context.reportFile, undefined);
            assert.equal(context.summary.imported, 1);
            libsyn('Server error', {status: 500});
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

    it('writes linked HTML chunks, a report and a ZIP, then remaps the stored feed without fetching', async () => {
        const fx = await setup();
        try {
            const requests = libsyn(
                feed([
                    item('1'),
                    item('2'),
                    item('3', {title: 'Episode 1'}),
                    // A repeated GUID keeps the copy with the latest date.
                    item('2', {description: '<p>Updated</p>', pubDate: 'Tue, 11 Aug 2020 07:00:00 +0000'}),
                    item('invalid', {pubDate: 'never'})
                ])
            );
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 2, addTag: 'Podcast'});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(requests, [`${SITE}/rss/?include-libsyn-metadata=true`]);
            assert.deepEqual(first.summary, {selected: 4, imported: 3, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-libsyn-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            // The repeated episode, the skipped episode, and episode 3 renamed from episode-1 to episode-1-2.
            assert.equal(report.summary.warnings, 3);
            assert.deepEqual(
                report.events
                    .map(event => event.type)
                    .filter(type => type !== 'post:inserted')
                    .sort(),
                ['record:skipped', 'slug:renamed', 'source:conflict']
            );
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Libsyn item date'));

            const entries = zipEntries(first.outputFile.path);
            assert.deepEqual(
                Object.keys(entries).filter(name => !name.endsWith('/')),
                ['ghost-import-1.json', 'ghost-import-2.json']
            );
            const posts = [...entries['ghost-import-1.json'].data.posts, ...entries['ghost-import-2.json'].data.posts];
            assert.deepEqual(
                posts.map(post => [post.slug, post.title]),
                [
                    ['episode-1', 'Episode 1'],
                    ['episode-2', 'Episode 2'],
                    ['episode-1-2', 'Episode 1']
                ]
            );
            assert.ok(posts[1].html.endsWith('<p>Updated</p>'));
            assert.equal(posts[1].published_at, '2020-08-11T07:00:00.000Z');
            const [firstPost] = posts;
            assert.ok(firstPost.html.startsWith('<!--kg-card-begin: html--><iframe id="embed_1"'));
            assert.ok(firstPost.html.endsWith('<p>Listen to <a href="/episode-2/">episode 2</a></p>'));
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2020-08-10T07:00:00.000Z');
            assert.deepEqual(
                entries['ghost-import-1.json'].data.tags.map(tag => tag.name),
                ['Podcast', 'Business', 'Careers', 'news', '#libsyn']
            );
            assert.deepEqual(
                entries['ghost-import-1.json'].data.users.map(user => [user.name, user.email]),
                [['Example User', 'person@example.com']]
            );

            // A second run maps the stored feed again; the site is no longer reachable.
            nock.cleanAll();
            const reused = {};
            const reusedRunner = source.getTaskRunner({
                ...fx.options,
                zip: false,
                useFeedCategories: false,
                useItemKeywords: false
            });
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.deepEqual(reused.summary, {selected: 4, imported: 3, skipped: 1});
            const result = await imported(reused);
            assert.deepEqual(
                result.posts.map(post => [post.slug, post.id]),
                posts.map(post => [post.slug, post.id])
            );
            assert.deepEqual(
                result.tags.map(tag => tag.name),
                ['#libsyn']
            );
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );

            // --rereadSource fetches again and replaces the stored feed.
            const reread = libsyn(feed([item('5')]));
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(reread.length, 1);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(post => post.slug),
                ['episode-5']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps each site in its own workspace', async () => {
        const fx = await setup();
        try {
            libsyn(feed([item('1')]), {path: '/show/rss/'});
            const context = {};
            await source
                .getTaskRunner({...fx.options, cacheName: null, zip: false, url: 'https://Example.com/show/'})
                .run(context);
            assert.equal(context.fileCache.originalName, 'libsyn-example.com-show');
            libsyn(feed([item('1')]), {site: 'https://example.org'});
            const other = {};
            await source
                .getTaskRunner({...fx.options, cacheName: null, zip: false, url: 'https://example.org'})
                .run(other);
            assert.equal(other.fileCache.originalName, 'libsyn-example.org');
            assert.notEqual(other.fileCache.cacheDir, context.fileCache.cacheDir);
            assert.match(other.outputName, /^gh-libsyn-example-\d+\.zip$/);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected episode is invalid or the feed fails', async () => {
        const fx = await setup();
        try {
            libsyn(feed([item('1', {pubDate: 'never'})]));
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected Libsyn episode/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);

            libsyn('Not found', {status: 404});
            const failed = {};
            const runner = source.getTaskRunner({...fx.options, rereadSource: true});
            await assert.rejects(runner.run(failed), /Could not fetch the Libsyn feed .+: 404/);
            assert.equal(runner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            const failedReport = JSON.parse(await readFile(failed.failedReport, 'utf8'));
            assert.equal(failedReport.summary.status, 'failed');
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
            libsyn(feed([item('1')]));
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
            libsyn(
                feed([item('1', {description: '<p>Text</p><p><img src="https://cdn.libsyn.example/photo.jpg"></p>'})])
            );
            const imageBytes = await readFile(
                new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
            );
            const image = nock('https://cdn.libsyn.example')
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
                    ['Tags (4/4)', null],
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
