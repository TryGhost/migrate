import assert from 'node:assert/strict';
import {describe, it, type TestContext} from 'node:test';
import {
    MigrateContext,
    MappingState,
    PostContext,
    TagContext,
    AuthorContext,
    RecordDataError,
    WARNING_EVENT_TYPES,
    GHOST_FIELD_LIMITS,
    ghostId,
    type SourceRecord
} from '../index.js';

async function context(t: TestContext) {
    const instance = new MigrateContext({storage: 'memory'});
    await instance.init();
    t.after(() => instance.close());
    return instance;
}

async function ingest(ctx: MigrateContext, keys: string[]) {
    await ctx.sources.ingest({}, stage => {
        for (const key of keys) {
            stage.put({kind: 'item', key, content: JSON.stringify({key}), format: 'json', metadata: {file: 'a.xml'}});
        }
    });
}

function events(ctx: MigrateContext, type: string) {
    return ctx.getMigrationReport().events.filter(event => event.type === type);
}

describe('ghostId', () => {
    it('is deterministic, 24 hex characters, and scoped by every part', () => {
        const id = ghostId('adapter:1', 'example.com', 'post', 'id:1');
        assert.match(id, /^[0-9a-f]{24}$/);
        assert.equal(ghostId('adapter:1', 'example.com', 'post', 'id:1'), id);
        assert.notEqual(ghostId('adapter:2', 'example.com', 'post', 'id:1'), id);
        assert.notEqual(ghostId('adapter:1', 'example.org', 'post', 'id:1'), id);
        assert.notEqual(ghostId('adapter:1', 'example.com', 'tag', 'id:1'), id);
        assert.notEqual(ghostId('adapter:1', 'example.com', 'post', 'id:2'), id);
    });
});

describe('MappingState', () => {
    it('stores values, bindings, and record indexes per state name', async t => {
        const ctx = await context(t);
        await ingest(ctx, ['a', 'b', 'c']);
        const [a, b, c] = [ctx.sources.get('item', 'a')!, ctx.sources.get('item', 'b')!, ctx.sources.get('item', 'c')!];
        const state = new MappingState(ctx, 'first');
        assert.equal(state.context, ctx);
        assert.equal(state.name, 'first');
        assert.equal(state.get('ns', 'missing'), undefined);
        state.set('ns', 'key', {nested: [1, 'two']});
        assert.deepEqual(state.get('ns', 'key'), {nested: [1, 'two']});
        state.set('ns', 'key', 'replaced');
        assert.equal(state.get('ns', 'key'), 'replaced');
        assert.equal(state.getBinding('author', 'id:1'), undefined);
        state.bind('author', 'id:1', 7);
        assert.equal(state.getBinding('author', 'id:1'), 7);
        assert.equal(state.getBinding('tag', 'id:1'), undefined);

        state.index('login', 'admin', c.id);
        state.index('login', 'admin', a.id);
        state.index('login', 'admin', a.id);
        state.index('login', 'admin', b.id);
        assert.deepEqual(state.find('login', 'missing'), []);
        assert.deepEqual(
            state.find('login', 'admin').map(record => record.key),
            ['a', 'b']
        );
        assert.equal(state.find('login', 'admin', 5).length, 3);

        const other = new MappingState(ctx, 'second');
        assert.equal(other.get('ns', 'key'), undefined);
        assert.deepEqual(other.find('login', 'admin'), []);
        assert.equal(state.get('ns', 'key'), 'replaced');

        const fresh = new MappingState(ctx, 'first');
        assert.equal(fresh.get('ns', 'key'), undefined);
        assert.equal(fresh.getBinding('author', 'id:1'), undefined);
        assert.deepEqual(fresh.find('login', 'admin'), []);
    });

    it('suffixes author and tag slugs around saved rows and reserved slugs', async t => {
        const ctx = await context(t);
        const state = new MappingState(ctx, 'slugs');
        await ctx.rebuildMappedContent(() => {
            assert.equal(state.uniqueSlug('tag', 'news'), 'news');
            new TagContext({name: 'News', slug: 'news'}).save(ctx.db);
            assert.equal(state.uniqueSlug('tag', 'news'), 'news-2');
            new TagContext({name: 'News 2', slug: 'news-2'}).save(ctx.db);
            assert.equal(state.uniqueSlug('tag', 'news'), 'news-3');

            state.reserveSlug('author', 'jo', 'ghost-user-1');
            assert.equal(state.uniqueSlug('author', 'jo', 'ghost-user-1'), 'jo');
            assert.equal(state.uniqueSlug('author', 'jo'), 'jo-2');
            assert.equal(state.uniqueSlug('author', 'jo', 'ghost-user-2'), 'jo-3');
            const author = new AuthorContext({name: 'Jo', slug: 'jo', email: 'jo@example.com'});
            author.save(ctx.db);
            assert.equal(state.uniqueSlug('author', 'jo', 'ghost-user-1'), 'jo-4');

            assert.equal(state.uniqueSlug('tag', '   '), 'tag');
            assert.equal(state.uniqueSlug('author', '---'), 'author');
            const limit = GHOST_FIELD_LIMITS.tag.slug;
            const long = `${'a'.repeat(limit - 1)}-b`;
            assert.equal(state.uniqueSlug('tag', long), 'a'.repeat(limit - 1));
            new TagContext({name: 'Long', slug: 'a'.repeat(limit - 1)}).save(ctx.db);
            const suffixed = state.uniqueSlug('tag', long);
            assert.equal(suffixed, `${'a'.repeat(limit - 2)}-2`);
            assert.equal(suffixed.length, limit);
        });
        assert.deepEqual(
            events(ctx, 'slug:renamed').map(event => event.details),
            [
                {entityKind: 'tag', oldSlug: 'news', newSlug: 'news-2'},
                {entityKind: 'tag', oldSlug: 'news', newSlug: 'news-3'},
                {entityKind: 'author', oldSlug: 'jo', newSlug: 'jo-2'},
                {entityKind: 'author', oldSlug: 'jo', newSlug: 'jo-3'},
                {entityKind: 'author', oldSlug: 'jo', newSlug: 'jo-4'},
                {
                    entityKind: 'tag',
                    oldSlug: 'a'.repeat(GHOST_FIELD_LIMITS.tag.slug - 1),
                    newSlug: `${'a'.repeat(GHOST_FIELD_LIMITS.tag.slug - 2)}-2`
                }
            ]
        );
    });
});

