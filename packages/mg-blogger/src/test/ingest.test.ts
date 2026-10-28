import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {ingest, map, parse, sourceBlogs} from '../index.js';
import {BLOG, KEY, OTHER, apiPost, blogger, events, memoryContext, stored} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

const keys = async (context: Awaited<ReturnType<typeof memoryContext>>) =>
    (await all(context.sources.records({kind: 'post'}))).map(record => record.key);

describe('Fetching Blogger blogs', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('yields every page of posts without storing them', async () => {
        blogger({[BLOG]: [[apiPost('1'), apiPost('2')], [apiPost('3')]]});
        const titles: string[] = [];
        const records = await all(parse(BLOG, {apiKey: KEY, requestDelay: 0, onProgress: title => titles.push(title)}));
        assert.deepEqual(
            records.map(record => record.key),
            ['post:id:1', 'post:id:2', 'post:id:3']
        );
        assert.deepEqual(titles, [
            `Fetching posts for blog ${BLOG}, page 1`,
            `Fetching posts for blog ${BLOG}, page 2`
        ]);
        assert.equal((await all(parse([BLOG], {apiKey: KEY, requestDelay: 0}))).length, 3);
    });

    it('stores every blog in order with the blog IDs, keeping the newest copy of a repeated post', async () => {
        blogger({
            [BLOG]: [
                [apiPost('1'), apiPost('2')],
                // Paging while posts change can return a post again on a later page.
                [apiPost('2', {title: 'Updated', updated: '2021-01-01T00:00:00Z'}), apiPost('1', {title: 'Older'})]
            ],
            [OTHER]: [[apiPost('3', {blog: {id: OTHER}})]]
        });
        const context = await memoryContext();
        try {
            const titles: string[] = [];
            await ingest([BLOG, OTHER], context, {
                apiKey: KEY,
                requestDelay: 0,
                onProgress: title => titles.push(title)
            });
            assert.equal(titles.length, 3);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'blogger', blogs: [BLOG, OTHER]});
            assert.deepEqual(sourceBlogs(context), [BLOG, OTHER]);
            assert.deepEqual(await keys(context), ['post:id:1', 'post:id:2', 'post:id:3']);
            assert.equal(JSON.parse(context.sources.get('post', 'post:id:2')!.content).title, 'Updated');
            assert.equal(JSON.parse(context.sources.get('post', 'post:id:1')!.content).title, 'Post 1');
            assert.deepEqual(
                events(context, 'source:conflict').map(event => [event.details.key, event.details.reason]),
                [
                    ['post:id:2', 'Later record replaced the earlier one'],
                    ['post:id:1', 'Earlier record retained']
                ]
            );
            assert.equal(JSON.stringify(context.sources.currentIngestion).includes(KEY), false);
        } finally {
            await context.close();
        }
    });

    it('replaces stored posts only when asked, and keeps them when a fetch fails', async () => {
        blogger({[BLOG]: [[apiPost('1')]]});
        const context = await memoryContext();
        try {
            await ingest(BLOG, context, {apiKey: KEY, requestDelay: 0});
            await assert.rejects(ingest(BLOG, context, {apiKey: KEY, requestDelay: 0}), /replace/);
            await assert.rejects(
                ingest(BLOG, context, {apiKey: 'wrong', requestDelay: 0, replace: true}),
                /400 API key not valid/
            );
            assert.deepEqual(await keys(context), ['post:id:1']);
            nock.cleanAll();
            blogger({[BLOG]: [[apiPost('2'), apiPost('3')]]});
            await ingest(BLOG, context, {apiKey: KEY, requestDelay: 0, replace: true});
            assert.deepEqual(await keys(context), ['post:id:2', 'post:id:3']);
        } finally {
            await context.close();
        }
    });

    it('stores a blog without posts as completed source data', async () => {
        blogger({[BLOG]: [[]]});
        const context = await memoryContext();
        try {
            await ingest(BLOG, context, {apiKey: KEY, requestDelay: 0});
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(await map({}, context), {selected: 0, imported: 0, skipped: 0});
        } finally {
            await context.close();
        }
    });

    it('needs the blog IDs stored with the source data', async () => {
        const context = await stored({[BLOG]: [apiPost('1')]}, {blogs: null});
        try {
            assert.throws(() => sourceBlogs(context), /no blog IDs/);
            await assert.rejects(map({}, context), /no blog IDs/);
        } finally {
            await context.close();
        }
    });
});
