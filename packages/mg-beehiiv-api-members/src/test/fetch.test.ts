import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {listPublications} from '../lib/list-pubs.js';
import {
    fetchTasks,
    authedClient,
    discover,
    cachedFetch,
    cachedFetchSegments,
    cachedFetchSegmentMembers
} from '../lib/fetch.js';

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
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({ok: true, json: () => Promise.resolve({data: []})})
            );

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
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: mockPubs})
                })
            );

            const result = await listPublications('test-key');

            assert.deepEqual(result, mockPubs);
        });

        it('throws on API error with context', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized',
                    url: 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats'
                })
            );

            await assert.rejects(
                async () => {
                    await listPublications('invalid-key');
                },
                (err: any) => {
                    assert.equal(err.message, 'Request failed: 401 Unauthorized');
                    assert.equal(err.context, 'GET /v2/publications');
                    return true;
                }
            );
        });
    });

    describe('discover', () => {
        it('returns total subscription count', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: {stats: {active_subscriptions: 1500}}})
                })
            );

            const result = await discover('test-key', 'pub-123');

            assert.equal(result, 1500);
        });

        it('returns undefined when stats are missing', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: {}})
                })
            );

            const result = await discover('test-key', 'pub-123');

            assert.equal(result, undefined);
        });

        it('throws on API error', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 403,
                    statusText: 'Forbidden'
                })
            );

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
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(apiData)
                })
            );

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
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(apiData)
                })
            );

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
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error'
                })
            );

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

    describe('cachedFetchSegments', () => {
        it('returns cached segment data when available', async () => {
            const cachedData = {
                data: [{id: 'seg-1', name: 'Weekly Readers'}],
                total_pages: 1
            };
            const fileCache = {
                hasFile: () => true,
                readTmpJSONFile: () => Promise.resolve(cachedData)
            };

            const result = await cachedFetchSegments({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                page: 2
            });

            assert.deepEqual(result, cachedData);
            assert.equal(fetchMock.mock.callCount(), 0);
        });

        it('fetches and caches a segment page', async () => {
            const apiData = {
                data: [{id: 'seg-1', name: 'Weekly Readers'}],
                total_pages: 1
            };
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(apiData)
                })
            );

            const writeTmpFile = mock.fn(() => Promise.resolve());
            const fileCache = {
                hasFile: () => false,
                writeTmpFile
            };

            const result = await cachedFetchSegments({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                page: 2
            });

            assert.deepEqual(result, apiData);
            const [calledUrl] = fetchMock.mock.calls[0].arguments;
            assert.equal(
                calledUrl.toString(),
                'https://api.beehiiv.com/v2/publications/pub-123/segments?limit=100&page=2'
            );
            assert.deepEqual(writeTmpFile.mock.calls[0].arguments, [apiData, 'beehiiv_api_members_segments_2.json']);
        });

        it('throws on a segment API error', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 429,
                    statusText: 'Too Many Requests'
                })
            );

            const fileCache = {
                hasFile: () => false
            };

            await assert.rejects(
                cachedFetchSegments({
                    fileCache,
                    key: 'test-key',
                    pubId: 'pub-123',
                    page: 1
                }),
                /Request failed: 429 Too Many Requests/
            );
        });
    });

    describe('cachedFetchSegmentMembers', () => {
        it('returns cached segment-member data when available', async () => {
            const cachedData = {
                data: [{id: 'sub-1'}],
                total_pages: 1
            };
            const fileCache = {
                hasFile: () => true,
                readTmpJSONFile: () => Promise.resolve(cachedData)
            };

            const result = await cachedFetchSegmentMembers({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                segmentId: 'seg-1',
                page: 3
            });

            assert.deepEqual(result, cachedData);
            assert.equal(fetchMock.mock.callCount(), 0);
        });

        it('fetches and caches a segment-member page', async () => {
            const apiData = {
                data: [{id: 'sub-1'}],
                total_pages: 1
            };
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve(apiData)
                })
            );

            const writeTmpFile = mock.fn(() => Promise.resolve());
            const fileCache = {
                hasFile: () => false,
                writeTmpFile
            };

            const result = await cachedFetchSegmentMembers({
                fileCache,
                key: 'test-key',
                pubId: 'pub-123',
                segmentId: 'seg-1',
                page: 3
            });

            assert.deepEqual(result, apiData);
            const [calledUrl] = fetchMock.mock.calls[0].arguments;
            assert.equal(
                calledUrl.toString(),
                'https://api.beehiiv.com/v2/publications/pub-123/segments/seg-1/members?limit=100&page=3'
            );
            assert.deepEqual(writeTmpFile.mock.calls[0].arguments, [
                apiData,
                'beehiiv_api_members_segment_seg-1_3.json'
            ]);
        });

        it('throws on a segment-member API error', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 500,
                    statusText: 'Internal Server Error'
                })
            );

            const fileCache = {
                hasFile: () => false
            };

            await assert.rejects(
                cachedFetchSegmentMembers({
                    fileCache,
                    key: 'test-key',
                    pubId: 'pub-123',
                    segmentId: 'seg-1',
                    page: 1
                }),
                /Request failed: 500 Internal Server Error/
            );
        });
    });

    describe('fetchTasks', () => {
        it('creates only the subscription task by default', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: {stats: {active_subscriptions: 150}}})
                    }),
                0
            );

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

        it('creates the segment task when segments are enabled', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: {stats: {active_subscriptions: 150}}})
                })
            );

            const tasks = await fetchTasks(
                {key: 'test-key', id: 'pub-123', segments: true},
                {
                    fileCache: {},
                    result: {}
                }
            );

            assert.equal(tasks.length, 2);
            assert.equal(tasks[1].title, 'Fetching segments and segment memberships');
        });

        it('task fetches all pages using cursor pagination', async () => {
            // Mock the discover call
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 3, data: [], has_more: true})
                    }),
                0
            );

            // Mock first page
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                data: [{id: 'sub-1', email: 'a@test.com'}],
                                has_more: true,
                                next_cursor: 'cursor-1'
                            })
                    }),
                1
            );

            // Mock second page
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                data: [{id: 'sub-2', email: 'b@test.com'}],
                                has_more: false,
                                next_cursor: null
                            })
                    }),
                2
            );

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
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 1, data: [], has_more: false})
                    }),
                0
            );

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
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 5, data: [], has_more: true})
                    }),
                0
            );

            // Mock a failed fetch
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: false,
                        status: 500,
                        statusText: 'Internal Server Error'
                    }),
                1
            );

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
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 5, data: [], has_more: true})
                    }),
                0
            );

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

        it('handles discover returning undefined stats', async () => {
            // discover returns undefined when stats are missing
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: {}})
                    }),
                0
            );

            // Mock a single page of results
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                data: [{id: 'sub-1', email: 'a@test.com'}],
                                has_more: false,
                                next_cursor: null
                            })
                    }),
                1
            );

            const options = {key: 'test-key', id: 'pub-123'};
            const ctx: any = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {}
            };

            const tasks = await fetchTasks(options, ctx);

            assert.equal(tasks.length, 1);
            assert.ok(tasks[0].title.includes('estimated 0 pages'));

            await tasks[0].task({}, {output: ''});
            assert.equal(ctx.result.subscriptions.length, 1);
        });

        it('fetches every segment and member page and accumulates memberships', async () => {
            fetchMock.mock.mockImplementation((url: URL) => {
                if (url.pathname === '/v2/publications/pub-123') {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: {stats: {active_subscriptions: 2}}})
                    });
                }

                const page = Number(url.searchParams.get('page'));

                if (url.pathname === '/v2/publications/pub-123/segments') {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                data:
                                    page === 1
                                        ? [{id: 'seg-1', name: 'Weekly Readers'}]
                                        : [{id: 'seg-2', name: 'VIP Readers'}],
                                total_pages: 2
                            })
                    });
                }

                if (url.pathname.endsWith('/segments/seg-1/members')) {
                    return Promise.resolve({
                        ok: true,
                        json: () =>
                            Promise.resolve({
                                data: page === 1 ? [{id: 'sub-1'}, {id: 'sub-1'}] : [{id: 'sub-2'}],
                                total_pages: 2
                            })
                    });
                }

                return Promise.resolve({
                    ok: true,
                    json: () =>
                        Promise.resolve({
                            data: [{id: 'sub-1'}],
                            total_pages: 1
                        })
                });
            });

            const ctx: any = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {}
            };
            const tasks = await fetchTasks({key: 'test-key', id: 'pub-123', segments: true}, ctx);
            const mockTask = {output: ''};

            await tasks[1].task({}, mockTask);

            assert.deepEqual(ctx.result.segmentMemberships, {
                'sub-1': ['Weekly Readers', 'VIP Readers'],
                'sub-2': ['Weekly Readers']
            });
            assert.equal(mockTask.output, 'Fetched 2 segments and 3 segment memberships');

            const segmentCalls = fetchMock.mock.calls
                .map((call: any) => call.arguments[0] as URL)
                .filter((url: URL) => url.pathname === '/v2/publications/pub-123/segments');
            const memberCalls = fetchMock.mock.calls
                .map((call: any) => call.arguments[0] as URL)
                .filter((url: URL) => url.pathname.endsWith('/members'));

            assert.deepEqual(
                segmentCalls.map((url: URL) => url.searchParams.get('page')),
                ['1', '2']
            );
            assert.equal(memberCalls.length, 3);
            assert.ok(memberCalls.every((url: URL) => url.searchParams.get('limit') === '100'));
        });

        it('handles a publication without segments', async () => {
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: {stats: {active_subscriptions: 1}}})
                    }),
                0
            );
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: [], total_pages: 0})
                    }),
                1
            );

            const ctx: any = {
                fileCache: {
                    hasFile: () => false,
                    writeTmpFile: () => Promise.resolve()
                },
                result: {}
            };
            const tasks = await fetchTasks({key: 'test-key', id: 'pub-123', segments: true}, ctx);
            const mockTask = {output: ''};

            await tasks[1].task({}, mockTask);

            assert.deepEqual(ctx.result.segmentMemberships, {});
            assert.equal(mockTask.output, 'Fetched 0 segments and 0 segment memberships');
            assert.equal(fetchMock.mock.callCount(), 2);
        });

        it('stops and sets task output when segment fetching fails', async () => {
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({data: {stats: {active_subscriptions: 1}}})
                    }),
                0
            );
            fetchMock.mock.mockImplementationOnce(
                () =>
                    Promise.resolve({
                        ok: false,
                        status: 500,
                        statusText: 'Internal Server Error'
                    }),
                1
            );

            const ctx = {
                fileCache: {
                    hasFile: () => false
                },
                result: {}
            };
            const tasks = await fetchTasks({key: 'test-key', id: 'pub-123', segments: true}, ctx);
            const mockTask = {output: ''};

            await assert.rejects(tasks[1].task({}, mockTask), /Request failed: 500 Internal Server Error/);
            assert.equal(mockTask.output, 'Request failed: 500 Internal Server Error');
        });

        it('handles discover error', async () => {
            fetchMock.mock.mockImplementation(() =>
                Promise.resolve({
                    ok: false,
                    status: 401,
                    statusText: 'Unauthorized'
                })
            );

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