describe('mapRecords', () => {
    it('counts imported, unselected, and skipped records and rolls back skipped writes', async t => {
        const ctx = await context(t);
        await ingest(ctx, ['keep', 'filtered', 'bad', 'second']);
        const seen: string[] = [];
        const summary = await ctx.rebuildMappedContent(() =>
            ctx.mapRecords(ctx.sources.records({kind: 'item'}), async (record: SourceRecord) => {
                seen.push(record.key!);
                if (record.key === 'filtered') {
                    return false;
                }
                const post = new PostContext({lookupKey: record.key!});
                post.set('title', record.key!);
                post.set('slug', record.key!);
                post.set('created_at', new Date('2026-01-01T00:00:00Z'));
                post.save(ctx.db);
                if (record.key === 'bad') {
                    throw new RecordDataError('Bad record');
                }
            })
        );
        assert.deepEqual(seen, ['keep', 'filtered', 'bad', 'second']);
        assert.deepEqual(summary, {selected: 3, imported: 2, skipped: 1});
        assert.deepEqual(
            (await ctx.getAllPosts()).map(post => post.lookupKey),
            ['keep', 'second']
        );
        const [skipped] = events(ctx, 'record:skipped');
        assert.deepEqual(skipped.details, {file: 'a.xml', reason: 'Bad record'});
        assert.equal(skipped.sourceRecordId, ctx.sources.get('item', 'bad')!.id);
        assert.equal(ctx.countWarnings(), 1);
    });

    it('accepts synchronous iterables and propagates unexpected errors', async t => {
        const ctx = await context(t);
        await ingest(ctx, ['a']);
        const record = ctx.sources.get('item', 'a')!;
        assert.deepEqual(await ctx.mapRecords([record], () => 'mapped'), {selected: 1, imported: 1, skipped: 0});
        await assert.rejects(
            ctx.mapRecords([record], () => {
                throw new Error('mapper defect');
            }),
            /mapper defect/
        );
        assert.equal(events(ctx, 'record:skipped').length, 0);
    });
});

