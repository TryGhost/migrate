import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/wix-csv.js';
import command from '../commands/wix-csv.js';

const SITE = 'https://example.com';

const COLUMNS = [
    'Author',
    'Main Category',
    'Title',
    'Excerpt',
    'ID',
    'Tags',
    'Featured',
    'Slug',
    'Plain Content',
    'Cover Image',
    'Published Date',
    'Categories',
    'Rich Content',
    'Post Page URL',
    'Last Published Date',
    'Internal ID'
];

const paragraph = (text, url) => ({
    type: 'PARAGRAPH',
    nodes: [
        {
            type: 'TEXT',
            textData: {text, decorations: url ? [{type: 'LINK', linkData: {link: {url}}}] : []}
        }
    ]
});

const post = (id, values = {}) => ({
    Author: 'Jane Writer',
    'Main Category': 'News',
    Title: `Title ${id}`,
    ID: id,
    Featured: 'FALSE',
    Slug: id,
    'Plain Content': `Body ${id}`,
    'Published Date': '2025-01-01T00:00:00Z',
    'Rich Content': JSON.stringify({nodes: [paragraph('Read the next one', `${SITE}/post/second`)]}),
    'Post Page URL': `/post/${id}`,
    'Internal ID': `internal-${id}`,
    ...values
});

/** Write a Wix posts CSV of `rows` to `path`. */
async function writeCsv(path, rows) {
    await mkdir(dirname(path), {recursive: true});
    const lines = rows.map(values =>
        COLUMNS.map(column => `"${String(values[column] ?? '').replace(/"/g, '""')}"`).join(',')
    );
    await writeFile(path, `${[COLUMNS.join(','), ...lines].join('\n')}\n`);
}

