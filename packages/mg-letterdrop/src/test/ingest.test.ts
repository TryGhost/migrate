import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {ingest, map, parse} from '../index.js';
import {SITE, TOKEN, apiPost, events, letterdrop, memoryContext} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

const keys = async (context: Awaited<ReturnType<typeof memoryContext>>) =>
    (await all(context.sources.records({kind: 'post'}))).map(record => record.key);

describe('Fetching Letterdrop posts', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('yields every page of posts without storing them', async () => {
        letterdrop([[apiPost('1'), apiPost('2')], [apiPost('3')]]);
        const titles: string[] = [];
        const records = await all(parse(TOKEN, {onProgress: title => titles.push(title)}));
        assert.deepEqual(
            records.map(record => record.key),
            ['post:id:1', 'post:id:2', 'post:id:3']
        );
        assert.deepEqual(titles, ['Fetching posts, page 1', 'Fetching posts, page 2']);
        assert.equal((await all(parse(TOKEN))).length, 3);
    });

    it('stores every page in order, keeping the newest copy of a repeated post', async () => {
        letterdrop([
            [apiPost('1'), apiPost('2')],
            // Paging while posts change can return a post again on a later page.
            [apiPost('2', {title: 'Updated', updated: '2024-01-01T00:00:00Z'}), apiPost('1', {title: 'Older'})]
        ]);
        const context = await memoryContext();
        try {
            const titles: string[] = [];
            await ingest(TOKEN, context, {onProgress: title => titles.push(title)});
            assert.equal(titles.length, 2);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'letterdrop', pageSize: 20});
            assert.deepEqual(await keys(context), ['post:id:1', 'post:id:2']);
            assert.equal(JSON.parse(context.sources.get('post', 'post:id:2')!.content).title, 'Updated');
            assert.equal(JSON.parse(context.sources.get('post', 'post:id:1')!.content).title, 'Post 1');
            assert.deepEqual(
                events(context, 'source:conflict').map(event => [event.details.key, event.details.reason]),
                [
                    ['post:id:2', 'Later record replaced the earlier one'],
                    ['post:id:1', 'Earlier record retained']
                ]
            );
            assert.equal(JSON.stringify(context.sources.currentIngestion).includes(TOKEN), false);
        } finally {
            await context.close();
        }
    });

    it('stores an empty publication as completed source data', async () => {
        letterdrop([]);
        const context = await memoryContext();
        try {
            await ingest(TOKEN, context);
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(await map({url: SITE}, context), {selected: 0, imported: 0, skipped: 0});
        } finally {
            await context.close();
        }
    });

    it('replaces stored posts only when asked, and keeps them when a fetch fails', async () => {
        letterdrop([[apiPost('1')]]);
        const context = await memoryContext();
        try {
            await ingest(TOKEN, context);
            await assert.rejects(ingest(TOKEN, context), /replace/);
            await assert.rejects(ingest('wrong', context, {replace: true}), /401 Invalid API key/);
            assert.deepEqual(await keys(context), ['post:id:1']);

            nock.cleanAll();
            letterdrop([[apiPost('2')]]);
            await ingest(TOKEN, context, {replace: true});
            assert.deepEqual(await keys(context), ['post:id:2']);
        } finally {
            await context.close();
        }
    });
});
