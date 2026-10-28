import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {pageRecords, postsURL, tasks, type FetchTask} from '../lib/fetch.js';
import {BLOG, KEY, OTHER, apiPost, blogger} from './helpers.js';

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

const options = {apiKey: KEY, blogIDs: [BLOG], requestDelay: 0};

describe('Blogger API fetch tasks', () => {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('builds the posts URL with the API key and page token', () => {
        assert.equal(postsURL(BLOG, 'a b'), `https://www.googleapis.com/blogger/v3/blogs/${BLOG}/posts?key=a+b`);
        assert.equal(
            postsURL(BLOG, KEY, 'next'),
            `https://www.googleapis.com/blogger/v3/blogs/${BLOG}/posts?key=${KEY}&pageToken=next`
        );
    });

    it('keys records by post ID, with their blog and page', () => {
        const records = pageRecords(BLOG, [apiPost('1'), {id: ''}], 2);
        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'post:id:1', 'json', {blog: BLOG, page: 2}],
                ['post', null, 'json', {blog: BLOG, page: 2}]
            ]
        );
        assert.equal(JSON.parse(records[0].content).title, 'Post 1');
    });

    it('yields one task per page, following page tokens blog by blog', async () => {
        const requests = blogger({[BLOG]: [[apiPost('1')], [apiPost('2')]], [OTHER]: [[apiPost('3')]]});
        const seen: [string, string, number][] = [];
        for await (const task of tasks({...options, blogIDs: [BLOG, OTHER]})) {
            const records = await task.records();
            // A page is requested once, however often its records are read.
            await task.records();
            seen.push([task.title, records[0].key!, task.page]);
        }
        assert.deepEqual(seen, [
            [`Fetching posts for blog ${BLOG}, page 1`, 'post:id:1', 1],
            [`Fetching posts for blog ${BLOG}, page 2`, 'post:id:2', 2],
            [`Fetching posts for blog ${OTHER}, page 1`, 'post:id:3', 1]
        ]);
        assert.deepEqual(requests, [`${BLOG}?`, `${BLOG}?&pageToken=2`, `${OTHER}?`]);
    });

    it('fetches the next page token itself when a task was not run', async () => {
        const requests = blogger({[BLOG]: [[apiPost('1')], [apiPost('2')]]});
        const list = await all(tasks(options));
        assert.deepEqual(
            list.map(task => task.page),
            [1, 2]
        );
        assert.deepEqual(requests, [`${BLOG}?`, `${BLOG}?&pageToken=2`]);
        assert.deepEqual(
            (await list[1].records()).map(record => record.key),
            ['post:id:2']
        );
        assert.equal(requests.length, 2);
    });

    it('reads a page without items as empty', async () => {
        nock('https://www.googleapis.com')
            .get(`/blogger/v3/blogs/${BLOG}/posts`)
            .query(true)
            .reply(200, {kind: 'blogger#postList', nextPageToken: ''});
        const list = await all(tasks(options));
        assert.equal(list.length, 1);
        assert.deepEqual(await list[0].records(), []);
    });

    it('waits before each request by default', async () => {
        blogger({[BLOG]: [[apiPost('1')]]});
        const started = Date.now();
        const [task] = await all(tasks({apiKey: KEY, blogIDs: [BLOG]}));
        assert.ok(Date.now() - started >= 450);
        assert.equal((await task.records()).length, 1);
    });

    it('writes only inside a source ingestion', async () => {
        blogger({[BLOG]: [[apiPost('1')]]});
        const {value: task} = (await tasks(options).next()) as {value: FetchTask};
        await assert.rejects(task.task({}), /run them inside context\.sources\.ingest\(\)/);
    });

    it('reports API errors without the API key', async () => {
        blogger({});
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, `Failed to fetch Blogger content for blog ${BLOG}: 404 Blog not found`);
            assert.doesNotMatch(error.message, new RegExp(KEY));
            return true;
        });
        nock.cleanAll();
        nock('https://www.googleapis.com').get(`/blogger/v3/blogs/${BLOG}/posts`).query(true).reply(403, {});
        await assert.rejects(all(tasks(options)), /for blog 12345678: 403 Forbidden$/);
    });

    it('reports unreadable responses and network failures', async () => {
        nock('https://www.googleapis.com')
            .get(`/blogger/v3/blogs/${BLOG}/posts`)
            .query(true)
            .reply(502, '<html>Bad gateway</html>');
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, `Failed to fetch Blogger content for blog ${BLOG}: 502 Bad Gateway`);
            return true;
        });
        nock.cleanAll();
        nock('https://www.googleapis.com')
            .get(`/blogger/v3/blogs/${BLOG}/posts`)
            .query(true)
            .replyWithError('socket hang up');
        await assert.rejects(all(tasks(options)), (error: any) => {
            assert.equal(error.message, `Failed to fetch Blogger content for blog ${BLOG}`);
            return true;
        });
    });
});
