import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {Readable} from 'node:stream';
import nock from 'nock';
import fsUtils from '@tryghost/mg-fs-utils';
import source from '../sources/buttondown.js';
import command from '../commands/buttondown.js';

const SITE = 'https://example.com';

const email = (id, values = {}) => ({
    id,
    subject: `Title ${id}`,
    publish_date: '2024-01-01 00:00:00+00:00',
    slug: id,
    ...values
});

/** Write a Buttondown export zip listing `emails` in emails.json, with a body for each slug in `bodies`. */
async function writeExport(path, emails, bodies = Object.fromEntries(emails.map(item => [item.slug, null]))) {
    const content = await mkdtemp(join(tmpdir(), 'buttondown-export-'));
    try {
        await mkdir(join(content, 'emails'), {recursive: true});
        await writeFile(join(content, 'emails.json'), JSON.stringify(emails));
        for (const [slug, body] of Object.entries(bodies)) {
            await writeFile(join(content, 'emails', `${slug}.md`), body ?? `Read the [next one](${SITE}/second).`);
        }
        await mkdir(dirname(path), {recursive: true});
        await rm(path, {force: true});
        await fsUtils.zip.write(dirname(path), content, path.split('/').pop());
    } finally {
        await rm(content, {recursive: true, force: true});
    }
}

async function setup(emails = [email('first'), email('second')], bodies = undefined) {
    const directory = await mkdtemp(join(tmpdir(), 'buttondown-cli-'));
    const pathToZip = join(directory, 'input', 'export.zip');
    await writeExport(pathToZip, emails, bodies);
    return {
        directory,
        pathToZip,
        options: {
            pathToZip,
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

describe('Buttondown context pipeline', () => {
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
            await writeExport(fx.pathToZip, [email('third', {publish_date: 'never'})]);
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, report: false, rereadSource: true}).run(failed),
                /Every selected Buttondown email was invalid/
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
        const fx = await setup([email('first'), email('second'), email('bad', {publish_date: 'never'})]);
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
            assert.match(first.outputName, /^gh-buttondown-test-\d+\.zip$/);

            const report = JSON.parse(await readFile(first.reportFile.path, 'utf8'));
            assert.equal(report.summary.status, 'complete');
            assert.equal(report.summary.warnings, 1);
            assert.ok(report.events.some(event => event.details.reason === 'Invalid Buttondown publish date'));

            const imports = zipImports(first.outputFile.path);
            assert.deepEqual(Object.keys(imports).sort(), ['ghost-import-1.json', 'ghost-import-2.json']);
            const {data} = imports['ghost-import-1.json'];
            const [firstPost] = data.posts;
            assert.equal(firstPost.slug, 'first');
            assert.equal(firstPost.title, 'Title first');
            assert.equal(firstPost.status, 'published');
            assert.equal(firstPost.html, '<p>Read the <a href="/second/">next one</a>.</p>');
            assert.equal(firstPost.lexical, undefined);
            assert.equal(firstPost.published_at, '2024-01-01T00:00:00.000Z');
            assert.deepEqual(
                data.tags.map(tag => [tag.name, tag.slug]),
                [['#buttondown', 'hash-buttondown']]
            );
            assert.deepEqual(data.users, []);

            // A second run maps the stored records again, even when the export has gone.
            await rm(fx.pathToZip);
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

            // --rereadSource reads the export again and replaces the stored source.
            const missing = {};
            const missingRunner = source.getTaskRunner({...fx.options, zip: false, rereadSource: true});
            await assert.rejects(missingRunner.run(missing), /Unable to read zip file/);
            assert.equal(missingRunner.tasks.find(task => task.title === 'Fetching content').hasFailed(), true);
            assert.ok((await stat(missing.failedReport)).size > 0);
            closed(missing);
            await writeExport(fx.pathToZip, [email('fourth'), email('fifth')], {fourth: 'Fourth'});
            const refreshed = {};
            await source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(refreshed);
            assert.equal(refreshed.summary.imported, 2);
            // The email without a body is imported with empty HTML and a warning.
            assert.equal(refreshed.warningCount, 1);
            const rereadData = await imported(refreshed);
            assert.deepEqual(
                rereadData.posts.map(post => [post.slug, post.html]),
                [
                    ['fourth', '<p>Fourth</p>'],
                    ['fifth', '']
                ]
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('rejects a reread of an export whose emails have no bodies, keeping the stored source', async () => {
        const fx = await setup();
        try {
            await source.getTaskRunner({...fx.options, zip: false}).run({});
            await rm(fx.pathToZip);
            const content = await mkdtemp(join(tmpdir(), 'buttondown-export-'));
            await writeFile(join(content, 'emails.json'), JSON.stringify([email('only')]));
            await fsUtils.zip.write(dirname(fx.pathToZip), content, 'export.zip');
            await rm(content, {recursive: true, force: true});
            const failed = {};
            await assert.rejects(
                source.getTaskRunner({...fx.options, zip: false, rereadSource: true}).run(failed),
                /No email bodies/
            );
            const kept = {};
            await source.getTaskRunner({...fx.options, zip: false}).run(kept);
            assert.deepEqual(
                (await imported(kept)).posts.map(post => post.slug),
                ['first', 'second']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('keeps exports that share a file name in separate workspaces', async () => {
        const fx = await setup();
        try {
            const otherZip = join(fx.directory, 'other', 'export.zip');
            await writeExport(otherZip, [email('other')]);
            const options = {...fx.options, cacheName: null, zip: false};
            const one = {};
            await source.getTaskRunner(options).run(one);
            const two = {};
            await source.getTaskRunner({...options, pathToZip: otherZip}).run(two);
            assert.notEqual(one.fileCache.cacheDir, two.fileCache.cacheDir);
            assert.equal(one.fileCache.cacheName, 'buttondown-export');
            assert.deepEqual(
                (await imported(two)).posts.map(post => post.slug),
                ['other']
            );
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('writes a failed report when every selected email is invalid', async () => {
        const fx = await setup([email('first', {slug: ''})], {first: 'Body'});
        try {
            const invalid = {};
            await assert.rejects(source.getTaskRunner(fx.options).run(invalid), /Every selected/);
            const report = JSON.parse(await readFile(invalid.failedReport, 'utf8'));
            assert.equal(report.summary.status, 'failed');
            assert.ok(report.events.some(event => event.type === 'operation:failed'));
            assert.ok(report.events.some(event => event.details.reason === 'Email has no slug'));
            assert.equal(invalid.outputFile, undefined);
            closed(invalid);
        } finally {
            await rm(fx.directory, {recursive: true, force: true});
        }
    });

    it('treats an export without emails as a valid import', async () => {
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

    it('downloads Buttondown assets with counted sub-tasks', async () => {
        const fx = await setup([email('first'), email('plain')], {
            first: '![A photo](https://assets.buttondown.email/images/photo.jpg)',
            plain: 'No images here.'
        });
        const imageBytes = await readFile(
            new URL('../../mg-assetscraper-db/src/test/fixtures/image.jpg', import.meta.url)
        );
        nock.disableNetConnect();
        const image = nock('https://assets.buttondown.email')
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
                    ['Authors (0/0)', null]
                ]
            );
            const post = (await imported(context)).posts.find(item => item.slug === 'first');
            assert.match(
                post.html,
                /src="__GHOST_URL__\/content\/images\/assets-buttondown-email\/images\/photo\.jpg"/
            );
            closed(context);
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
