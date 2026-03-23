import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {listPublications} from '../lib/list-pubs.js';
import {fetchTasks, authedClient, discover, cachedFetch} from '../lib/fetch.js';

describe('beehiiv API Members Fetch', () => {
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

    describe('listPublications', () => {
        it('fetches and returns publications', async () => {
            const mockPubs = [{id: 'pub-1', name: 'Test Pub'}];
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({data: mockPubs})
            }));

            const result = await listPublications('test-key');

            assert.deepEqual(result, mockPubs);
        });

        it('throws on API error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            }));

            await assert.rejects(async () => {
                await listPublications('invalid-key');
            }, /Request failed: 401 Unauthorized/);
        });
    });

    describe('discover', () => {
        it('returns total subscription count', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({data: {stats: {active_subscriptions: 1500}}})
            }));

            const result = await discover('test-key', 'pub-123');

            assert.equal(result, 1500);
        });

        it('throws on API error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 403,
                statusText: 'Forbidden'
            }));

            await assert.rejects(async () => {
                await discover('test-key', 'pub-123');
            }, /Request failed: 403 Forbidden/);
        });
    });

    describe('cachedFetch', () => {
        it('returns cached data when available', async () => {
            const cachedData = {data: [{id: 'sub-1', email: 'test@example.com'}], has_more: false};
            const fileCache = {
                hasFile: () => true,
                readTmpJSONFile: () => Promise.resolve(cachedData)
            };

            const result = await cachedFetch({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                cursor: null,
                cursorIndex: 0
            });

            assert.deepEqual(result, cachedData);
            assert.equal(fetchMock.mock.callCount(), 0);
        });

        it('fetches from API when not cached', async () => {
            const apiData = {data: [{id: 'sub-1', email: 'test@example.com'}], has_more: false, next_cursor: null};
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(apiData)
            }));

            const writeTmpFileMock = mock.fn(() => Promise.resolve());
            const fileCache = {
                hasFile: () => false,
                writeTmpFile: writeTmpFileMock
            };

            const result = await cachedFetch({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                cursor: null,
                cursorIndex: 0
            });

            assert.deepEqual(result, apiData);
            assert.equal(writeTmpFileMock.mock.callCount(), 1);
        });

        it('includes cursor when provided', async () => {
            const apiData = {data: [], has_more: false, next_cursor: null};
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(apiData)
            }));

            const fileCache = {
                hasFile: () => false,
                writeTmpFile: mock.fn(() => Promise.resolve())
            };

            await cachedFetch({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                cursor: 'cursor-abc',
                cursorIndex: 1
            });

            const [calledUrl] = fetchMock.mock.calls[0].arguments;
            assert.ok(calledUrl.toString().includes('cursor=cursor-abc'));
        });

        it('throws on API error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            }));

            const fileCache = {
                hasFile: () => false,
                writeTmpFile: mock.fn(() => Promise.resolve())
            };

            await assert.rejects(async () => {
                await cachedFetch({
                    fileCache,
                    key: 'test-key',
                    pubId: 'pub-123',
                    cursor: null,
                    cursorIndex: 0
                });
            }, /Request failed: 500 Internal Server Error/);
        });
    });

    describe('fetchTasks', () => {
        it('creates a single task that fetches all subscriptions', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 150, data: [], has_more: true})
            }), 0);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {}
            };

            const tasks = await fetchTasks(options, ctx);

            assert.equal(tasks.length, 1);
            assert.ok(tasks[0].title.includes('Fetching subscriptions'));
        });

        it('task fetches all pages using cursor pagination', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 3, data: [], has_more: true})
            }), 0);

            // Mock first page
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [{id: 'sub-1', email: 'a@test.com'}],
                    has_more: true,
                    next_cursor: 'cursor-1'
                })
            }), 1);

            // Mock second page
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [{id: 'sub-2', email: 'b@test.com'}],
                    has_more: false,
                    next_cursor: null
                })
            }), 2);

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx: any = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.subscriptions.length, 2);
            assert.equal(ctx.result.subscriptions[0].id, 'sub-1');
            assert.equal(ctx.result.subscriptions[1].id, 'sub-2');
        });

        it('task uses cached data when available', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 1, data: [], has_more: false})
            }), 0);

            const cachedData = {
                data: [{id: 'cached-sub', email: 'cached@test.com'}],
                has_more: false,
                next_cursor: null
            };

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx: any = {
                fileCache: {
                    hasFile: () => true,
                    readTmpJSONFile: () => Promise.resolve(cachedData)
                },
                result: {}
            };

            const tasks = await fetchTasks(options, ctx);
            await tasks[0].task({}, {output: ''});

            assert.equal(ctx.result.subscriptions.length, 1);
            assert.equal(ctx.result.subscriptions[0].id, 'cached-sub');
            // fetch should only be called once (for discover)
            assert.equal(fetchMock.mock.callCount(), 1);
        });

        it('task throws and sets output on fetch error', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({total_results: 5, data: [], has_more: true})
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
                result: {}
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
                json: () => Promise.resolve({total_results: 5, data: [], has_more: true})
            }), 0);

            // Mock fetch that throws a non-Error value
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
                result: {}
            };

            const tasks = await fetchTasks(options, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            });

            assert.equal(mockTask.output, 'Network error string');
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
                result: {}
            };

            await assert.rejects(async () => {
                await fetchTasks(options, ctx);
            }, /Request failed: 401 Unauthorized/);
        });
    });
});
