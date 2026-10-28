import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import WebScraper from '@tryghost/mg-webscraper';
import source from '../sources/chorus.js';
import command from '../commands/chorus.js';

const FULL = 'Entry:0969db64-b8d7-11ed-afa1-0242ac120001';
const fixture = JSON.parse(
    await readFile(new URL(`../../mg-chorus/src/test/fixtures/${FULL}.json`, import.meta.url), 'utf8')
);

/** An entry like the fixture, with one paragraph and its own uid, URL and title. */
const entry = (id, values = {}) => ({
    ...fixture,
    uid: `Entry:${id}`,
    title: `Entry ${id}`,
    url: `https://example.com/2020/1/1/${id}/entry-${id}`,
    contributors: [],
    communityGroups: [],
    body: {components: [fixture.body.components[0]]},
    ...values
});

// The fixture's related list links to this entry, so the link is rewritten to its new path.
const related = entry('marius', {url: 'https://example.com/2019/9/25/23456789/marius', title: 'Marius'});
const entries = [fixture, related];

/**
 * Write a Chorus export zip holding `items`, named after their uids, beside an `entries.csv`. The zip writer drops
 * a leading `Entry:` from a name as if it were a drive letter, so the files sit in a top-level directory.
 */
async function writeExport(path, items = entries) {
    const content = await mkdtemp(join(tmpdir(), 'chorus-export-'));
    try {
        await mkdir(join(content, 'chorus'));
        for (const item of items) {
            await writeFile(join(content, 'chorus', `${item.uid}.json`), JSON.stringify(item));
        }
        await writeFile(join(content, 'chorus', 'entries.csv'), 'uid\n');
        await mkdir(dirname(path), {recursive: true});
        await rm(path, {force: true});
        await fsUtils.zip.write(dirname(path), content, path.split('/').pop());
    } finally {
        await rm(content, {recursive: true, force: true});
    }
}

