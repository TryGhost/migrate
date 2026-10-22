import assert from 'node:assert/strict';
import {describe, it, type TestContext} from 'node:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {
    MigrateContext,
    PostContext,
    TagContext,
    AuthorContext,
    type SourceRecordInput,
    type SourceIngestion
} from '../index.js';
import {createDatabase, queueDatabaseEvent} from '../lib/database.js';

const raw = (key?: string | null, content = 'Original 🚀 & <b>text</b>'): SourceRecordInput => ({
    kind: 'post',
    key,
    content,
    format: 'text'
});

async function context(t: TestContext, persistent = false) {
    const directory = await mkdtemp(join(tmpdir(), 'mg-source-'));
    const instance = new MigrateContext(persistent ? {dbPath: join(directory, 'context.sqlite')} : {storage: 'memory'});
    await instance.init();
    t.after(async () => {
        await instance.close();
        await rm(directory, {recursive: true, force: true});
    });
    return instance;
}

async function collect<T>(input: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of input) {
        values.push(value);
    }
    return values;
}

function post(ctx: MigrateContext, slug = 'post'): PostContext {
    const value = new PostContext({lookupKey: slug});
    value.set('title', slug);
    value.set('slug', slug);
    value.set('created_at', new Date('2026-01-01T00:00:00Z'));
    value.save(ctx.db);
    return value;
}

