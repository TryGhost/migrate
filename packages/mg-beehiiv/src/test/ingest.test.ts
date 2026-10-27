import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {ingest, map, parse} from '../index.js';
import {FIXTURE, SITE, cleanUp, events, ingested, memoryContext, row, writeCsv} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

describe('Reading a beehiiv posts CSV', function () {
    after(cleanUp);

    it('yields each row as a post record keyed by its id', async function () {
        const records = await all(parse(FIXTURE));
        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'abcd1234-1505-4fbf-9576-f3d1bd3034cc', 'json', {file: 'posts.csv', row: 1}],
                ['post', 'efgh1234-1505-4fbf-9576-f3d1bd3034cc', 'json', {file: 'posts.csv', row: 2}]
            ]
        );
        const data = JSON.parse(records[0].content);
        assert.equal(data.web_title, 'Sample Post');
        assert.equal(data.content_tags, 'Lorem Ipsum; Dolor Simet');
        assert.equal(data.created_at, '2023-01-18 21:25:27');
    });

    it('stores the rows, keeping the first of a duplicated id and reporting the conflict', async function () {
        const context = await ingested([
            row('one', {web_title: 'First'}),
            row('one', {web_title: 'Second'}),
            row('one', {web_title: 'First'}),
            row('', {web_title: 'No id'})
        ]);
        try {
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'beehiiv', file: 'posts.csv'});
            assert.equal(context.sources.count('post'), 2);
            assert.equal(JSON.parse(context.sources.get('post', 'one')!.content).web_title, 'First');
            const [conflict] = events(context, 'source:conflict');
            assert.equal(events(context, 'source:conflict').length, 1);
            assert.equal(conflict.details.reason, 'Earlier record retained');
            assert.equal(conflict.details.row, 2);
            assert.deepEqual(conflict.details.retained, {file: 'posts.csv', row: 1});

            // The unkeyed row is stored but skipped when mapped.
            const summary = await map({url: SITE}, context);
            assert.deepEqual(summary, {selected: 2, imported: 1, skipped: 1});
            assert.equal(events(context, 'record:skipped')[0].details.reason, 'Row has no id');
        } finally {
            await context.close();
        }
    });

    it('stores an empty CSV as completed, empty source data', async function () {
        const context = await ingested([]);
        try {
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.equal(context.sources.count(), 0);
            assert.deepEqual(await map({url: SITE}, context), {selected: 0, imported: 0, skipped: 0});
        } finally {
            await context.close();
        }
    });

    it('replaces stored rows only when asked, and keeps them when a new read fails', async function () {
        const context = await memoryContext();
        try {
            await ingest(await writeCsv([row('one')]), context);
            const next = await writeCsv([row('two'), row('three')]);
            await assert.rejects(ingest(next, context), /replace/);
            await assert.rejects(ingest('/does/not/exist.csv', context, {replace: true}), /ENOENT/);
            assert.deepEqual(
                (await all(context.sources.records({kind: 'post'}))).map(record => record.key),
                ['one']
            );
            await ingest(next, context, {replace: true});
            assert.deepEqual(
                (await all(context.sources.records({kind: 'post'}))).map(record => record.key),
                ['two', 'three']
            );
        } finally {
            await context.close();
        }
    });
});
