import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {fetchTasks, authedClient} from '../lib/fetch.js';

describe('beehiiv API Fetch', () => {
    let fetchMock: any;

    beforeEach(() => {
        fetchMock = mock.method(global, 'fetch', () => Promise.resolve());
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe('authedClient', () => {
        it('makes authenticated GET request', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({ok: true, json: () => Promise.resolve({data: []})}));

            const url = new URL('https://api.beehiiv.com/v2/publications');
            await authedClient('test-api-key', url);

            assert.equal(fetchMock.mock.callCount(), 1);
            const [calledUrl, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(calledUrl.toString(), 'https://api.beehiiv.com/v2/publications');
            assert.equal(options.method, 'GET');
            assert.equal(options.headers.Authorization, 'Bearer test-api-key');
        });
    });

    describe('fetchTasks', () => {
        it('creates correct number of tasks based on total posts', async () => {
            // Mock the discover call (limit=1)
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 25, data: []})
            }), 0);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    readTmpJSONFile: () => Promise.resolve({}),
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);

            // 25 posts / 10 per page = 3 pages
            assert.equal(tasks.length, 3);
            assert.equal(tasks[0].title, 'Fetching posts page 1 of 3');
            assert.equal(tasks[1].title, 'Fetching posts page 2 of 3');
            assert.equal(tasks[2].title, 'Fetching posts page 3 of 3');
        });

        it('task fetches posts and adds to context', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 5, data: []})
            }), 0);

            // Mock the actual fetch call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [{id: 'post-1', title: 'Test Post'}]
                })
            }), 1);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);

            // Execute the first task
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.posts.length, 1);
            assert.equal((ctx.result.posts[0] as any).id, 'post-1');
        });

        it('task uses cached data when available', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 5, data: []})
            }), 0);

            const cachedData = {data: [{id: 'cached-post', title: 'Cached Post'}]};
            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => true,
                    readTmpJSONFile: () => Promise.resolve(cachedData)
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            // Should use cached data, not make another API call
            assert.equal(ctx.result.posts.length, 1);
            assert.equal((ctx.result.posts[0] as any).id, 'cached-post');
            // fetch should only be called once (for discover), not twice
            assert.equal(fetchMock.mock.callCount(), 1);
        });

        it('task throws and sets output on fetch error', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 5, data: []})
            }), 0);

            // Mock a failed fetch
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            }), 1);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            }, /Request failed: 500 Internal Server Error/);

            assert.ok(mockTask.output.includes('500'));
        });

        it('task handles non-Error thrown objects', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 5, data: []})
            }), 0);

            // Mock fetch that throws a non-Error value (string)
            fetchMock.mock.mockImplementationOnce(() => {
                // eslint-disable-next-line no-throw-literal
                throw 'Network error string';
            }, 1);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            });

            // Verify String() conversion was used
            assert.equal(mockTask.output, 'Network error string');
        });

        it('filters posts with postsAfter', async () => {
            const jan1 = new Date('2024-01-01').getTime() / 1000;
            const feb1 = new Date('2024-02-01').getTime() / 1000;
            const mar1 = new Date('2024-03-01').getTime() / 1000;

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 3, data: []})
            }), 0);

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [
                        {id: 'post-jan', publish_date: jan1},
                        {id: 'post-feb', publish_date: feb1},
                        {id: 'post-mar', publish_date: mar1}
                    ]
                })
            }), 1);

            const options = {key: 'test-key', id: 'pub-123', postsAfter: '2024-02-01'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.posts.length, 2);
            assert.equal((ctx.result.posts[0] as any).id, 'post-feb');
            assert.equal((ctx.result.posts[1] as any).id, 'post-mar');
        });

        it('filters posts with postsBefore', async () => {
            const jan1 = new Date('2024-01-01').getTime() / 1000;
            const feb1 = new Date('2024-02-01').getTime() / 1000;
            const mar1 = new Date('2024-03-01').getTime() / 1000;

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 3, data: []})
            }), 0);

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [
                        {id: 'post-jan', publish_date: jan1},
                        {id: 'post-feb', publish_date: feb1},
                        {id: 'post-mar', publish_date: mar1}
                    ]
                })
            }), 1);

            const options = {key: 'test-key', id: 'pub-123', postsBefore: '2024-02-01'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.posts.length, 2);
            assert.equal((ctx.result.posts[0] as any).id, 'post-jan');
            assert.equal((ctx.result.posts[1] as any).id, 'post-feb');
        });

        it('filters posts with both postsAfter and postsBefore', async () => {
            const jan1 = new Date('2024-01-01').getTime() / 1000;
            const feb1 = new Date('2024-02-01').getTime() / 1000;
            const mar1 = new Date('2024-03-01').getTime() / 1000;
            const apr1 = new Date('2024-04-01').getTime() / 1000;

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 4, data: []})
            }), 0);

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [
                        {id: 'post-jan', publish_date: jan1},
                        {id: 'post-feb', publish_date: feb1},
                        {id: 'post-mar', publish_date: mar1},
                        {id: 'post-apr', publish_date: apr1}
                    ]
                })
            }), 1);

            const options = {key: 'test-key', id: 'pub-123', postsAfter: '2024-02-01', postsBefore: '2024-03-01'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.posts.length, 2);
            assert.equal((ctx.result.posts[0] as any).id, 'post-feb');
            assert.equal((ctx.result.posts[1] as any).id, 'post-mar');
        });

        it('does not filter when neither postsAfter nor postsBefore is set', async () => {
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 2, data: []})
            }), 0);

            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [
                        {id: 'post-1', publish_date: 1704067200},
                        {id: 'post-2', publish_date: 1706745600}
                    ]
                })
            }), 1);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {posts: [] as any[]}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.posts.length, 2);
        });

        it('handles discover error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            }));

            const options = {key: 'invalid-key', id: 'pub-123'};
            const ctx = {
                fileCache: {},
                result: {posts: [] as any[]}
            };

            await assert.rejects(async () => {
                await fetchTasks(options, ctx);
            }, /Request failed: 401 Unauthorized/);
        });
    });
});