describe('shared source records', () => {
    it('requires initialization and explicitly rejects removed options', async () => {
        const uninitialized = new MigrateContext();
        assert.throws(() => uninitialized.sources, /not initialized/);
        assert.throws(() => new MigrateContext({contentIdentity: {source: 'x'}} as any), /removed/);
        for (const field of ['source', 'sourceContent', 'sourceMeta', 'meta']) {
            assert.throws(() => new PostContext({[field]: {}} as any), /removed/);
        }
        await uninitialized.close();
        const database = createDatabase(':memory:');
        queueDatabaseEvent(database, {type: 'unused', payload: {}});
        database.db.close();
    });

    it('distinguishes absent and completed empty ingestion across reopening', async t => {
        const ctx = await context(t, true);
        assert.equal(ctx.sources.hasCompletedIngestion, false);
        assert.equal(ctx.sources.currentIngestion, null);
        assert.equal(ctx.sources.count(), 0);
        assert.equal(ctx.sources.get('post', 'absent'), null);
        assert.equal(ctx.sources.getById(1), null);
        assert.deepEqual(await collect(ctx.sources.records()), []);
        const metadata = {label: 'caller-owned', nested: {version: 2}};
        const info = await ctx.sources.ingest({metadata}, () => {});
        assert.deepEqual(info.metadata, metadata);
        metadata.nested.version = 3;
        assert.equal(ctx.sources.hasCompletedIngestion, true);
        assert.equal(ctx.sources.count(), 0);
        assert.equal(ctx.hasContent(), false);
        assert.ok(info.completedAt);
        await ctx.close();
        await ctx.init();
        assert.equal(ctx.sources.hasCompletedIngestion, true);
        assert.deepEqual(ctx.sources.currentIngestion!.metadata, {label: 'caller-owned', nested: {version: 2}});
        await assert.rejects(
            ctx.sources.ingest({}, () => {}),
            /explicitly request replacement/
        );
    });

    it('stores opaque records of any kind and closes the staging write API', async t => {
        const ctx = await context(t);
        let handle!: SourceIngestion;
        await ctx.sources.ingest({}, stage => {
            handle = stage;
            assert.equal(ctx.sources.count(), 0);
            const first = stage.put({...raw('1'), metadata: {file: 'a.xml', line: 3}});
            stage.put({kind: 'attachment', key: '1', content: '{bad JSON}', format: 'json'});
            stage.put(raw(null, ''));
            stage.put(raw());
            assert.equal(stage.count(), 4);
            assert.equal(stage.count('post'), 3);
            assert.deepEqual(stage.getById(first.id), first);
            first.metadata.line = 99;
            assert.equal(stage.get('post', '1')!.metadata.line, 3);
        });
        assert.equal(ctx.sources.count(), 4);
        assert.equal(ctx.sources.count('attachment'), 1);
        assert.equal(ctx.sources.get('attachment', '1')!.content, '{bad JSON}');
        assert.deepEqual(
            (await collect(ctx.sources.records({kind: 'post', batchSize: 1}))).map(row => row.key),
            ['1', null, null]
        );
        assert.deepEqual(await collect(ctx.sources.records({kind: 'missing'})), []);
        assert.equal(ctx.sources.get('post', '1')!.content, raw().content);
        assert.throws(() => handle.put(raw('closed')), /closed/);
        assert.throws(() => handle.count(), /closed/);
    });

    it('requires explicit duplicate resolution and preserves canonical IDs and ordering', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            const original = stage.put(raw('same'));
            assert.throws(() => stage.put(raw('same', 'ignored')), /Duplicate source/);
            assert.equal(stage.put(raw('same', 'ignored'), {onDuplicate: 'keep'}).id, original.id);
            assert.equal(stage.get('post', 'same')!.content, raw().content);
            const replacement = stage.put(
                {...raw('same', 'new'), format: 'markdown', metadata: {revision: 2}},
                {onDuplicate: 'replace'}
            );
            assert.equal(replacement.id, original.id);
            assert.equal(stage.get('post', 'same')!.format, 'markdown');
            assert.deepEqual(replacement.metadata, {revision: 2});
            assert.throws(
                () => stage.put(raw('other'), {onDuplicate: 'newest' as any}),
                /Unknown source duplicate policy/
            );
        });
        assert.equal(ctx.sources.count(), 1);
        assert.equal(ctx.sources.get('post', 'same')!.content, 'new');
    });

    it('validates records and JSON metadata without interpreting payload formats', async t => {
        const ctx = await context(t);
        const cycle: any = {};
        cycle.self = cycle;
        const sparse: any[] = [];
        sparse.length = 2;
        await ctx.sources.ingest({}, stage => {
            for (const invalid of [
                null,
                {...raw(), kind: ''},
                {...raw(), format: ' '},
                {...raw(), content: 3},
                {...raw(), key: ''},
                {...raw(), key: 3}
            ]) {
                assert.throws(() => stage.put(invalid as any), /Source records require/);
            }
            for (const metadata of [
                null,
                [],
                'x',
                {bad: undefined},
                {bad: NaN},
                {bad: BigInt(1)},
                {bad: new Date()},
                cycle,
                {sparse}
            ]) {
                assert.throws(() => stage.put({...raw(), metadata} as any), /Metadata/);
            }
            const shared = {yes: true};
            stage.put({
                ...raw(),
                metadata: {one: shared, two: shared, values: [null, false, 1, 'x'], empty: Object.create(null)}
            });
        });
        assert.equal(ctx.sources.count(), 1);
        for (const batchSize of [0, 1.2, Infinity]) {
            await assert.rejects(collect(ctx.sources.records({batchSize})), /positive/);
        }
    });

    it('writes bounded committed batches without keeping transactions open during input waits', async t => {
        const ctx = await context(t, true);
        await ctx.sources.ingest({}, async stage => {
            const shared = {label: 'before'};
            async function* input() {
                yield {...raw('1', 'a'), metadata: shared};
                shared.label = 'after';
                assert.equal(ctx.db.inTransaction, false);
                yield raw('2', 'b');
                assert.equal(stage.count(), 2);
                yield raw('3', 'x'.repeat(100));
                assert.equal(stage.count(), 3);
                yield raw('4', 'x');
            }
            assert.equal(await stage.write(input(), {batchSize: 2, maxBatchBytes: 60}), 4);
            assert.equal(stage.get('post', '1')!.metadata.label, 'before');
            await stage.write([raw('5', 'x'), raw('6', 'x')], {batchSize: 20, maxBatchBytes: 15});
            assert.equal(await stage.write([]), 0);
            for (const options of [{batchSize: 0}, {maxBatchBytes: 0}]) {
                await assert.rejects(stage.write([], options), /positive/);
            }
        });
        await ctx.sources.ingest({replace: true}, async stage => {
            await stage.write([raw()]);
        });
        assert.equal(ctx.sources.count(), 1);
    });

    it('detaches prepared records when a parser reuses its input object', async t => {
        const ctx = await context(t);
        const input = {...raw('first', 'first body'), metadata: {nested: {label: 'first'}}};
        await ctx.sources.ingest({}, async stage => {
            function* records() {
                yield input;
                input.key = 'second';
                input.content = 'second body';
                input.metadata.nested.label = 'second';
                yield input;
                input.metadata.nested.label = 'after ingestion';
            }
            await stage.write(records());
        });
        assert.equal(ctx.sources.get('post', 'first')!.content, 'first body');
        assert.deepEqual(ctx.sources.get('post', 'first')!.metadata, {nested: {label: 'first'}});
        assert.equal(ctx.sources.get('post', 'second')!.content, 'second body');
        assert.deepEqual(ctx.sources.get('post', 'second')!.metadata, {nested: {label: 'second'}});
    });

    it('preserves originals, mapped content, and links after a failed replacement', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('old'));
        });
        const original = post(ctx);
        const record = ctx.sources.get('post', 'old')!;
        ctx.sources.link(record.id, {type: 'post', id: original.dbId!});
        ctx.recordDiagnostic('mapping:kept', {}, record.id);
        await assert.rejects(
            ctx.sources.ingest({replace: true}, async stage => {
                assert.equal(ctx.sources.get('post', 'old')!.id, record.id);
                await stage.write([raw('new')], {batchSize: 1});
                stage.recordDiagnostic('source:warning', {reason: 'data'}, stage.get('post', 'new')!.id);
                throw new Error('input failed');
            }),
            /input failed/
        );
        assert.equal(ctx.sources.count(), 1);
        assert.equal(ctx.sources.get('post', 'new'), null);
        assert.equal((await ctx.getAllPosts())[0].ghostId, original.ghostId);
        assert.equal((await collect(ctx.sources.recordsFor({type: 'post', id: original.dbId!}))).length, 1);
        const events = await collect(ctx.streamDiagnostics({phase: 'ingestion'}));
        assert.deepEqual(
            events.map(event => event.type),
            ['source:warning', 'source:failed']
        );
        assert.equal(
            (await collect(ctx.streamDiagnostics({ingestionId: events[0].ingestionId!, batchSize: 1}))).length,
            2
        );
        assert.equal(ctx.getMigrationReport().summary['mapping:kept'], 1);
        await ctx.sources.ingest({replace: true}, stage => {
            stage.put(raw('new'));
        });
        assert.equal(ctx.hasContent(), false);
        assert.equal(ctx.sources.getById(record.id), null);
        assert.equal(ctx.getMigrationReport().summary['mapping:kept'], undefined);
        assert.equal((await collect(ctx.streamDiagnostics())).length, 2);
    });

    it('rolls back a failed promotion without discarding the active generation', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('old'));
        });
        const original = post(ctx);
        ctx.db.db.exec(
            "CREATE TRIGGER fail_promote BEFORE UPDATE OF status ON SourceIngestions WHEN NEW.status = 'complete' BEGIN SELECT RAISE(ABORT, 'promotion failed'); END;"
        );
        await assert.rejects(
            ctx.sources.ingest({replace: true}, stage => {
                stage.put(raw('new'));
            }),
            /promotion failed/
        );
        assert.ok(ctx.sources.get('post', 'old'));
        assert.equal((await ctx.getAllPosts())[0].ghostId, original.ghostId);
        ctx.db.db.exec('DROP TRIGGER fail_promote;');
    });

    it('discards interrupted staging on the next attempt while retaining its diagnostics', async t => {
        const ctx = await context(t, true);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('old'));
        });
        ctx.db.db.exec(
            "INSERT INTO SourceIngestions(status, metadata, started_at) VALUES ('staging', '{}', 'interrupted');"
        );
        const id = (ctx.db.db.prepare("SELECT id FROM SourceIngestions WHERE status = 'staging'").get() as any).id;
        ctx.db.db
            .prepare(
                "INSERT INTO SourceRecords(ingestion_id, kind, content, format, metadata) VALUES (?, 'post', 'partial', 'text', '{}')"
            )
            .run(id);
        ctx.db.db
            .prepare(
                "INSERT INTO MigrationEvents(type, details, created_at, phase, ingestion_id) VALUES ('source:warning', '{}', 'then', 'ingestion', ?)"
            )
            .run(id);
        await ctx.close();
        await ctx.init();
        assert.equal(ctx.sources.count(), 1);
        await ctx.sources.ingest({replace: true}, stage => {
            assert.equal(stage.count(), 0);
            stage.put(raw('fresh'));
        });
        assert.equal((ctx.db.db.prepare('SELECT COUNT(*) AS n FROM SourceRecords').get() as any).n, 1);
        assert.deepEqual(
            (await collect(ctx.streamDiagnostics({ingestionId: id}))).map(row => row.type),
            ['source:warning', 'source:failed']
        );
    });

    it('closes resources and invalidates ingestion handles even if the callback outlives the context', async t => {
        const ctx = await context(t, true);
        let handle!: SourceIngestion;
        await assert.rejects(
            ctx.sources.ingest({}, async stage => {
                handle = stage;
                stage.put(raw('partial'));
                await ctx.close();
            }),
            /closed during ingestion/
        );
        assert.throws(() => handle.put(raw('late')), /closed/);
        await ctx.close();
        await ctx.init();
        assert.equal(ctx.sources.hasCompletedIngestion, false);
        assert.equal(ctx.getMigrationReport().summary['source:failed'], 1);
    });

    it('guards overlapping lifecycles and invalid ingestion arguments', async t => {
        const ctx = await context(t);
        await assert.rejects(
            ctx.sources.ingest({replace: 1} as any, () => {}),
            /boolean/
        );
        await assert.rejects(ctx.sources.ingest({}, null as any), /callback/);
        await assert.rejects(
            ctx.sources.ingest({metadata: [] as any}, () => {}),
            /Metadata/
        );
        await ctx.transaction(async () => {
            await assert.rejects(
                ctx.sources.ingest({}, () => {}),
                /mapped transaction/
            );
        });
        await ctx.sources.ingest({}, async stage => {
            const item = stage.put(raw('1'));
            await assert.rejects(
                ctx.sources.ingest({}, () => {}),
                /cannot overlap/
            );
            assert.throws(() => ctx.reset(), /cannot overlap/);
            await assert.rejects(
                ctx.rebuildMappedContent(() => {}),
                /cannot overlap/
            );
            assert.throws(() => stage.recordDiagnostic(''), /Diagnostic requires/);
            assert.throws(() => stage.recordDiagnostic('source:bad', {}, item.id + 1), /Diagnostic requires/);
            stage.recordDiagnostic('source:ok');
        });
        assert.throws(() => ctx.recordDiagnostic(''), /Diagnostic requires/);
        assert.throws(() => ctx.recordDiagnostic('bad', {}, 9999), /Diagnostic requires/);
        ctx.recordDiagnostic('mapping:ok');
        await assert.rejects(collect(ctx.streamDiagnostics({batchSize: 0})), /positive/);
    });

    it('supports many-to-many typed provenance and cascading mapped cleanup', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('1'));
            stage.put(raw('2'));
        });
        const [first, second] = await collect(ctx.sources.records());
        const mapped = post(ctx);
        const tag = new TagContext({name: 'Tag', slug: 'tag'});
        tag.save(ctx.db);
        const author = new AuthorContext({name: 'Author', slug: 'author', email: 'a@example.com'});
        author.save(ctx.db);
        const entities = [
            {type: 'post', id: mapped.dbId!},
            {type: 'tag', id: tag.dbId!},
            {type: 'author', id: author.dbId!}
        ] as const;
        for (const entity of entities) {
            ctx.sources.link(first.id, entity);
            ctx.sources.link(first.id, entity);
        }
        ctx.sources.link(second.id, entities[0]);
        assert.deepEqual(await collect(ctx.sources.entitiesFor(first.id, {batchSize: 1})), entities);
        assert.equal((await collect(ctx.sources.recordsFor(entities[0], {batchSize: 1}))).length, 2);
        ctx.sources.unlink(second.id, entities[0]);
        assert.equal((await collect(ctx.sources.recordsFor(entities[0]))).length, 1);
        assert.throws(() => ctx.sources.link(999, entities[0]), /completed source record/);
        assert.throws(() => ctx.sources.link(first.id, {type: 'file' as any, id: 1}), /existing post/);
        assert.throws(() => ctx.sources.link(first.id, {type: 'post', id: 999}), /existing post/);
        await assert.rejects(collect(ctx.sources.entitiesFor(first.id, {batchSize: 0})), /positive/);
        await assert.rejects(collect(ctx.sources.recordsFor(entities[0], {batchSize: 0})), /positive/);
        ctx.db.db.prepare('DELETE FROM Posts WHERE id = ?').run(mapped.dbId!);
        ctx.db.db.prepare('DELETE FROM Tags WHERE id = ?').run(tag.dbId!);
        ctx.db.db.prepare('DELETE FROM Authors WHERE id = ?').run(author.dbId!);
        assert.deepEqual(await collect(ctx.sources.entitiesFor(first.id)), []);
    });

    it('rebuilds from originals on every call and restores mapped data on unexpected errors', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('1'));
            stage.recordDiagnostic('source:kept');
        });
        let generation = 0;
        async function map() {
            await ctx.rebuildMappedContent(async () => {
                for await (const record of ctx.sources.records()) {
                    const value = post(ctx, `mapped-${++generation}`);
                    ctx.sources.link(record.id, {type: 'post', id: value.dbId!});
                    ctx.addLink('/old', `/${value.data.slug}`);
                    ctx.recordDiagnostic('mapped', {generation}, record.id);
                }
            });
        }
        await map();
        await map();
        const [before] = await ctx.getAllPosts();
        assert.equal(before.data.slug, 'mapped-2');
        assert.equal(ctx.findLink('/old'), '/mapped-2');
        assert.equal(ctx.getMigrationReport().summary.mapped, 1);
        assert.equal(ctx.getMigrationReport().summary['source:kept'], 1);
        await assert.rejects(
            ctx.rebuildMappedContent(async () => {
                post(ctx, 'bad');
                throw new Error('mapper bug');
            }),
            /mapper bug/
        );
        assert.equal((await ctx.getAllPosts())[0].ghostId, before.ghostId);
        await ctx.transaction(async () => {
            await assert.rejects(
                ctx.rebuildMappedContent(() => {
                    post(ctx, 'nested-bad');
                    throw new Error('nested failure');
                }),
                /nested failure/
            );
            assert.equal((await ctx.getAllPosts())[0].ghostId, before.ghostId);
        });
        await ctx.rebuildMappedContent(async () => {
            await assert.rejects(
                ctx.savepoint(async () => {
                    post(ctx, 'invalid');
                    throw new Error('known data');
                }),
                /known data/
            );
            assert.equal(await ctx.savepoint(() => 42), 42);
            post(ctx, 'valid');
        });
        assert.deepEqual(
            (await ctx.getAllPosts()).map(value => value.data.slug),
            ['valid']
        );
        assert.equal(await ctx.savepoint(() => 'outside'), 'outside');
        ctx.resetMappedContent();
        assert.equal(ctx.hasContent(), false);
        assert.equal(ctx.sources.count(), 1);
        assert.equal(ctx.getMigrationReport().summary['source:kept'], 1);
        ctx.reset();
        assert.equal(ctx.sources.hasCompletedIngestion, false);
        assert.deepEqual(ctx.getMigrationReport().events, []);
    });

    it('rejects old and experimental layouts without modifying their data', async t => {
        const directory = await mkdtemp(join(tmpdir(), 'mg-schema-'));
        t.after(() => rm(directory, {recursive: true, force: true}));
        for (const version of [2, 3, 4, 5]) {
            const path = join(directory, `${version}.sqlite`);
            const db = new DatabaseSync(path);
            db.exec(
                `CREATE TABLE Posts(id INTEGER PRIMARY KEY, source_content TEXT); PRAGMA user_version = ${version}; INSERT INTO Posts VALUES(1, 'retained');`
            );
            db.close();
            const ctx = new MigrateContext({dbPath: path});
            await assert.rejects(ctx.init(), /rebuild the database/);
            const verify = new DatabaseSync(path);
            assert.equal((verify.prepare('SELECT source_content FROM Posts').get() as any).source_content, 'retained');
            verify.close();
        }
    });

    it('rejects incomplete version-five layouts before creating any persistent objects', async t => {
        const directory = await mkdtemp(join(tmpdir(), 'mg-incomplete-schema-'));
        t.after(() => rm(directory, {recursive: true, force: true}));
        for (const version of [0, 5]) {
            const path = join(directory, `${version}.sqlite`);
            const db = new DatabaseSync(path);
            db.exec(`CREATE TABLE SourceRecords(id INTEGER PRIMARY KEY, content TEXT);
                INSERT INTO SourceRecords VALUES(1, 'retained'); PRAGMA user_version = ${version};`);
            const before = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();
            db.close();
            const ctx = new MigrateContext({dbPath: path});
            await assert.rejects(ctx.init(), /rebuild the database/);
            const verified = new DatabaseSync(path);
            assert.deepEqual(verified.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all(), before);
            assert.equal((verified.prepare('SELECT content FROM SourceRecords').get() as any).content, 'retained');
            verified.close();
        }
    });

    it('rejects missing or altered constraints, indexes, and triggers without changing rows or layout', async t => {
        const directory = await mkdtemp(join(tmpdir(), 'mg-constraint-schema-'));
        t.after(() => rm(directory, {recursive: true, force: true}));
        const changes = [
            'DROP TABLE SourceEntityLinks; CREATE TABLE SourceEntityLinks(source_record_id INTEGER, entity_type TEXT, entity_id INTEGER);',
            'DROP INDEX idx_source_active; CREATE INDEX idx_source_active ON SourceIngestions(status);',
            'DROP INDEX idx_source_key;',
            'DROP TRIGGER source_post_deleted;',
            'ALTER TABLE SourceRecords ADD COLUMN aliases TEXT;'
        ];
        for (const [index, change] of changes.entries()) {
            const path = join(directory, `${index}.sqlite`);
            const ctx = new MigrateContext({dbPath: path});
            await ctx.init();
            await ctx.sources.ingest({}, stage => {
                stage.put(raw('retained'));
            });
            await ctx.close();
            const db = new DatabaseSync(path);
            db.exec(change);
            const before = db.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all();
            const original = db.prepare('SELECT * FROM SourceRecords').all();
            db.close();
            await assert.rejects(ctx.init(), /Incompatible experimental database layout; rebuild/);
            const verified = new DatabaseSync(path);
            assert.deepEqual(verified.prepare('SELECT type, name, sql FROM sqlite_master ORDER BY name').all(), before);
            assert.deepEqual(verified.prepare('SELECT * FROM SourceRecords').all(), original);
            verified.close();
        }
    });

    it('supports explicit reset-on-open without requiring a source identity', async t => {
        const ctx = await context(t, true);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('old'));
        });
        post(ctx);
        const path = ctx.databasePath;
        await ctx.close();
        const reset = new MigrateContext({dbPath: path, resetContent: true});
        await reset.init();
        assert.equal(reset.sources.hasCompletedIngestion, false);
        assert.equal(reset.hasContent(), false);
        assert.throws(() => (reset.reset as any)({}), /no longer accepts options/);
        await reset.close();
    });

    it('rejects invalid filtered iteration limits and detects source replacement during iteration', async t => {
        const ctx = await context(t);
        await assert.rejects(collect(ctx.streamPosts({batchSize: 0, filter: {tag: {slug: 'tag'}}})), /positive/);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('1'));
            stage.put(raw('2'));
        });
        const iterator = ctx.sources.records({batchSize: 1});
        await iterator.next();
        await ctx.sources.ingest({replace: true}, stage => {
            stage.put(raw('3'));
        });
        await assert.rejects(iterator.next(), /changed during iteration/);
    });

    it('invalidates handles when storage fails while discarding a failed attempt', async t => {
        const ctx = await context(t);
        let handle!: SourceIngestion;
        ctx.db.db.exec(
            "CREATE TRIGGER fail_discard BEFORE DELETE ON SourceRecords BEGIN SELECT RAISE(ABORT, 'discard failed'); END;"
        );
        await assert.rejects(
            ctx.sources.ingest({}, stage => {
                handle = stage;
                stage.put(raw('partial'));
                throw new Error('input failed');
            }),
            /discard failed/
        );
        assert.throws(() => handle.put(raw('closed')), /closed/);
        ctx.db.db.exec('DROP TRIGGER fail_discard;');
        await ctx.sources.ingest({}, () => {});
        assert.equal(ctx.sources.count(), 0);
    });

    it('invalidates buffered iterators after completion or replacement', async t => {
        const ctx = await context(t);
        let iterator!: AsyncGenerator;
        await ctx.sources.ingest({}, async stage => {
            stage.put(raw('1'));
            stage.put(raw('2'));
            iterator = stage.records();
            await iterator.next();
        });
        await assert.rejects(iterator.next(), /closed/);
        const completed = ctx.sources.records();
        await completed.next();
        await ctx.sources.ingest({replace: true}, () => {});
        await assert.rejects(completed.next(), /changed during iteration/);
    });

    it('invalidates buffered provenance iterators after replacement or closure', async t => {
        for (const close of [false, true]) {
            const ctx = await context(t);
            await ctx.sources.ingest({}, stage => {
                stage.put(raw('1'));
                stage.put(raw('2'));
            });
            const first = ctx.sources.get('post', '1')!;
            const second = ctx.sources.get('post', '2')!;
            const mapped = {type: 'post', id: post(ctx).dbId!} as const;
            const other = {type: 'post', id: post(ctx, 'other').dbId!} as const;
            ctx.sources.link(first.id, mapped);
            ctx.sources.link(first.id, other);
            ctx.sources.link(second.id, mapped);
            const records = ctx.sources.recordsFor(mapped);
            const entities = ctx.sources.entitiesFor(first.id);
            await records.next();
            await entities.next();
            if (close) {
                await ctx.close();
            } else {
                await ctx.sources.ingest({replace: true}, () => {});
            }
            const expected = close ? /closed/ : /changed during iteration/;
            await assert.rejects(records.next(), expected);
            await assert.rejects(entities.next(), expected);
        }
    });

    it('blocks mapped writes through public APIs while replacement ingestion is running', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.put(raw('old'));
        });
        const mapped = post(ctx);
        const source = ctx.sources.get('post', 'old')!;
        const entity = {type: 'post' as const, id: mapped.dbId!};
        ctx.sources.link(source.id, entity);
        await assert.rejects(
            ctx.sources.ingest({replace: true}, async stage => {
                stage.put(raw('new'));
                mapped.set('title', 'Must not persist');
                for (const write of [
                    () => mapped.save(ctx.db),
                    () => new TagContext({name: 'Bad', slug: 'bad'}).save(ctx.db),
                    () => new AuthorContext({name: 'Bad', slug: 'bad', email: 'b@example.com'}).save(ctx.db),
                    () => ctx.updatePostData(mapped.dbId!, {title: 'bad'}),
                    () => ctx.addLink('/old', '/bad'),
                    () => ctx.sources.link(source.id, entity),
                    () => ctx.sources.unlink(source.id, entity),
                    () => ctx.recordDiagnostic('mapping:bad')
                ]) {
                    assert.throws(write, /cannot overlap/);
                }
                await assert.rejects(ctx.prepareForExport(), /cannot overlap/);
                throw new Error('input failed');
            }),
            /input failed/
        );
        assert.equal((await ctx.getAllPosts())[0].data.title, 'post');
        assert.equal(ctx.findLink('/old'), null);
        assert.equal((await collect(ctx.sources.entitiesFor(source.id))).length, 1);
    });

    it('always closes SQLite and invalidates source handles when close cleanup fails', async t => {
        const ctx = await context(t, true);
        const sources = ctx.sources;
        let handle!: SourceIngestion;
        await assert.rejects(
            sources.ingest({}, async stage => {
                handle = stage;
                stage.put(raw('partial'));
                ctx.db.db.exec(
                    "CREATE TRIGGER fail_close BEFORE DELETE ON SourceRecords BEGIN SELECT RAISE(ABORT, 'close cleanup failed'); END;"
                );
                await ctx.close();
            }),
            /close cleanup failed/
        );
        assert.throws(() => ctx.db, /not initialized/);
        assert.throws(() => handle.put(raw('late')), /closed/);
        await ctx.close();
        await ctx.init();
        ctx.db.db.exec('DROP TRIGGER fail_close;');
        assert.throws(() => sources.count(), /closed/);
        await assert.rejects(
            sources.ingest({}, () => {}),
            /closed/
        );
        await ctx.sources.ingest({}, () => {});
        assert.equal(ctx.sources.hasCompletedIngestion, true);
    });

    it('closes a newly opened database if schema initialization fails', async t => {
        const execute = DatabaseSync.prototype.exec;
        const close = DatabaseSync.prototype.close;
        let closures = 0;
        t.mock.method(DatabaseSync.prototype, 'exec', function (this: DatabaseSync, sql: string) {
            if (sql.includes('CREATE TABLE IF NOT EXISTS Posts')) {
                throw new Error('storage initialization failed');
            }
            return execute.call(this, sql);
        });
        t.mock.method(DatabaseSync.prototype, 'close', function (this: DatabaseSync) {
            closures += 1;
            return close.call(this);
        });
        const ctx = new MigrateContext();
        await assert.rejects(ctx.init(), /storage initialization failed/);
        assert.equal(closures, 1);
        assert.throws(() => ctx.db, /not initialized/);
        await ctx.close();
    });

    it('rejects altered version-five layouts as well as earlier experimental schemas', async t => {
        const ctx = await context(t, true);
        ctx.db.db.exec('ALTER TABLE Posts ADD COLUMN source_content TEXT;');
        await ctx.close();
        await assert.rejects(ctx.init(), /Incompatible experimental/);
    });
});
