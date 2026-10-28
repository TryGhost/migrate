import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import type {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '../index.js';
import {SITE, all, events, feedXml, itemXml, memoryContext, serve} from './helpers.js';

const keys = async (context: MigrateContext) =>
    (await all(context.sources.records())).map(record => `${record.kind}:${record.key}`);

describe('Ingesting a Libsyn feed', function () {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('stores the items and channel, keeping the latest copy of a repeated item', async function () {
        serve(
            feedXml([
                itemXml('1'),
                itemXml('2'),
                // A repeated GUID keeps the copy with the latest pubDate, wherever it appears.
                itemXml('2', {title: 'Older', pubDate: 'Sun, 09 Aug 2020 07:00:00 +0000'}),
                itemXml('1', {title: 'Newer', pubDate: 'Tue, 11 Aug 2020 07:00:00 +0000'}),
                itemXml('3', {guid: null, pubDate: 'never'}),
                itemXml('3', {guid: null, title: 'Dated'})
            ])
        );
        const context = await memoryContext();
        try {
            await ingest(SITE, context);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {
                adapter: 'libsyn',
                feed: `${SITE}/rss/?include-libsyn-metadata=true`
            });
            assert.deepEqual(await keys(context), [
                'item:guid:guid-1',
                'item:guid:guid-2',
                'item:link:https://traffic.libsyn.com/secure/exampleshow/episode-3.mp3',
                'channel:channel'
            ]);
            const title = (key: string) => JSON.parse(context.sources.get('item', key)!.content).title;
            assert.equal(title('guid:guid-1'), 'Newer');
            assert.equal(title('guid:guid-2'), 'Episode 2');
            assert.equal(title('link:https://traffic.libsyn.com/secure/exampleshow/episode-3.mp3'), 'Dated');
            assert.deepEqual(
                events(context, 'source:conflict').map(event => [event.details.key, event.details.reason]),
                [
                    ['guid:guid-2', 'Earlier record retained'],
                    ['guid:guid-1', 'Later record replaced the earlier one'],
                    [
                        'link:https://traffic.libsyn.com/secure/exampleshow/episode-3.mp3',
                        'Later record replaced the earlier one'
                    ]
                ]
            );
        } finally {
            await context.close();
        }
    });

    it('stores a feed without episodes as completed source data', async function () {
        serve(feedXml([]));
        const context = await memoryContext();
        try {
            await ingest(SITE, context);
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(await map({url: SITE}, context), {selected: 0, imported: 0, skipped: 0});
            assert.deepEqual(await all(context.streamAuthors({scope: 'all'})), []);
        } finally {
            await context.close();
        }
    });

    it('replaces the stored feed only when asked, and keeps it when a fetch fails', async function () {
        serve(feedXml([itemXml('1')]));
        const context = await memoryContext();
        try {
            await ingest(SITE, context);
            await assert.rejects(ingest(SITE, context), /replace/);
            serve('Server error', 500);
            await assert.rejects(ingest(SITE, context, {replace: true}), /500/);
            assert.deepEqual(await keys(context), ['item:guid:guid-1', 'channel:channel']);

            serve(feedXml([itemXml('2')]));
            await ingest(SITE, context, {replace: true});
            assert.deepEqual(await keys(context), ['item:guid:guid-2', 'channel:channel']);
        } finally {
            await context.close();
        }
    });
});
