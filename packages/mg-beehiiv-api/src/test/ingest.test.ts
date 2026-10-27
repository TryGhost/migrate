import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {ingest, map, parse, sourcePublication} from '../index.js';
import {KEY, PUB, apiPost, beehiiv, events, memoryContext, stored} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

describe('Fetching a beehiiv publication', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('yields every page of posts without storing them', async () => {
        beehiiv(Array.from({length: 11}, (_, index) => apiPost(`post_${index + 1}`)));
        const titles: string[] = [];
        const records = await all(parse(PUB, {key: KEY, onProgress: title => titles.push(title)}));
        assert.equal(records.length, 11);
        assert.deepEqual(titles, ['Fetching posts page 1 of 2', 'Fetching posts page 2 of 2']);
        assert.deepEqual(await all(parse(PUB, {key: KEY})).then(items => items.length), 11);
    });

    it('stores the posts with the publication, keeping the first copy of a repeated post', async () => {
        const posts = Array.from({length: 10}, (_, index) => apiPost(`post_${index + 1}`));
        // Paging while a post is published can return the last post of page one again on page two.
        posts.push(apiPost('post_10', {title: 'Changed'}), apiPost('post_11'));
        beehiiv(posts);
        const context = await memoryContext();
        try {
            const titles: string[] = [];
            await ingest(PUB, context, {key: KEY, onProgress: title => titles.push(title)});
            assert.deepEqual(titles, ['Fetching posts page 1 of 2', 'Fetching posts page 2 of 2']);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'beehiiv-api', publication: PUB});
            assert.equal(sourcePublication(context), PUB);
            assert.equal(context.sources.count('post'), 11);
            assert.equal(JSON.parse(context.sources.get('post', 'post_10')!.content).title, 'Title post_10');
            const [conflict] = events(context, 'source:conflict');
            assert.equal(conflict.details.reason, 'Earlier record retained');
            assert.equal(conflict.details.page, 2);
        } finally {
            await context.close();
        }
    });

    it('replaces stored posts only when asked, and keeps them when a fetch fails', async () => {
        beehiiv([apiPost('post_1')]);
        const context = await memoryContext();
        try {
            await ingest(PUB, context, {key: KEY});
            await assert.rejects(ingest(PUB, context, {key: KEY}), /replace/);
            nock.cleanAll();
            nock('https://api.beehiiv.com').get(`/v2/publications/${PUB}/posts`).query(true).reply(500, {});
            await assert.rejects(ingest(PUB, context, {key: KEY, replace: true}), /Request failed: 500/);
            assert.deepEqual(
                (await all(context.sources.records({kind: 'post'}))).map(record => record.key),
                ['post_1']
            );
            nock.cleanAll();
            beehiiv([apiPost('post_2'), apiPost('post_3')]);
            await ingest(PUB, context, {key: KEY, replace: true});
            assert.deepEqual(
                (await all(context.sources.records({kind: 'post'}))).map(record => record.key),
                ['post_2', 'post_3']
            );
        } finally {
            await context.close();
        }
    });

    it('needs the publication ID stored with the source data', async () => {
        const context = await stored([apiPost('post_1')], {publication: null});
        try {
            assert.throws(() => sourcePublication(context), /no publication ID/);
            await assert.rejects(map({}, context), /no publication ID/);
        } finally {
            await context.close();
        }
    });
});
