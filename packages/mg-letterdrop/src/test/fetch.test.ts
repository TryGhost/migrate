import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {API_URL, discover, pageRecords, tasks, type FetchTask} from '../lib/fetch.js';
import {TOKEN, apiPost, letterdrop} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

const options = {apiToken: TOKEN};
const api = () => nock('https://app.letterdrop.com').post('/api/v1/posts');

describe('Letterdrop API fetch tasks', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('posts to the Letterdrop API', () => {
        assert.equal(API_URL, 'https://app.letterdrop.com/api/v1/posts');
    });

    it('keys records by post ID, with their page, and drops empty entries', () => {
        const records = pageRecords([apiPost('1'), {id: ''}, null as any], 2);
        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'post:id:1', 'json', {page: 2}],
                ['post', null, 'json', {page: 2}]
            ]
        );
        assert.equal(JSON.parse(records[0].content).title, 'Post 1');
    });

    it('yields one task per page, 20 posts at a time, while the API has more', async () => {
        const requests = letterdrop([[apiPost('1')], [apiPost('2')], [apiPost('3')]]);
        const seen: [string, string, number][] = [];
        for await (const task of tasks(options)) {
            const records = await task.records();
            // A page is requested once, however often its records are read.
            await task.records();
            seen.push([task.title, records[0].key!, task.page]);
        }
        assert.deepEqual(seen, [
            ['Fetching posts, page 1', 'post:id:1', 1],
            ['Fetching posts, page 2', 'post:id:2', 2],
            ['Fetching posts, page 3', 'post:id:3', 3]
        ]);
        assert.deepEqual(requests, ['0:20', '20:20', '40:20']);
    });

    it('fetches the next page itself when a task was not run', async () => {
        const requests = letterdrop([[apiPost('1')], [apiPost('2')]]);
        const list = await all(tasks(options));
        assert.deepEqual(
            list.map(task => task.page),
            [1, 2]
        );
        assert.deepEqual(requests, ['0:20', '20:20']);
        assert.deepEqual(
            (await list[1].records()).map(record => record.key),
            ['post:id:2']
        );
        assert.equal(requests.length, 2);
    });

    it('stops at an empty page even if the API reports another', async () => {
        api().reply(200, {data: [], meta: {hasNextPage: true}});
        const list = await all(tasks(options));
        assert.equal(list.length, 1);
        assert.deepEqual(await list[0].records(), []);
        api().reply(200, {data: [apiPost('1')]});
        assert.equal((await all(tasks(options))).length, 1);
    });

    it('counts posts for --info without storing them', async () => {
        letterdrop([[apiPost('1'), apiPost('2')], [apiPost('3')]]);
        assert.deepEqual(await discover(options), {totals: {posts: 3}});
    });

    it('needs an API token', async () => {
        await assert.rejects(all(tasks({apiToken: ''})), /A Letterdrop API token is required/);
    });

    it('writes only inside a source ingestion', async () => {
        letterdrop([[apiPost('1')]]);
        const {value: task} = (await tasks(options).next()) as {value: FetchTask};
        await assert.rejects(task.task({}), /run them inside context\.sources\.ingest\(\)/);
    });

    it('reports API errors without the API token', async () => {
        api().reply(401, {message: `Invalid API key ${TOKEN}`});
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, 'Failed to fetch Letterdrop posts, page 1: 401 Invalid API key [redacted]');
            return true;
        });
        api().reply(403, {});
        await assert.rejects(all(tasks(options)), /page 1: 403 Forbidden$/);
        api().reply(200, {message: 'ok'});
        await assert.rejects(all(tasks(options)), /page 1: the response has no data array$/);
    });

    it('reports unreadable responses and network failures', async () => {
        api().reply(502, '<html>Bad gateway</html>');
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, 'Failed to fetch Letterdrop posts, page 1: 502 Bad Gateway');
            return true;
        });
        api().replyWithError('socket hang up');
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, 'Failed to fetch Letterdrop posts, page 1');
            return true;
        });
    });
});