describe('countWarnings', () => {
    it('sums only warning diagnostics across ingestion and mapping', async t => {
        const ctx = await context(t);
        assert.deepEqual(WARNING_EVENT_TYPES, [
            'source:conflict',
            'operation:warning',
            'field:sanitized',
            'slug:renamed',
            'record:skipped'
        ]);
        assert.throws(() => (WARNING_EVENT_TYPES as string[]).push('other'));
        assert.equal(ctx.countWarnings(), 0);
        await ctx.sources.ingest({}, stage => {
            stage.recordDiagnostic('source:conflict');
            stage.recordDiagnostic('source:note');
        });
        ctx.recordDiagnostic('operation:warning');
        ctx.recordDiagnostic('operation:warning');
        ctx.recordDiagnostic('operation:failed');
        assert.equal(ctx.countWarnings(), 3);
    });
});

describe('SourceIngestion.reconcile', () => {
    const record = (key: string | null, content: string, file: string) => ({
        kind: 'item',
        key,
        content,
        format: 'json',
        metadata: {file}
    });

    it('keeps the first version by default and reports differing duplicates', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            const first = stage.reconcile(record('id:1', 'one', 'a.xml'));
            assert.equal(first.previous, null);
            assert.equal(first.replaced, false);
            assert.equal(first.record.content, 'one');

            const identical = stage.reconcile(record('id:1', 'one', 'b.xml'));
            assert.equal(identical.previous!.id, first.record.id);
            assert.equal(identical.replaced, false);

            const differing = stage.reconcile(record('id:1', 'two', 'c.xml'));
            assert.equal(differing.replaced, false);
            assert.equal(differing.record.content, 'one');

            const unkeyed = [stage.reconcile(record(null, 'x', 'd.xml')), stage.reconcile(record(null, 'x', 'e.xml'))];
            assert.notEqual(unkeyed[0].record.id, unkeyed[1].record.id);
            assert.equal(unkeyed[1].previous, null);
        });
        assert.equal(ctx.sources.get('item', 'id:1')!.content, 'one');
        const conflicts = ctx.getMigrationReport().events.filter(event => event.type === 'source:conflict');
        assert.equal(conflicts.length, 1);
        assert.deepEqual(conflicts[0].details, {
            file: 'c.xml',
            kind: 'item',
            key: 'id:1',
            reason: 'Earlier record retained',
            retained: {file: 'a.xml'}
        });
        assert.equal(conflicts[0].phase, 'ingestion');
        assert.equal(conflicts[0].sourceRecordId, ctx.sources.get('item', 'id:1')!.id);
    });

    it('replaces when chosen, can report identical duplicates, and validates input', async t => {
        const ctx = await context(t);
        await ctx.sources.ingest({}, stage => {
            stage.reconcile(record('id:1', '1', 'a.xml'));
            const choices: string[] = [];
            const choose = (existing: SourceRecord, incoming: {content: string}) => {
                choices.push(`${existing.content}->${incoming.content}`);
                return Number(incoming.content) > Number(existing.content) ? 'replace' : 'keep';
            };
            const newer = stage.reconcile(record('id:1', '3', 'b.xml'), {choose});
            assert.equal(newer.replaced, true);
            assert.equal(newer.record.id, newer.previous!.id);
            assert.equal(newer.record.content, '3');
            assert.equal(stage.reconcile(record('id:1', '2', 'c.xml'), {choose}).replaced, false);
            stage.reconcile(record('id:1', '3', 'd.xml'), {choose, reportIdentical: true});
            assert.deepEqual(choices, ['1->3', '3->2', '3->3']);
            assert.throws(() => stage.reconcile({kind: '', content: '', format: 'json'}), /Source records require/);
        });
        const details = ctx
            .getMigrationReport()
            .events.filter(event => event.type === 'source:conflict')
            .map(event => event.details as any);
        assert.deepEqual(
            details.map(detail => [detail.file, detail.reason, detail.retained.file]),
            [
                ['b.xml', 'Later record replaced the earlier one', 'b.xml'],
                ['c.xml', 'Earlier record retained', 'b.xml'],
                ['d.xml', 'Earlier record retained', 'b.xml']
            ]
        );
    });
});
