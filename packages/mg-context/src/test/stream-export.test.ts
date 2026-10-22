import assert from 'node:assert/strict';
import {describe, it, mock, type TestContext} from 'node:test';
import {mkdtemp, open, readFile, readdir, rm, stat, writeFile, mkdir, rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MigrateContext, PostContext, TagContext, AuthorContext, type WrittenFile} from '../index.js';

async function setup(t: TestContext, emitEvents = true) {
    const directory = await mkdtemp(join(tmpdir(), 'mg-stream-'));
    const ctx = new MigrateContext({storage: 'memory', emitEvents});
    await ctx.init();
    t.after(async () => {
        mock.restoreAll();
        await ctx.close();
        await rm(directory, {recursive: true, force: true});
    });
    return {ctx, directory};
}

async function files(stream: AsyncIterable<WrittenFile>): Promise<WrittenFile[]> {
    const output: WrittenFile[] = [];
    for await (const file of stream) {
        output.push(file);
    }
    return output;
}

function add(ctx: MigrateContext, index: number): void {
    const post = new PostContext();
    post.set('title', `Post ${index}`);
    post.set('slug', `post-${index}`);
    post.set('html', `<p>${index}</p>`);
    post.set('created_at', new Date('2026-01-01T00:00:00Z'));
    post.addTag(new TagContext({name: `Tag ${index}`, slug: `tag-${index}`}));
    post.addAuthor(
        new AuthorContext({name: `Author ${index}`, slug: `author-${index}`, email: `author-${index}@example.com`})
    );
    if (index % 2 === 0) {
        post.set('meta_title', `SEO ${index}`);
    }
    post.save(ctx.db);
}

