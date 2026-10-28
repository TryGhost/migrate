import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {ingest, map, parse} from '../index.js';
import {EMPTY_FIXTURE, FIXTURE, SITE, all, cleanUp, events, ingested, memoryContext, row, writeCsv} from './helpers.js';

describe('Reading a Wix posts CSV', function () {
    after(cleanUp);

    it('yields each row as a post record keyed by its ID', async function () {
        const records = await all(parse(FIXTURE));
        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'id:post-1', 'json', {file: 'posts.csv', row: 1}],
                ['post', 'id:post-2', 'json', {file: 'posts.csv', row: 2}]
            ]
        );
        const data = JSON.parse(records[0].content);
        assert.equal(data.Title, 'Hello Wix');
        assert.equal(data['Published Date'], '2025-10-01T10:00:00Z');
    });

    it('keys rows without an ID by their URL, then their slug', async function () {
        const path = await writeCsv([
            row('', {'Post Page URL': '/post/by-url', Slug: 'ignored'}),
            row('', {'Post Page URL': '', Slug: 'by-slug'}),
            row('', {'Post Page URL': '', Slug: ''})
        ]);
        assert.deepEqual(
            (await all(parse(path))).map(record => record.key),
            ['url:/post/by-url', 'slug:by-slug', null]
        );
    });

    it('keeps the most recently published row of a repeated post and reports the conflict', async function () {
        const context = await ingested([
            row('one', {Title: 'First', 'Last Published Date': '2025-02-01T00:00:00Z'}),
            row('one', {Title: 'Newer', 'Last Published Date': '2025-03-01T00:00:00Z'}),
            row('one', {Title: 'Same time', 'Last Published Date': '2025-03-01T00:00:00Z'}),
            row('one', {Title: 'Undated', 'Last Published Date': '', 'Published Date': ''}),
            row('one', {Title: 'Newer', 'Last Published Date': '2025-03-01T00:00:00Z'}),
            row('two', {Title: 'Published only'}),
            row('two', {Title: 'Older', 'Published Date': '2024-01-01T00:00:00Z'}),
            row('', {'Post Page URL': '', Slug: '', Title: 'No key'})
        ]);
        try {
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'wix-csv', file: 'posts.csv'});
            assert.equal(context.sources.count('post'), 3);
            assert.equal(JSON.parse(context.sources.get('post', 'id:one')!.content).Title, 'Newer');
            assert.equal(JSON.parse(context.sources.get('post', 'id:two')!.content).Title, 'Published only');
            const conflicts = events(context, 'source:conflict');
            assert.deepEqual(
                conflicts.map(event => [event.details.row, event.details.reason]),
                [
                    [2, 'Later record replaced the earlier one'],
                    [3, 'Earlier record retained'],
                    [4, 'Earlier record retained'],
                    [7, 'Earlier record retained']
                ]
            );

            // The unkeyed row is stored but skipped when mapped.
            const summary = await map({url: SITE}, context);
            assert.deepEqual(summary, {selected: 3, imported: 2, skipped: 1});
            assert.equal(events(context, 'record:skipped')[0].details.reason, 'Row has no ID, Post Page URL or Slug');
        } finally {
            await context.close();
        }
    });

    it('stores a CSV without rows as completed, empty source data', async function () {
        const context = await memoryContext();
        try {
            await ingest(EMPTY_FIXTURE, context);
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
                ['id:one']
            );
            await ingest(next, context, {replace: true});
            assert.deepEqual(
                (await all(context.sources.records({kind: 'post'}))).map(record => record.key),
                ['id:two', 'id:three']
            );
        } finally {
            await context.close();
        }
    });
});
