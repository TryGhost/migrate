import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import type {SourceIngestion} from '@tryghost/mg-context';
import wpApi, {discover, tasks, ingest, parse, sourceSite} from '../index.js';
import {pageRecords} from '../lib/fetch.js';
import {canonicalSite} from '../lib/ingest.js';
import {SITE, wordpress, post, user, memoryContext, reset} from './helpers.js';

async function collect<T>(input: AsyncIterable<T>): Promise<T[]> {
    const values: T[] = [];
    for await (const value of input) {
        values.push(value);
    }
    return values;
}

describe('WordPress API ingestion', function () {
    beforeEach(() => nock.disableNetConnect());
    afterEach(reset);

    it('stores posts, pages, custom post types and users keyed by type and ID', async function () {
        const requests = wordpress({
            posts: [post(1), post(2), post(3)],
            pages: [post(4, {type: 'page'})],
            books: [post(5, {type: 'book'})],
            users: [user(1, 'admin')]
        });
        const context = await memoryContext();
        try {
            const titles: string[] = [];
            await ingest(SITE, context, {limit: 2, cpt: ['books'], onProgress: title => titles.push(title)});
            assert.deepEqual(titles, [
                'Fetching posts, page 1 of 2',
                'Fetching posts, page 2 of 2',
                'Fetching pages, page 1 of 1',
                'Fetching books, page 1 of 1',
                'Fetching users, page 1 of 1'
            ]);
            const keys = [];
            for await (const record of context.sources.records()) {
                keys.push(`${record.kind} ${record.key}`);
            }
            assert.deepEqual(keys, [
                'content post:id:1',
                'content post:id:2',
                'content post:id:3',
                'content page:id:4',
                'content book:id:5',
                'user user:id:1'
            ]);
            assert.deepEqual(context.sources.get('content', 'post:id:3')!.metadata, {endpoint: 'posts', page: 2});
            assert.deepEqual(context.sources.currentIngestion!.metadata, {
                adapter: 'wp-api',
                url: SITE,
                limit: 2,
                cpt: ['books'],
                postsBefore: null,
                postsAfter: null,
                maxPosts: 0,
                batch: 0,
                usersFile: false
            });
            assert.deepEqual(sourceSite(context), {url: SITE, site: 'example.com'});
            const pageRequest = requests.find(request => request.searchParams.get('page') === '2')!;
            assert.equal(pageRequest.searchParams.get('_embed'), 'true');
            assert.equal(pageRequest.searchParams.get('context'), null);

            await assert.rejects(ingest(SITE, context), /explicitly request replacement/);
            // posts/pages flags are map-time filters, so a reread still fetches both; --cpt narrows the fetch.
            await ingest(SITE, context, {replace: true, posts: false} as any);
            assert.equal(context.sources.count('content'), 4);
        } finally {
            await context.close();
        }
    });

    it('keeps the most recently modified version of an object returned twice', async function () {
        wordpress({
            posts: [
                post(1),
                post(2),
                post(1, {modified_gmt: '2024-03-01T00:00:00', title: {rendered: 'Newer'}}),
                post(2, {modified_gmt: '2023-01-01T00:00:00', title: {rendered: 'Older'}}),
                post(1, {modified_gmt: '2024-03-01T00:00:00', title: {rendered: 'Newer'}})
            ],
            users: [user(1, 'admin'), user(1, 'admin')]
        });
        const context = await memoryContext();
        try {
            await ingest(SITE, context, {limit: 2});
            assert.equal(JSON.parse(context.sources.get('content', 'post:id:1')!.content).title.rendered, 'Newer');
            assert.equal(JSON.parse(context.sources.get('content', 'post:id:2')!.content).title.rendered, 'Title 2');
            const conflicts = context.getMigrationReport().events.filter(event => event.type === 'source:conflict');
            assert.deepEqual(
                conflicts.map(event => (event.details as any).reason),
                ['Later record replaced the earlier one', 'Earlier record retained']
            );
        } finally {
            await context.close();
        }
    });

    it('fetches one content batch plus every user page', async function () {
        wordpress({posts: [post(1), post(2)], pages: [post(3, {type: 'page'})], users: [user(1, 'a'), user(2, 'b')]});
        const context = await memoryContext();
        try {
            await ingest(SITE, context, {limit: 1, batch: 3});
            assert.deepEqual(
                (await collect(context.sources.records())).map(record => record.key),
                ['page:id:3', 'user:id:1', 'user:id:2']
            );
            assert.equal(context.sources.currentIngestion!.metadata.batch, 3);
            await assert.rejects(
                ingest(SITE, context, {limit: 1, batch: 4, replace: true}),
                /Batch 4 does not exist; there are 3 batches/
            );
            assert.equal(context.sources.count(), 3);
        } finally {
            await context.close();
        }
    });

    it('stores a users file instead of fetching users', async function () {
        const requests = wordpress({posts: [post(1)], users: [user(9, 'ignored')]});
        const context = await memoryContext();
        try {
            const usersJSON = [{id: 1, slug: 'one'}, {slug: 'two'}, {name: 'Nameless'}, {id: 1, slug: 'duplicate'}];
            const titles: string[] = [];
            await ingest(SITE, context, {usersJSON, batch: 1, onProgress: title => titles.push(title)});
            assert.deepEqual(titles, ['Fetching posts, page 1 of 1', 'Storing 4 users from the users file']);
            assert.equal(
                requests.some(request => request.pathname.endsWith('/users')),
                false
            );
            assert.deepEqual(
                (await collect(context.sources.records({kind: 'user'}))).map(record => [record.key, record.metadata]),
                [
                    ['user:id:1', {endpoint: 'users-file', index: 0}],
                    ['user:slug:two', {endpoint: 'users-file', index: 1}],
                    [null, {endpoint: 'users-file', index: 2}]
                ]
            );
            assert.equal(context.sources.currentIngestion!.metadata.usersFile, true);
        } finally {
            await context.close();
        }
    });

    it('fetches only the post pages maxPosts needs and passes date bounds to the API', async function () {
        const requests = wordpress({posts: [post(1), post(2), post(3), post(4), post(5)], users: []});
        const context = await memoryContext();
        try {
            await ingest(SITE, context, {
                limit: 2,
                maxPosts: 3,
                postsBefore: '2025-01-01',
                postsAfter: '2023-01-01'
            });
            assert.equal(context.sources.count('content'), 4);
            const postRequests = requests.filter(request => request.pathname.endsWith('/posts'));
            for (const request of postRequests) {
                assert.equal(request.searchParams.get('before'), new Date('2025-01-01').toISOString());
                assert.equal(request.searchParams.get('after'), new Date('2023-01-01').toISOString());
            }
            assert.equal(context.sources.currentIngestion!.metadata.maxPosts, 3);
        } finally {
            await context.close();
        }
    });

    it('authenticates requests and can trust self-signed certificates', async function () {
        // Requests without these credentials match no interceptor and fail.
        const requests = wordpress(
            {posts: [post(1)], users: [user(1, 'a')]},
            {authorization: `Basic ${Buffer.from('admin:secret').toString('base64')}`}
        );
        const previous = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
        const context = await memoryContext();
        try {
            await ingest(SITE, context, {
                apiUser: {username: 'admin', password: 'secret'},
                trustSelfSignedCert: true
            });
            assert.equal(process.env.NODE_TLS_REJECT_UNAUTHORIZED, '0');
            const page = requests.find(request => request.searchParams.get('page') === '1')!;
            assert.equal(page.searchParams.get('context'), 'edit');
        } finally {
            if (previous === undefined) {
                delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
            } else {
                process.env.NODE_TLS_REJECT_UNAUTHORIZED = previous;
            }
            await context.close();
        }
    });

    it('parses records page by page without storing them', async function () {
        wordpress({posts: [post(1), post(1)], users: [user(1, 'a')]});
        const titles: string[] = [];
        const records = await collect(parse(SITE, {limit: 1, onProgress: title => titles.push(title)}));
        assert.deepEqual(
            records.map(record => record.key),
            ['post:id:1', 'post:id:1', 'user:id:1']
        );
        assert.equal(titles.length, 3);
        assert.deepEqual(
            (await collect(parse(SITE, {limit: 1, batch: 2}))).map(record => record.key),
            ['post:id:1', 'user:id:1']
        );
        assert.deepEqual(
            (await collect(parse(SITE))).map(record => record.key),
            ['post:id:1', 'post:id:1', 'user:id:1']
        );
    });

    it('requires a staging handle to run fetch tasks', async function () {
        wordpress({posts: [post(1)], users: [user(1, 'a')]});
        const list = await tasks(SITE, {options: {}});
        assert.equal(list.length, 2);
        await assert.rejects(list[0].task({options: {}}), /ctx\.sourceIngestion/);
        const writes: string[] = [];
        const stage = {reconcile: (record: any) => writes.push(record.key)} as unknown as SourceIngestion;
        await list[0].task({options: {}, sourceIngestion: stage});
        assert.deepEqual(writes, ['post:id:1']);
    });

    it('discovers totals for the selected content', async function () {
        wordpress({posts: [post(1), post(2)], pages: [], books: [post(3, {type: 'book'})], users: [user(1, 'a')]});
        const info = await discover(SITE, {posts: true, pages: true, limit: 1, cpt: ['books']});
        assert.deepEqual(info.totals, {books: 1, posts: 2, pages: 0, users: 1});
        assert.deepEqual(info.batches, {books: 1, posts: 2, pages: 0, users: 1});
        const none = await wpApi.discover(SITE, {usersJSON: [{id: 1}], limit: 1});
        assert.deepEqual(none.totals, {});
        assert.equal(wpApi.fetch.discover, discover);
    });

    it('falls back to the endpoint name for objects without a type', function () {
        assert.equal(pageRecords('books', [{id: 7}], 1)[0].key, 'books:id:7');
        assert.equal(pageRecords('users', [{id: 7, type: 'ignored'}], 1)[0].key, 'user:id:7');
    });

    it('requires an HTTP site URL and completed source data', async function () {
        assert.equal(canonicalSite('https://Example.com/blog//'), 'example.com/blog');
        assert.throws(() => canonicalSite('ftp://example.com'), /HTTP or HTTPS/);
        const context = await memoryContext();
        try {
            assert.throws(() => sourceSite(context), /no site URL/);
        } finally {
            await context.close();
        }
    });
});
