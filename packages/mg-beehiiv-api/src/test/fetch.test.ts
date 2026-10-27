import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {authedClient, discover, pageRecords, tasks} from '../lib/fetch.js';
import {KEY, PUB, apiPost, beehiiv} from './helpers.js';

describe('beehiiv API fetch tasks', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('sends the API key as a bearer token', async () => {
        const scope = nock('https://api.beehiiv.com', {reqheaders: {authorization: 'Bearer abc'}})
            .get('/v2/publications')
            .reply(200, {data: []});
        const response = await authedClient('abc', new URL('https://api.beehiiv.com/v2/publications'));
        assert.equal(response.ok, true);
        assert.ok(scope.isDone());
    });

    it('counts posts and pages from one single-post request', async () => {
        const requests = beehiiv(Array.from({length: 25}, (_, index) => apiPost(`post_${index}`)));
        assert.deepEqual(await discover({key: KEY, id: PUB}), {total: 25, pages: 3});
        assert.deepEqual(requests, ['?limit=1']);
    });

    it('makes one task per page that fetches posts with their web content', async () => {
        const requests = beehiiv(Array.from({length: 12}, (_, index) => apiPost(`post_${index + 1}`)));
        const list = await tasks({key: KEY, id: PUB});
        assert.deepEqual(
            list.map(task => [task.title, task.page]),
            [
                ['Fetching posts page 1 of 2', 1],
                ['Fetching posts page 2 of 2', 2]
            ]
        );
        const records = await list[1].records();
        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'post_11', 'json', {page: 2}],
                ['post', 'post_12', 'json', {page: 2}]
            ]
        );
        assert.equal(JSON.parse(records[0].content).title, 'Title post_11');
        assert.equal(requests[1], '?limit=10&expand=free_web_content&expand=premium_web_content&page=2');
    });

    it('writes only inside a source ingestion', async () => {
        beehiiv([apiPost('post_1')]);
        const [task] = await tasks({key: KEY, id: PUB});
        await assert.rejects(task.task({}), /run them inside context\.sources\.ingest\(\)/);
    });

    it('makes no tasks for an empty publication or a response without totals', async () => {
        beehiiv([]);
        assert.deepEqual(await tasks({key: KEY, id: PUB}), []);
        nock.cleanAll();
        nock('https://api.beehiiv.com').get(`/v2/publications/${PUB}/posts`).query(true).reply(200, {});
        assert.deepEqual(await discover({key: KEY, id: PUB}), {total: 0, pages: 0});
    });

    it('reads a page without data as empty', async () => {
        nock('https://api.beehiiv.com')
            .get(`/v2/publications/${PUB}/posts`)
            .query({limit: '1'})
            .reply(200, {total_results: 1})
            .get(`/v2/publications/${PUB}/posts`)
            .query(true)
            .reply(200, {});
        const [task] = await tasks({key: KEY, id: PUB});
        assert.deepEqual(await task.records(), []);
    });

    it('fails on an unsuccessful response', async () => {
        nock('https://api.beehiiv.com')
            .get(`/v2/publications/${PUB}/posts`)
            .query(true)
            .reply(401, {errors: [{message: 'Unauthorized'}]});
        await assert.rejects(tasks({key: KEY, id: PUB}), /Request failed: 401/);
    });

    it('keys records by post ID, leaving posts without one unkeyed', () => {
        assert.deepEqual(
            pageRecords([{id: 'post_1'}, {title: 'No ID'}], 3).map(record => [record.key, record.metadata]),
            [
                ['post_1', {page: 3}],
                [null, {page: 3}]
            ]
        );
    });
});
