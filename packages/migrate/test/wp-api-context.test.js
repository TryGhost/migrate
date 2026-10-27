import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, readFile, readdir, rm, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/wp-api.js';
import command from '../commands/wp-api.js';

const SITE = 'https://example.com';

const post = (id, extra = {}) => ({
    id,
    type: 'post',
    slug: `post-${id}`,
    status: 'publish',
    link: `${SITE}/post-${id}/`,
    title: {rendered: `Title ${id}`},
    content: {rendered: `<p><a href="${SITE}/post-2/">Next</a></p>`},
    excerpt: {rendered: ''},
    date_gmt: '2024-01-01T00:00:00',
    modified_gmt: '2024-01-01T00:00:00',
    author: 1,
    _embedded: {
        'wp:term': [[{id: 3, taxonomy: 'category', slug: 'news', name: 'News', link: `${SITE}/category/news/`}]]
    },
    ...extra
});

const user = {id: 1, slug: 'admin', name: 'Admin', link: `${SITE}/author/admin/`};

/** Serve WordPress REST collections with paging headers; returns the requested URLs. */
function wordpress(data) {
    const requests = [];
    nock(SITE)
        .persist()
        .get(/^\/wp-json\/wp\/v2\//)
        .reply(request => {
            const url = new URL(request.url);
            requests.push(url);
            const items = data[url.pathname.split('/')[4]] ?? [];
            const perPage = Number(url.searchParams.get('per_page') ?? 10);
            const page = Number(url.searchParams.get('page') ?? 1);
            return [
                200,
                items.slice((page - 1) * perPage, page * perPage),
                {'X-WP-Total': String(items.length), 'X-WP-TotalPages': String(Math.ceil(items.length / perPage))}
            ];
        });
    return requests;
}

async function setup() {
    const directory = await mkdtemp(join(tmpdir(), 'wp-api-cli-'));
    return {
        directory,
        options: {
            url: SITE,
            tmpPath: directory,
            outputPath: directory,
            cacheName: 'test',
            scrape: ['none'],
            limit: 100,
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

describe('WordPress API context pipeline', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('registers rereading, chunking and cache naming options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal('fallBackHTMLCard' in command.defaults, false);
    });

    it('writes linked HTML chunks, a report and a ZIP, then remaps stored records without fetching', async () => {
        const fx = await setup();
        try {
            const requests = wordpress({posts: [post(1), post(2), post(3, {date_gmt: null})], users: [user]});
            const first = {apiUser: null, usersJSON: null};
            const runner = source.getTaskRunner({...fx.options, limit: 2, postsPerFile: 1});
            await runner.run(first);
            const fetching = runner.tasks.find(task => task.title === 'Fetching content');
            assert.equal(fetching.isCompleted(), true);
            assert.equal(fetching.output, null);
            closed(first);
            assert.deepEqual(first.summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(first.exportedFiles, 2);
            assert.equal(requests.filter(url => url.searchParams.get('page')).length, 3);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.type === 'record:skipped'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const [firstPost] = imports['ghost-import-1.json'].data.posts;
            assert.ok(firstPost.html.includes('href="/post-2/"'));
            assert.equal(firstPost.lexical, undefined);
            assert.equal(imports['ghost-import-1.json'].data.tags[0].name, 'News');
            assert.equal(imports['ghost-import-1.json'].data.users[0].slug, 'admin');

            // A second run maps the stored records again; the API is no longer reachable.
            nock.cleanAll();
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, addTag: 'Rerun'});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 2);
            const result = JSON.parse(await readFile(join(reused.importDirectory, 'ghost-import.json'), 'utf8'));
            assert.equal(result.data.posts[0].id, firstPost.id);
            assert.ok(result.data.tags.some(tag => tag.name === 'Rerun'));
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );

            // --rereadSource fetches again and replaces the stored source.
            wordpress({posts: [post(4)], users: [user]});
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 1);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps a separate source for each batch', async () => {
        const fx = await setup();
        try {
            wordpress({posts: [post(1), post(2)], users: [user]});
            const imported = async context =>
                JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data.posts.map(
                    item => item.slug
                );
            const batchOne = {};
            await source.getTaskRunner({...fx.options, zip: false, limit: 1, batch: 1}).run(batchOne);
            assert.deepEqual(await imported(batchOne), ['post-1']);
            const batchTwo = {};
            await source.getTaskRunner({...fx.options, zip: false, limit: 1, batch: 2}).run(batchTwo);
            assert.deepEqual(await imported(batchTwo), ['post-2']);
            assert.ok((await readdir(batchOne.fileCache.tmpDir)).includes('mg-context-batch-1.sqlite'));
            assert.ok((await readdir(batchOne.fileCache.tmpDir)).includes('mg-context-batch-2.sqlite'));
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected item is invalid or the API fails', async () => {
        const fx = await setup();
        try {
            wordpress({posts: [post(1, {date_gmt: null})], users: [user]});
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);

            nock.cleanAll();
            nock(SITE).get(/.*/).reply(500, {code: 'error', message: 'Server down'});
            const failed = {};
            const runner = source.getTaskRunner({...fx.options, rereadSource: true});
            await assert.rejects(runner.run(failed));
            assert.equal(runner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(failed.failedReport)).size > 0);
            closed(failed);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('streams ZIP and report uploads and cleans the cache', async () => {
        const fx = await setup();
        const uploaded = [];
        try {
            wordpress({posts: [post(1)], users: [user]});
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
            assert.ok(uploaded[0].endsWith('.zip'));
            assert.ok(uploaded[1].endsWith('.report.json'));
            assert.match(context.outputFile.path, /^https:/);
            await assert.rejects(stat(context.fileCache.cacheDir), /ENOENT/);
            closed(context);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('scrapes published post metadata from the original post URL', async () => {
        const fx = await setup();
        try {
            wordpress({posts: [post(1)], users: [user]});
            const page = nock(SITE)
                .get('/post-1/')
                .reply(
                    200,
                    '<html><head><title>Scraped title</title><meta name="description" content="Scraped description"></head><body></body></html>'
                );
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['web']});
            await runner.run(context);
            assert.ok(page.isDone());
            const scraping = runner.tasks.find(task => task.title === 'Fetch missing data via WebScraper');
            assert.deepEqual(
                scraping.subtasks.map(subtask => [subtask.title, subtask.output]),
                [['Posts (1/1)', null]]
            );
            const result = JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8'));
            const meta = result.data.posts_meta.find(row => row.post_id === result.data.posts[0].id);
            assert.equal(meta.meta_title, 'Scraped title');
            assert.equal(meta.meta_description, 'Scraped description');
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('reports content totals with --info', async () => {
        wordpress({posts: [post(1), post(2)], pages: [post(3, {type: 'page'})], users: [user]});
        const context = {errors: []};
        await source
            .getTaskRunner({url: SITE, info: true, posts: true, pages: true, limit: 1, renderer: 'silent'})
            .run(context);
        assert.deepEqual(context.info.totals, {posts: 2, pages: 1, users: 1});
        assert.deepEqual(context.info.batches, {posts: 2, pages: 1, users: 1});
    });
});
