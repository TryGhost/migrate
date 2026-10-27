import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {mkdtemp, writeFile, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/wp-xml.js';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import AssetScraper from '@tryghost/mg-assetscraper-db';
import WebScraper from '@tryghost/mg-webscraper';
import command from '../commands/wp-xml.js';

const item = (id, date = '2024-01-01T00:00:00Z', status = 'publish') =>
    `<item><wp:post_id>${id}</wp:post_id><title>Title ${id}</title><wp:post_name>post-${id}</wp:post_name><link>https://example.com/post-${id}/</link><wp:post_type>post</wp:post_type><wp:status>${status}</wp:status><pubDate>${date}</pubDate><content:encoded><![CDATA[<p><a href="https://example.com/post-2/">Next</a></p>]]></content:encoded></item>`;
const xml = items => `<rss><channel><link>https://example.com</link>${items}</channel></rss>`;
async function setup(content) {
    const directory = await mkdtemp(join(tmpdir(), 'wp-cli-'));
    const pathToFile = join(directory, 'input.xml');
    await writeFile(pathToFile, content);
    return {
        directory,
        options: {
            pathToFile,
            tmpPath: directory,
            outputPath: directory,
            cacheName: 'test',
            scrape: ['none'],
            renderer: 'silent'
        }
    };
}

function closed(context) {
    assert.throws(() => context.migrateContext.db, /not initialized/);
}

describe('WordPress context pipeline', () => {
    it('registers HTML output, refresh, and chunk defaults', () => {
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.rereadSource, false);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes linked HTML chunks, durable reports and a ZIP; replays source and cleans obsolete chunks', async () => {
        const fx = await setup(xml(item('1') + item('2') + item('3', 'bad')));
        try {
            const first = {};
            const runner = source.getTaskRunner({...fx.options, postsPerFile: 1});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.hasSubtasks(), false);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.equal(JSON.parse(await readFile(first.reportFile.path, 'utf8')).summary.status, 'complete');
            let importFiles = 0;
            fsUtils.zip.read(first.outputFile.path, (name, entry) => {
                if (/ghost-import-\d+\.json$/.test(name)) {
                    const content = JSON.parse(entry.getData().toString());
                    assert.ok(content.data.posts[0].html.includes('href="/post-2/"'));
                    assert.equal(content.data.posts[0].lexical, undefined);
                    importFiles++;
                }
            });
            assert.equal(importFiles, 2);
            const before = JSON.parse(await readFile(join(first.importDirectory, 'ghost-import-1.json'), 'utf8')).data
                .posts[0].id;
            await writeFile(join(first.importDirectory, '.mg-context-export-manifest.json'), '{}');
            const second = {};
            await source.getTaskRunner({...fx.options, zip: false, postsPerFile: 10, addTag: 'Rerun'}).run(second);
            await assert.rejects(stat(join(second.importDirectory, '.mg-context-export-manifest.json')), /ENOENT/);
            const result = JSON.parse(await readFile(join(second.importDirectory, 'ghost-import.json'), 'utf8'));
            assert.equal(result.data.posts[0].id, before);
            assert.ok(result.data.tags.some(tag => tag.name === 'Rerun'));
            assert.equal(
                (await readdir(second.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );
            assert.ok(second.reportFile.path.startsWith(second.fileCache.cacheDir));
            await writeFile(fx.options.pathToFile, xml(item('4')));
            const reused = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(reused);
            assert.equal(reused.summary.imported, 2);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP/report uploads and preserves durable reports through cache cleanup', async () => {
        const fx = await setup(xml(item('1')));
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
            assert.equal(uploaded.length, 2);
            assert.match(context.outputFile.path, /^https:/);
            await assert.rejects(stat(context.fileCache.cacheDir), /ENOENT/);
            assert.ok((await readdir(fx.directory)).some(name => name.endsWith('.report.json')));
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('fails all-invalid exports, retains recovery files on upload failure, and closes resources', async () => {
        const fx = await setup(xml(item('1', 'bad')));
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            assert.equal(JSON.parse(await readFile(invalid.failedReport, 'utf8')).summary.status, 'failed');
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
            await writeFile(fx.options.pathToFile, xml(item('2')));
            const failed = {};
            let uploads = 0;
            await assert.rejects(
                source
                    .getTaskRunner({
                        ...fx.options,
                        rereadSource: true,
                        cache: false,
                        outputStorage: {
                            async upload({body}) {
                                for await (const unused of body) {
                                    assert.ok(unused.length);
                                }
                                if (++uploads === 2) {
                                    throw new Error('report upload failed');
                                }
                                return 'https://storage.example/zip';
                            }
                        }
                    })
                    .run(failed),
                /report upload failed/
            );
            assert.ok((await stat(failed.recoveryFile)).size > 0);
            assert.ok((await stat(failed.fileCache.cacheDir)).isDirectory());
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('scrapes published metadata, skips drafts, downloads assets, and closes the asset database', async () => {
        const fx = await setup(xml(item('1') + item('2', undefined, 'draft')));
        nock.disableNetConnect();
        const web = nock('https://example.com')
            .get('/post-1/')
            .reply(
                200,
                '<html><head><title>Scraped title</title><meta name="description" content="Scraped description"><meta property="og:image" content="https://example.com/image.jpg"></head><body></body></html>'
            );
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        const image = nock('https://example.com')
            .get('/image.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['all']});
            await runner.run(context);
            assert.ok(web.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (2/2)', null]]
            );
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => subtask.title.replace(/ \(.*/, '')),
                ['Posts', 'Tags', 'Authors']
            );
            for (const subtask of assets.subtasks) {
                const [, done, total] = subtask.title.match(/\((\d+)\/(\d+)\)$/);
                assert.equal(done, total);
                assert.equal(subtask.output, null);
            }
            assert.equal(assets.subtasks[0].title, 'Posts (2/2)');
            const result = JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8'));
            const meta = result.data.posts_meta.find(row => row.post_id === result.data.posts[0].id);
            assert.equal(meta.meta_title, 'Scraped title');
            assert.equal(meta.meta_description, 'Scraped description');
            assert.ok(image.isDone());
            assert.ok(meta.og_image.includes('/content/images/'));
            assert.ok((await readdir(context.fileCache.imageDir)).length > 0);
            context.assetScraper.close();
            closed(context);
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats an intentionally empty selection as a valid import', async () => {
        const fx = await setup(xml(item('1')));
        try {
            const context = {};
            await source.getTaskRunner({...fx.options, zip: false, posts: false}).run(context);
            assert.equal(context.summary.selected, 0);
            assert.equal(
                JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data.posts
                    .length,
                0
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });
});

it('reports optional destination author fetch failures without dropping valid posts', async () => {
    const fx = await setup(xml(item('1')));
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
        const report = JSON.parse(await readFile(context.reportFile.path, 'utf8'));
        assert.ok(report.events.some(event => event.details.operation === 'Ghost author matching'));
    } finally {
        nock.cleanAll();
        nock.enableNetConnect();
        await rm(fx.directory, {recursive: true, force: true});
    }
});

it('rejects storage adapters that resolve without consuming their readable body', async () => {
    const fx = await setup(xml(item('1')));
    try {
        const context = {};
        await assert.rejects(
            source.getTaskRunner({...fx.options, outputStorage: {upload: async () => 'ignored-stream'}}).run(context),
            /consume the readable body/
        );
        assert.ok((await stat(context.recoveryFile)).size > 0);
        closed(context);
    } finally {
        await rm(fx.directory, {recursive: true, force: true});
    }
});

it('reuses stored originals when the input file is no longer available', async () => {
    const fx = await setup(xml(item('1')));
    try {
        await source.getTaskRunner({...fx.options, zip: false}).run({});
        await rm(fx.options.pathToFile);
        const reused = {};
        const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addTag: 'Reused'});
        await reusedRunner.run(reused);
        const reusedTask = reusedRunner.tasks.find(task => task.title === 'Fetching content');
        assert.equal(reusedTask.isCompleted(), true);
        assert.equal(reusedTask.output, null);
        assert.equal(reused.summary.imported, 1);
        const failed = {};
        const failedRunner = source.getTaskRunner({...fx.options, rereadSource: true});
        await assert.rejects(failedRunner.run(failed), /ENOENT/);
        const failedTask = failedRunner.tasks.find(task => task.title === 'Fetching content');
        assert.equal(failedTask.hasFailed(), true);
        assert.match(failedTask.output, /ENOENT/);
        assert.ok(failedTask.output.includes(fx.options.pathToFile));
        closed(failed);
        const previous = {};
        await source.getTaskRunner({...fx.options, zip: false}).run(previous);
        assert.equal(previous.summary.imported, 1);
    } finally {
        await rm(fx.directory, {recursive: true, force: true});
    }
});

it('closes resources on initialization, mapping, and export failures without replacing the delivered ZIP', async () => {
    const fx = await setup(xml(item('1')));
    try {
        const first = {};
        await source.getTaskRunner(fx.options).run(first);
        const zip = await readFile(first.outputFile.path);
        for (const [target, method, failure] of [
            [
                MigrateContext.prototype,
                'init',
                async () => {
                    throw new Error('init failed');
                }
            ],
            [
                AssetScraper.prototype,
                'init',
                async () => {
                    throw new Error('asset init failed');
                }
            ],
            [
                PostContext.prototype,
                'set',
                () => {
                    throw new Error('mapping defect');
                }
            ],
            [
                MigrateContext.prototype,
                'writeGhostJsonStream',
                () => {
                    throw new Error('export failed');
                }
            ]
        ]) {
            const change = mock.method(target, method, failure);
            const context = {};
            try {
                await assert.rejects(source.getTaskRunner({...fx.options, scrape: ['assets']}).run(context));
                closed(context);
                assert.equal(context.outputFile, undefined);
                assert.deepEqual(await readFile(first.outputFile.path), zip);
                context.assetScraper?.close();
            } finally {
                change.mock.restore();
            }
        }
    } finally {
        await rm(fx.directory, {recursive: true, force: true});
    }
});

it('reports remote scrape failures but propagates scraper cache and code failures', async () => {
    const fx = await setup(xml(item('1')));
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
            assert.ok(context.warningCount > 0);
            assert.ok(
                JSON.parse(await readFile(context.reportFile.path, 'utf8')).events.some(
                    event => event.details.operation === 'Web scraping'
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
