import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/curated.js';
import command from '../commands/curated.js';

const IMAGE = 'a174e606-7a19-4c86-9f18-1c528a54643a.png';
const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
);
const fixture = JSON.parse(
    await readFile(new URL('../../mg-curated-export/src/test/fixtures/12.json', import.meta.url), 'utf8')
);

/** An issue like the fixture, numbered `number`, whose first link points at issue 12. */
const issue = (number, values = {}) => {
    const item = structuredClone(fixture);
    item.categories[0].items[1].url = 'https://example.com/issues/12';
    return {...item, number, title: `Issue ${number}`, url: `https://example.com/issues/${number}`, ...values};
};

/** Write a Curated export zip holding `issues`, with the fixture's image (and its resized copy) beside issue 12. */
async function writeExport(path, issues) {
    const content = await mkdtemp(join(tmpdir(), 'curated-export-'));
    try {
        const published = join(content, 'data-export', 'issues', 'published');
        await mkdir(published, {recursive: true});
        for (const item of issues) {
            await mkdir(join(published, String(item.number)), {recursive: true});
            await writeFile(join(published, String(item.number), `${item.number}.json`), JSON.stringify(item));
            if (item.number === 12) {
                await writeFile(join(published, '12', IMAGE), PNG);
                await writeFile(join(published, '12', `square_thumb_${IMAGE}`), PNG);
            }
        }
        await writeFile(join(content, 'data-export', 'subscribers.csv'), 'email\nperson@example.com\n');
        await mkdir(dirname(path), {recursive: true});
        await rm(path, {force: true});
        await fsUtils.zip.write(dirname(path), content, path.split('/').pop());
    } finally {
        await rm(content, {recursive: true, force: true});
    }
}

async function setup(issues = [issue(12), issue(13)]) {
    const directory = await mkdtemp(join(tmpdir(), 'curated-cli-'));
    const pathToZip = join(directory, 'input', 'export.zip');
    await writeExport(pathToZip, issues);
    return {
        directory,
        pathToZip,
        options: {
            pathToZip,
            name: 'Jane Editor',
            email: 'jane@example.com',
            tag: 'Newsletter',
            tmpPath: directory,
            outputPath: directory,
            cacheName: 'test',
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
    return {imports, files: files.sort()};
}

const imported = async context =>
    JSON.parse(await readFile(join(context.importDirectory, 'ghost-import.json'), 'utf8')).data;

describe('Curated context pipeline', () => {
    it('registers rereading, chunking, cache naming and report options', () => {
        assert.equal(command.defaults.rereadSource, false);
        assert.equal(command.defaults.postsPerFile, 2000);
        assert.equal(command.defaults.cacheName, null);
        assert.equal(command.defaults.tmpPath, null);
        assert.equal(command.defaults.outputPath, null);
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
            assert.equal(context.warningCount, 1);
            await writeExport(fx.pathToZip, [issue(14, {published_at: 'never'})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Curated issue was invalid/
            );
            assert.equal(failed.failedReport, undefined);
            closed(failed);
            assert.deepEqual(
                (await readdir(fx.directory)).filter(name => name.endsWith('.json')),
                []
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes linked HTML chunks, images, a report and a ZIP, then remaps stored records without reading', async () => {
        const fx = await setup([issue(12), issue(13), issue(15, {url: undefined})]);
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
            assert.match(first.outputName, /^gh-curated-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            // The skipped issue, and issue 13's sponsor image, which its directory does not hold.
            assert.equal(report.summary.warnings, 2);
            assert.ok(report.events.some(event => event.details.reason === 'Issue has no valid URL'));
            assert.ok(report.events.some(event => event.details.reason === 'Image not found in the export'));

            const {imports, files} = zipContents(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            // The original image and its optimized copy; resized copies and other files are not imported.
            assert.deepEqual(files, [
                `content/images/12/${IMAGE}`,
                `content/images/12/${IMAGE.replace('.png', '_o.png')}`
            ]);
            const {data} = imports['ghost-import-1.json'];
            const [post] = data.posts;
            assert.equal(post.slug, '12');
            assert.equal(post.title, 'Issue 12');
            assert.equal(post.status, 'published');
            assert.equal(post.lexical, undefined);
            assert.equal(post.published_at, '2021-02-02T21:08:42.000Z');
            assert.match(post.html, new RegExp(`src="/content/images/12/${IMAGE}"`));
            // Links to other migrated issues point at their new paths.
            assert.match(post.html, /<h3><a href="\/12\/">This is a search engine<\/a><\/h3>/);
            assert.deepEqual(
                data.tags.map(tag => [tag.name, tag.slug]),
                [
                    ['Newsletter', 'newsletter'],
                    ['#curated', 'hash-curated']
                ]
            );
            assert.deepEqual(
                data.users.map(user => [user.name, user.slug, user.email]),
                [['Jane Editor', 'jane-editor', 'jane@example.com']]
            );

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToZip);
            const reused = {};
            const reusedRunner = source.getTaskRunner({...fx.options, zip: false, tag: false});
            await reusedRunner.run(reused);
            assert.equal(reusedRunner.tasks.find(task => task.title === 'Fetching content').output, null);
            assert.equal(reused.summary.imported, 2);
            const result = await imported(reused);
            assert.equal(result.posts[0].id, post.id);
            assert.deepEqual(
                result.tags.map(tag => tag.name),
                ['#curated']
            );
            assert.equal(
                (await readdir(reused.importDirectory)).some(name => /^ghost-import-\d+\.json$/.test(name)),
                false
            );
            assert.ok((await stat(join(reused.importDirectory, 'content', 'images', '12', IMAGE))).size > 0);
            assert.ok(reused.reportFile.path.startsWith(reused.fileCache.cacheDir));

            // --rereadSource reads the export again and replaces the stored source.
            const missing = {};
            const missingRunner = source.getTaskRunner({...fx.options, zip: false, rereadSource: true});
            await assert.rejects(missingRunner.run(missing), /Unable to read zip file/);
            assert.equal(missingRunner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(missing.failedReport)).size > 0);
            closed(missing);
            await writeExport(fx.pathToZip, [issue(20), issue(21)]);
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 2);
            assert.deepEqual(
                (await imported(refreshed)).posts.map(item => item.slug),
                ['20', '21']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects a reread of an export without published issues, keeping the stored source', async () => {
        const fx = await setup();
        try {
            await source.getTaskRunner({...fx.options, zip: false}).run({});
            await writeExport(fx.pathToZip, []);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(failed),
                /No published Curated issues found/
            );
            const kept = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(kept);
            assert.deepEqual(
                (await imported(kept)).posts.map(post => post.slug),
                ['12', '13']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherZip = join(fx.directory, 'other', 'export.zip');
            await writeExport(otherZip, [issue(30)]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, pathToZip: otherZip}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'curated-export');
            assert.deepEqual(
                (await imported(two)).posts.map(post => post.slug),
                ['30']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected issue is invalid', async () => {
        const fx = await setup([issue(12, {url: 'not a url'})]);
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Issue has no valid URL'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
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

    it('matches the author to a Ghost user by email', async () => {
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
                        email: 'Jane@Example.com',
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

    it('warns and keeps the configured author when Ghost users cannot be fetched', async () => {
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