async function setup(rows = [post('first'), post('second')]) {
    const directory = await mkdtemp(join(tmpdir(), 'wix-csv-cli-'));
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

const GHOST_KEY = '0123456789abcdef01234567:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

describe('Wix CSV context pipeline', () => {
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
            await writeCsv(fx.posts, [post('third', {'Published Date': 'never'})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Wix post was invalid/
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
        const fx = await setup([post('first'), post('second'), post('bad', {'Published Date': 'never'})]);
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
            assert.match(first.outputName, /^gh-wix-csv-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(
                report.events.some(
                    event => event.details.reason === 'Published row has no valid Published Date or Last Published Date'
                )
            );

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const {data} = imports['ghost-import-1.json'];
            const [firstPost] = data.posts;
            assert.equal(firstPost.slug, 'first');
            assert.equal(firstPost.title, 'Title first');
            assert.equal(firstPost.status, 'published');
            assert.equal(firstPost.comment_id, 'internal-first');
            assert.equal(firstPost.html, '<p><a href="/second/">Read the next one</a></p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2025-01-01T00:00:00.000Z');
            assert.deepEqual(
                data.tags.map(tag => [tag.name, tag.slug]),
                [
                    ['News', 'news'],
                    ['#wix', 'hash-wix']
                ]
            );
            assert.deepEqual(
                data.users.map(user => [user.name, user.slug, user.email]),
                [['Jane Writer', 'jane-writer', 'jane-writer@example.com']]
            );

            // A second run maps the stored records again, even when the CSV has gone.
            await rm(fx.posts);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false});
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

            // Mapping options apply to the stored rows without a new read.
            const remapped = {};
            await source.getTaskRunner({...fx.options, zip: false, includeMainCategory: false}).run(remapped);
            assert.deepEqual(
                (await imported(remapped)).tags.map(tag => tag.slug),
                ['hash-wix']
            );

            // --rereadSource reads the CSV again and replaces the stored source.
            const missing = {};
            const missingRunner = source.getTaskRunner({...fx.options, zip: false, rereadSource: true});
            await assert.rejects(missingRunner.run(missing), /ENOENT/);
            assert.equal(missingRunner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(missing.failedReport)).size > 0);
            closed(missing);
            await writeCsv(fx.posts, [post('fourth'), post('fifth', {Author: ''})]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 2);
            const rereadData = await imported(refreshed);
            assert.deepEqual(
                rereadData.posts.map(item => item.slug),
                ['fourth', 'fifth']
            );
            assert.deepEqual(
                rereadData.users.map(user => user.name),
                ['Jane Writer', 'Author']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps CSVs that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherCsv = join(fx.directory, 'other', 'posts.csv');
            await writeCsv(otherCsv, [post('other')]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, posts: otherCsv}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'wix-csv-posts');
            assert.deepEqual(
                (await imported(two)).posts.map(item => item.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected post is invalid', async () => {
        const fx = await setup([post('first', {'Published Date': 'never', 'Last Published Date': ''})]);
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(
                report.events.some(
                    event => event.details.reason === 'Published row has no valid Published Date or Last Published Date'
                )
            );
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('dates a draft without dates when the CSV was read, keeping that date until it is read again', async () => {
        const fx = await setup([post('draft', {'Published Date': '', 'Last Published Date': '', Author: ''})]);
        try {
            const first = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(first);
            assert.deepEqual(first.summary, {selected: 1, imported: 1, skipped: 0});
            const [draft] = (await imported(first)).posts;
            assert.equal(draft.status, 'draft');
            assert.equal(draft.published_at, null);
            assert.ok(Date.parse(draft.created_at) <= Date.now());
            assert.equal(draft.updated_at, draft.created_at);
            assert.deepEqual(
                (await imported(first)).users.map(user => user.name),
                ['Author']
            );

            await new Promise(resolve => setTimeout(resolve, 5));
            const reused = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(reused);
            assert.equal((await imported(reused)).posts[0].created_at, draft.created_at);

            const reread = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(reread);
            assert.ok(Date.parse((await imported(reread)).posts[0].created_at) > Date.parse(draft.created_at));
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats a CSV without rows as a valid import', async () => {
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

    it('downloads Wix static media with counted sub-tasks', async () => {
        const fx = await setup([
            post('first', {
                'Cover Image': 'wix:image://v1/cover~mv2.jpg/cover.jpg#originWidth=10&originHeight=10',
                'Rich Content': JSON.stringify({
                    nodes: [
                        paragraph('Intro'),
                        {type: 'IMAGE', imageData: {image: {src: {id: 'body~mv2.jpg'}}, altText: 'A photo'}}
                    ]
                })
            }),
            post('plain', {'Rich Content': JSON.stringify({nodes: [paragraph('No images here.')]})})
        ]);
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const images = nock('https://static.wixstatic.com')
            .get('/media/cover~mv2.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'})
            .get('/media/body~mv2.jpg')
            .reply(200, imageBytes, {'Content-Type': 'image/jpeg'});
        try {
            const context = {};
            const runner = source.getTaskRunner({...fx.options, zip: false, scrape: ['assets']});
            await runner.run(context);
            assert.ok(images.isDone());
            const assets = runner.tasks.find(task => task.title === 'Fetch images via AssetScraper');
            assert.deepEqual(
                assets.subtasks.map(subtask => [subtask.title, subtask.output]),
                [
                    ['Posts (2/2)', null],
                    ['Tags (2/2)', null],
                    ['Authors (1/1)', null]
                ]
            );
            const item = (await imported(context)).posts.find(entry => entry.slug === 'first');
            assert.match(item.feature_image, /^__GHOST_URL__\/content\/images\/.*cover/);
            assert.match(item.html, /src="__GHOST_URL__\/content\/images\/[^"]*body[^"]*"/);
            assert.doesNotMatch(item.html, /static\.wixstatic\.com/);
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
                        slug: 'jane',
                        name: 'Jane Existing',
                        email: 'Jane-Writer@Example.com',
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
                    ghostAdminKey: GHOST_KEY
                })
                .run(context);
            assert.ok(request.isDone());
            const data = await imported(context);
            assert.deepEqual(
                data.users.map(user => [user.id, user.slug, user.roles]),
                [['0123456789abcdef01234567', 'jane', ['Editor']]]
            );
            assert.ok(data.posts_authors.every(link => link.author_id === '0123456789abcdef01234567'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('warns and keeps the CSV authors when Ghost users cannot be fetched', async () => {
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
                    ghostAdminKey: GHOST_KEY
                })
                .run(context);
            assert.ok(request.isDone());
            assert.equal(context.summary.imported, 2);
            assert.deepEqual(
                (await imported(context)).users.map(user => user.email),
                ['jane-writer@example.com']
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