describe('bounded output', () => {
    it('uses the same formatted Ghost output and filename rules for both JSON APIs', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        add(ctx, 1);
        t.mock.method(Date, 'now', () => 1767225600000);
        const options = {filename: 'Export.v1 (ä).JSON', batchSize: 1};
        const legacy = await ctx.writeGhostJson(join(directory, 'array'), options);
        const streamed = await files(ctx.writeGhostJsonStream(join(directory, 'stream'), options));
        assert.deepEqual(
            legacy.map(file => file.name),
            ['Export.v1 (ä)-1.json', 'Export.v1 (ä)-2.json']
        );
        assert.deepEqual(
            streamed.map(file => file.name),
            legacy.map(file => file.name)
        );
        for (let index = 0; index < legacy.length; index += 1) {
            const actual = await readFile(legacy[index].path, 'utf8');
            assert.equal(actual, await readFile(streamed[index].path, 'utf8'));
            assert.ok(actual.startsWith('{\n  "meta": {'));
            assert.equal(legacy[index].size, Buffer.byteLength(actual));
        }
        const [single] = await files(ctx.writeGhostJsonStream(join(directory, 'stream'), {...options, batchSize: 5}));
        assert.equal(single.name, 'Export.v1 (ä).json');
        for (const file of streamed) {
            assert.ok((await stat(file.path)).isFile());
        }
    });

    it('cleans temporary files when an array export callback throws after a file completes', async t => {
        const {ctx, directory} = await setup(t);
        await assert.rejects(
            ctx.writeGhostJson(directory, {
                onWrite() {
                    throw new Error('callback failed');
                }
            }),
            /callback failed/
        );
        assert.equal(JSON.parse(await readFile(join(directory, 'posts.json'), 'utf8')).data.posts.length, 0);
        assert.equal(
            (await readdir(directory)).some(name => name.endsWith('.tmp')),
            false
        );
    });

    it('streams empty exports with existing defaults, callbacks, and completed-file events', async t => {
        const {ctx, directory} = await setup(t);
        const events: WrittenFile[] = [];
        ctx.on('export:file-written', value => events.push(value));
        const [file] = await files(ctx.writeGhostJsonStream(directory));
        assert.equal(file.name, 'posts.json');
        assert.equal(file.posts, 0);
        assert.equal(file.size, (await stat(file.path)).size);
        assert.deepEqual(events, [file]);
        assert.deepEqual(JSON.parse(await readFile(file.path, 'utf8')).data, {
            posts: [],
            tags: [],
            users: [],
            posts_tags: [],
            posts_authors: [],
            posts_meta: []
        });
        const callbacks: WrittenFile[] = [];
        await files(ctx.writeGhostJsonStream(directory, {onWrite: file => callbacks.push(file)}));
        assert.equal(callbacks.length, 1);
    });

    it('streams filtered Ghost data and metadata without changing legacy exports', async t => {
        const {ctx, directory} = await setup(t);
        for (let index = 0; index < 5; index += 1) {
            add(ctx, index);
        }
        const filter = {tag: {slug: 'tag-2'}, author: {email: 'author-2@example.com'}};
        const [file] = await files(ctx.writeGhostJsonStream(directory, {filter, batchSize: 2}));
        const parsed = JSON.parse(await readFile(file.path, 'utf8'));
        const [legacyFile] = await ctx.writeGhostJson(join(directory, 'legacy'), {filter});
        const legacy = JSON.parse(await readFile(legacyFile.path, 'utf8'));
        assert.deepEqual(parsed.data, legacy.data);
        assert.equal(parsed.data.posts[0].title, 'Post 2');
        assert.equal(parsed.data.posts_meta[0].meta_title, 'SEO 2');
        const callbacks: WrittenFile[] = [];
        const exported = await files(
            ctx.writeGhostJsonStream(directory, {batchSize: 2, onWrite: file => callbacks.push(file)})
        );
        assert.deepEqual(
            exported.map(value => value.posts),
            [2, 2, 1]
        );
        assert.deepEqual(callbacks, exported);
    });

    it('batches large relation queries independently of output chunk size', async t => {
        const {ctx, directory} = await setup(t);
        await ctx.transaction(() => {
            for (let index = 0; index < 1101; index += 1) {
                add(ctx, index);
            }
        });
        const [file] = await files(ctx.writeGhostJsonStream(directory, {batchSize: 1101}));
        const {data} = JSON.parse(await readFile(file.path, 'utf8'));
        assert.equal(data.posts.length, 1101);
        assert.equal(data.tags.length, 1101);
        assert.equal(data.users.length, 1101);
        assert.equal(data.posts_tags.length, 1101);
        assert.equal(data.posts_authors[1100].sort_order, 1);
    });

    it('lets consumers remove previous outputs through returned descriptors', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        add(ctx, 1);
        add(ctx, 2);
        const previous = await files(ctx.writeGhostJsonStream(directory, {batchSize: 1}));
        for (const file of previous) {
            await rm(file.path);
        }
        await files(ctx.writeGhostJsonStream(directory));
        assert.deepEqual(await readdir(directory), ['posts.json']);
        const stream = ctx.writeGhostJsonStream(directory, {batchSize: 1});
        await stream.next();
        await stream.return(undefined);
        assert.equal(
            (await readdir(directory)).some(name => name.startsWith('.mg-context-')),
            false
        );
    });

    it('validates streaming options and supports disabled events', async t => {
        const {ctx, directory} = await setup(t, false);
        for (const options of [{batchSize: 0}, {batchSize: 1.5}]) {
            await assert.rejects(files(ctx.writeGhostJsonStream(directory, options)), /positive integer/);
        }
        for (const filename of ['../escape', 'nested\\export', '']) {
            await assert.rejects(files(ctx.writeGhostJsonStream(directory, {filename})), /non-empty base filename/);
        }
        let events = 0;
        ctx.on('export:file-written', () => {
            events += 1;
        });
        await files(ctx.writeGhostJsonStream(directory));
        assert.equal(events, 0);
        await assert.rejects(ctx.prepareForExport({batchSize: 0}), /positive/);
    });

    it('streams report summaries and complete provenance references', async t => {
        const {ctx, directory} = await setup(t);
        await ctx.sources.ingest({}, stage => {
            const record = stage.put({kind: 'post', key: '1', content: 'original', format: 'text'});
            stage.recordDiagnostic('source:warning', {line: 3}, record.id);
        });
        add(ctx, 0);
        ctx.recordDiagnostic('mapping:warning', {reason: 'example'}, ctx.sources.get('post', '1')!.id);
        const report = join(directory, 'report.json');
        await ctx.writeMigrationReport(report, {status: 'success'});
        const data = JSON.parse(await readFile(report, 'utf8'));
        assert.equal(data.summary.status, 'success');
        assert.equal(data.summary.diagnostics['source:warning'], 1);
        assert.equal(data.events[0].phase, 'ingestion');
        assert.ok(data.events[0].ingestionId);
        assert.ok(data.events.at(-1).sourceRecordId);
        const clean = new MigrateContext({storage: 'memory'});
        await clean.init();
        try {
            await clean.writeMigrationReport(report);
            assert.deepEqual(JSON.parse(await readFile(report, 'utf8')), {summary: {diagnostics: {}}, events: []});
        } finally {
            await clean.close();
        }
    });

    it('handles omitted summary fields and rejects summaries that do not serialize to objects', async t => {
        const {ctx, directory} = await setup(t);
        const report = join(directory, 'report.json');
        await ctx.writeMigrationReport(report, {optional: undefined});
        const before = await readFile(report, 'utf8');
        assert.deepEqual(JSON.parse(before), {summary: {diagnostics: {}}, events: []});
        for (const invalid of [null, [], {toJSON: () => undefined}]) {
            await assert.rejects(ctx.writeMigrationReport(report, invalid as any), /serialize to a JSON object/);
            assert.equal(await readFile(report, 'utf8'), before);
        }
        assert.deepEqual(await readdir(directory), ['report.json']);
    });

    it('cleans report temporaries after serialization and publication failures', async t => {
        const {ctx, directory} = await setup(t);
        await assert.rejects(ctx.writeMigrationReport(join(directory, 'invalid.json'), {invalid: BigInt(1)}), /BigInt/);
        const target = join(directory, 'a-directory');
        await mkdir(target);
        await assert.rejects(ctx.writeMigrationReport(target), /directory/);
        assert.deepEqual(
            (await readdir(directory)).filter(name => name.endsWith('.tmp')),
            []
        );
    });

    it('preserves an existing file and closes handles when replacement content fails', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        const target = join(directory, 'posts.json');
        await writeFile(target, 'previous complete export');
        const probe = await open(join(directory, 'probe'), 'w');
        const prototype = Object.getPrototypeOf(probe);
        const write = prototype.writeFile;
        await probe.close();
        const intercepted = t.mock.method(
            prototype,
            'writeFile',
            async function (this: any, value: string, ...args: any[]) {
                if (value.includes('"meta"')) {
                    throw new Error('forced write failure');
                }
                return write.call(this, value, ...args);
            }
        );
        await assert.rejects(files(ctx.writeGhostJsonStream(directory)), /forced write failure/);
        intercepted.mock.restore();
        assert.equal(await readFile(target, 'utf8'), 'previous complete export');
        assert.deepEqual((await readdir(directory)).sort(), ['posts.json', 'probe']);
        await files(ctx.writeGhostJsonStream(directory));
        assert.equal(JSON.parse(await readFile(target, 'utf8')).data.posts.length, 1);
    });

    it('propagates publication errors without leaking temporary files', async t => {
        const {ctx, directory} = await setup(t);
        await mkdir(join(directory, 'posts.json'));
        await assert.rejects(files(ctx.writeGhostJsonStream(directory)), /directory/);
        assert.deepEqual(await readdir(directory), ['posts.json']);
    });

    it('validates filters and counts before writing files', async t => {
        const {ctx, directory} = await setup(t);
        await assert.rejects(
            files(ctx.writeGhostJsonStream(directory, {filter: {createdAt: {after: new Date(NaN)}}})),
            RangeError
        );
        assert.deepEqual(await readdir(directory), []);
        await assert.rejects(files(ctx.writeGhostJsonStream(directory, {filename: 'x'.repeat(300)})));
        const prepare = ctx.db.db.prepare;
        const intercepted = t.mock.method(ctx.db.db, 'prepare', function (this: any, sql: string) {
            if (sql === 'SELECT COUNT(*) AS count, MAX(id) AS max_id FROM Posts ') {
                throw new Error('count failed');
            }
            return prepare.call(this, sql);
        });
        await assert.rejects(files(ctx.writeGhostJsonStream(directory)), /count failed/);
        intercepted.mock.restore();
        assert.deepEqual(await readdir(directory), []);
    });

    it('retains completed batches and preserves the previous incomplete target when a later batch fails', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        add(ctx, 1);
        add(ctx, 2);
        const original = await ctx.writeGhostJson(directory, {batchSize: 1});
        const before = await Promise.all(original.map(file => readFile(file.path, 'utf8')));
        ctx.updatePostData(1, {title: 'New title'});
        const convert = PostContext.toGhostPost;
        t.mock.method(PostContext, 'toGhostPost', (row: any) => {
            if (row.id === 2) {
                throw new Error('second batch failed');
            }
            return convert(row);
        });
        const completed: WrittenFile[] = [];
        await assert.rejects(
            ctx.writeGhostJson(directory, {batchSize: 1, onWrite: file => completed.push(file)}),
            /second batch failed/
        );
        assert.deepEqual(
            completed.map(file => file.name),
            ['posts-1.json']
        );
        assert.equal(JSON.parse(await readFile(original[0].path, 'utf8')).data.posts[0].title, 'New title');
        assert.equal(await readFile(original[1].path, 'utf8'), before[1]);
        assert.equal(await readFile(original[2].path, 'utf8'), before[2]);
        assert.deepEqual((await readdir(directory)).sort(), ['posts-1.json', 'posts-2.json', 'posts-3.json']);
    });

    it('leaves earlier completed files for the consumer when a later target is a directory', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        add(ctx, 1);
        await mkdir(join(directory, 'posts-2.json'));
        await assert.rejects(files(ctx.writeGhostJsonStream(directory, {batchSize: 1})), /directory/);
        assert.equal(JSON.parse(await readFile(join(directory, 'posts-1.json'), 'utf8')).data.posts.length, 1);
        assert.deepEqual((await readdir(directory)).sort(), ['posts-1.json', 'posts-2.json']);
    });

    it('leaves interrupted-run metadata and backups to the consumer', async t => {
        const {ctx, directory} = await setup(t);
        const runId = randomUUID();
        const journal = join(directory, `.mg-context-export-posts.${runId}.rollback`);
        const backup = join(directory, `posts.json.${runId}.bak`);
        await writeFile(journal, 'consumer-owned recovery data');
        await writeFile(backup, 'previous backup');
        const [file] = await files(ctx.writeGhostJsonStream(directory));
        assert.equal(JSON.parse(await readFile(file.path, 'utf8')).data.posts.length, 0);
        assert.equal(await readFile(journal, 'utf8'), 'consumer-owned recovery data');
        assert.equal(await readFile(backup, 'utf8'), 'previous backup');
        assert.deepEqual(
            (await readdir(directory)).sort(),
            [journal.split('/').at(-1)!, 'posts.json', backup.split('/').at(-1)!].sort()
        );
    });

    it('excludes posts added by per-file callbacks after export starts', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        add(ctx, 1);
        const exported = await ctx.writeGhostJson(directory, {
            batchSize: 1,
            onWrite(file) {
                if (file.name === 'posts-1.json') {
                    add(ctx, 2);
                }
            }
        });
        assert.equal(exported.length, 2);
        assert.equal(
            exported.reduce((sum, file) => sum + file.posts, 0),
            2
        );
        assert.equal(ctx.db.db.prepare('SELECT COUNT(*) AS count FROM Posts').get()!.count, 3);
    });

    it('creates no ownership metadata for JSON, CSV, tag, or author exports', async t => {
        const {ctx, directory} = await setup(t);
        add(ctx, 0);
        await ctx.writeGhostJson(directory);
        await ctx.writeGhostCSV(directory);
        const tags = await ctx.writeGhostTagsJson(directory);
        const users = await ctx.writeGhostUsersJson(directory);
        await ctx.writeGhostTagsJson(directory, {filename: 'renamed-tags'});
        await ctx.writeGhostUsersJson(directory, {filename: 'renamed-users'});
        assert.ok((await stat(tags.path)).isFile());
        assert.ok((await stat(users.path)).isFile());
        assert.deepEqual((await readdir(directory)).sort(), [
            'posts.csv',
            'posts.json',
            'renamed-tags.json',
            'renamed-users.json',
            'tags.json',
            'users.json'
        ]);
    });

    it('reuses canonical entities after many intervening records and permits explicit updates', async t => {
        const {ctx} = await setup(t);
        const tag = new TagContext({name: 'Original', slug: 'tag'});
        tag.save(ctx.db);
        const author = new AuthorContext({name: 'Original', slug: 'author', email: 'a@example.com'});
        author.save(ctx.db);
        for (let index = 0; index < 130; index += 1) {
            new TagContext({name: `Tag ${index}`, slug: `tag-${index}`}).save(ctx.db);
            new AuthorContext({name: `Author ${index}`, slug: `author-${index}`, email: `a${index}@example.com`}).save(
                ctx.db
            );
        }
        const duplicate = new TagContext({name: 'Discarded', slug: 'tag'});
        duplicate.save(ctx.db);
        const duplicateAuthor = new AuthorContext({name: 'Discarded', slug: 'author', email: 'other@example.com'});
        duplicateAuthor.save(ctx.db);
        assert.equal(duplicate.data.name, 'Original');
        assert.equal(duplicate.ghostId, tag.ghostId);
        assert.equal(duplicateAuthor.data.email, 'a@example.com');
        assert.equal(duplicateAuthor.ghostId, author.ghostId);
        tag.set('name', 'Updated');
        tag.save(ctx.db);
        author.set('name', 'Updated');
        author.save(ctx.db);
        assert.equal((await ctx.findTags({slug: 'tag', scope: 'all'}))![0].data.name, 'Updated');
        assert.equal((await ctx.findAuthors({slug: 'author', scope: 'all'}))![0].data.name, 'Updated');
    });

    it('reads current database state after entity renames or deletion', async t => {
        const {ctx} = await setup(t);
        const tag = new TagContext({name: 'Original', slug: 'old'});
        tag.save(ctx.db);
        const author = new AuthorContext({name: 'Original', slug: 'old', email: 'a@example.com'});
        author.save(ctx.db);
        tag.set('slug', 'new');
        tag.save(ctx.db);
        author.set('slug', 'new');
        author.save(ctx.db);
        const oldTag = new TagContext({name: 'Fresh', slug: 'old'});
        oldTag.save(ctx.db);
        const oldAuthor = new AuthorContext({name: 'Fresh', slug: 'old', email: 'fresh@example.com'});
        oldAuthor.save(ctx.db);
        assert.notEqual(oldTag.dbId, tag.dbId);
        assert.notEqual(oldAuthor.dbId, author.dbId);
        ctx.db.db.prepare('DELETE FROM Tags WHERE id = ?').run(oldTag.dbId!);
        ctx.db.db.prepare('DELETE FROM Authors WHERE id = ?').run(oldAuthor.dbId!);
        const recreated = new TagContext({name: 'Recreated', slug: 'old'});
        recreated.save(ctx.db);
        const recreatedAuthor = new AuthorContext({name: 'Recreated', slug: 'old', email: 'recreated@example.com'});
        recreatedAuthor.save(ctx.db);
        assert.notEqual(recreated.dbId, oldTag.dbId);
        assert.notEqual(recreatedAuthor.dbId, oldAuthor.dbId);
    });

    it('discards remaining live events when a committed listener throws', async t => {
        const {ctx} = await setup(t);
        let calls = 0;
        ctx.on('field:sanitized', () => {
            calls += 1;
            throw new Error('listener failed');
        });
        await assert.rejects(
            ctx.transaction(() => {
                for (let index = 0; index < 2; index += 1) {
                    const post = new PostContext();
                    post.set('title', 'T'.repeat(300));
                    post.set('slug', `event-${index}`);
                    post.set('created_at', new Date('2026-01-01T00:00:00Z'));
                    post.save(ctx.db);
                }
            }),
            /listener failed/
        );
        assert.equal((await ctx.getAllPosts()).length, 2);
        add(ctx, 3);
        assert.equal(calls, 1);
        assert.equal(ctx.sanitizedFields.length, 2);
    });
});