async function setup(items = entries) {
    const directory = await mkdtemp(join(tmpdir(), 'chorus-cli-'));
    const pathToZip = join(directory, 'input', 'export.zip');
    await writeExport(pathToZip, items);
    return {
        directory,
        pathToZip,
        options: {
            entries: [pathToZip],
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

describe('Chorus context pipeline', () => {
    it('registers rereading, chunking, cache naming and report options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.tmpPath, null);
        assert.equal(command.defaults.outputPath, null);
        assert.equal(command.defaults.report, false);
        assert.deepEqual(command.defaults.scrape, ['all']);
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
            await writeExport(fx.pathToZip, [entry('a', {url: undefined})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Chorus entry was invalid/
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
        const fx = await setup([...entries, entry('invalid', {createdAt: 'never'})]);
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 1, addPrimaryTag: 'News'});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.match(first.outputName, /^gh-chorus-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Chorus createdAt'));

            const {imports, files} = zipContents(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            assert.deepEqual(files, []);
            const posts = [...imports['ghost-import-1.json'].data.posts, ...imports['ghost-import-2.json'].data.posts];
            assert.deepEqual(posts.map(item => [item.slug, item.title, item.status]).sort(), [
                ['marius', 'Marius', 'published'],
                ['my-article', 'Example post title', 'published']
            ]);
            const article = posts.find(item => item.slug === 'my-article');
            assert.equal(article.lexical, undefined);
            assert.ok(article.html.includes('<a href="/marius/">Mauris nunc lacus, cursus ut semper id</a>'));
            assert.ok(
                article.html.includes('<a href="https://example.com/2019/9/26/43456789/vehicula">'),
                'links to entries outside the migration are kept'
            );
            assert.equal(article.published_at, '2019-09-27T00:40:19.000Z');
            const data = imports['ghost-import-1.json'].data;
            assert.deepEqual(
                data.users.map(user => [user.slug, user.email]),
                [
                    ['main-author-name', 'main-author-name@example.com'],
                    ['author-name', 'author-name@example.com'],
                    ['contributors-name', 'contributors-name@example.com']
                ]
            );
            assert.deepEqual(
                data.tags.map(tag => tag.slug),
                ['news', 'lorem', 'ipsum-dolor', 'simet', 'hash-chorus']
            );

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToZip);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addPrimaryTag: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 2);
            const result = await imported(reused);
            assert.equal(result.posts.find(item => item.slug === 'my-article').id, article.id);
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
            await writeExport(fx.pathToZip, [entry('fresh')]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['entry-fresh']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reads several exports and directories, keeping the latest copy of a repeated entry', async () => {
        const fx = await setup([entry('a', {updatedAt: '2020-01-01T00:00:00.000Z'})]);
        try {
            const folder = join(fx.directory, 'folder');
            await mkdir(folder);
            const newer = entry('a', {title: 'Newer', updatedAt: '2020-02-01T00:00:00.000Z'});
            await writeFile(join(folder, 'Entry:a.json'), JSON.stringify(newer));
            await writeFile(join(folder, 'Entry:b.json'), JSON.stringify(entry('b')));
            const context = {};
            await source.getTaskRunner({...fx.options, entries: [fx.pathToZip, folder], zip: false}).run(context);
            assert.equal(context.summary.imported, 2);
            assert.equal(context.warningCount, 1);
            assert.deepEqual(
                (await imported(context)).posts.map(item => [item.slug, item.title]),
                [
                    ['entry-a', 'Newer'],
                    ['entry-b', 'Entry b']
                ]
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherZip = join(fx.directory, 'other', 'export.zip');
            await writeExport(otherZip, [entry('other')]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, entries: [otherZip]}).run(two);
            const both = {};
            await source.getTaskRunner({...options, entries: [fx.pathToZip, otherZip]}).run(both);
            assert.equal(new Set([one, two, both].map(context => context.fileCache.cacheDir)).size, 3);
            assert.equal(one.fileCache.cacheName, 'chorus-export');
            assert.deepEqual(
                (await imported(two)).posts.map(item => item.slug),
                ['entry-other']
            );
            assert.equal(both.summary.imported, 3);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected entry is invalid', async () => {
        const fx = await setup([entry('a', {url: 'not a url'})]);
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Entry has no valid URL'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an export without entries, keeping the stored source', async () => {
        const fx = await setup();
        try {
            await source.getTaskRunner({...fx.options, zip: false}).run({});
            await writeExport(fx.pathToZip, []);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(failed),
                /No Chorus entries found/
            );
            const kept = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(kept);
            assert.deepEqual(
                (await imported(kept)).posts.map(item => item.slug),
                ['my-article', 'marius']
            );
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

    it('scrapes post metadata, warning when a page cannot be fetched', async () => {
        const fx = await setup();
        const page = `<!DOCTYPE html><html><head>
<meta name="description" content="Scraped description">
<meta property="og:title" content="Scraped title">
<meta property="og:description" content="">
<meta property="twitter:title" content="Scraped Twitter title">
</head><body></body></html>`;
        nock.disableNetConnect();
        const web = nock('https://example.com')
            .get('/2019/9/26/12345678/my-article')
            .reply(200, page, {'Content-Type': 'text/html'})
            .get('/2019/9/25/23456789/marius')
            .reply(404);
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['all'], wait_after_scrape: 1});
            await runner.run(context);
            assert.ok(web.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (2/2)', null]]
            );
            // The second page failed to load, which is a warning.
            assert.equal(context.warningCount, 1);

            const result = await imported(context);
            const article = result.posts.find(item => item.slug === 'my-article');
            const meta = result.posts_meta.find(item => item.post_id === article.id);
            assert.equal(meta.meta_description, 'Scraped description');
            assert.equal(meta.og_title, 'Scraped title');
            assert.equal(meta.og_description ?? null, null);
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
                assert.equal(context.summary.imported, 2);
                assert.equal(context.warningCount, 2);
                const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
                assert.ok(
                    report.events.some(
                        event => event.details.url === 'https://example.com/2019/9/26/12345678/my-article'
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
                        slug: 'main',
                        name: 'Main Existing',
                        email: 'main-author-name@example.com',
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
            assert.deepEqual(data.users[0].id, '0123456789abcdef01234567');
            assert.deepEqual(data.users[0].slug, 'main');
            assert.deepEqual(data.users[0].roles, ['Editor']);
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
            assert.equal(context.summary.imported, 2);
            const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
            assert.ok(report.events.some(event => event.details.operation === 'Ghost author matching'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects an invalid --postsPerFile or missing --entries before reading', async () => {
        const fx = await setup();
        try {
            await assert.rejects(
                source.getTaskRunner({...fx.options, postsPerFile: 0}).run({}),
                /--postsPerFile must be a positive integer/
            );
            await assert.rejects(
                source.getTaskRunner({...fx.options, entries: []}).run({}),
                /--entries needs at least one Chorus export/
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});
