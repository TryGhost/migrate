import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {listPublications} from '../lib/list-pubs.js';

describe('beehiiv API List Publications', () => {
    let fetchMock: any;

    beforeEach(() => {
        fetchMock = mock.method(global, 'fetch', () => Promise.resolve());
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe('listPublications', () => {
        it('makes authenticated request to publications endpoint', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({
                    data: [{id: 'pub-1', name: 'Test', created: 1700078400, stats: {active_subscriptions: 100, active_premium_subscriptions: 10, active_free_subscriptions: 90}}],
                    total_results: 1
                })
            }));

            await listPublications('test-api-key');

            // 1 call for publications + 1 call for posts per pub
            assert.equal(fetchMock.mock.callCount(), 2);
            const [calledUrl, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(calledUrl.toString(), 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats');
            assert.equal(options.method, 'GET');
            assert.equal(options.headers.Authorization, 'Bearer test-api-key');
        });

        it('returns full PublicationData shape', async () => {
            const apiPub = {
                id: 'pub_abc123',
                name: 'Test Newsletter',
                created: 1700000000,
                stats: {
                    active_subscriptions: 500,
                    active_premium_subscriptions: 50,
                    active_free_subscriptions: 450
                }
            };

            fetchMock.mock.mockImplementation((url: URL) => {
                if (url.pathname.endsWith('/posts')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({
                            total_results: 100,
                            data: [{web_url: 'https://example.beehiiv.com/p/first-post'}]
                        })
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: [apiPub]})
                });
            });

            const result = await listPublications('test-api-key');

            assert.equal(result.length, 1);
            assert.deepEqual(result[0], {
                id: 'pub_abc123',
                name: 'Test Newsletter',
                created: new Date(1700000000 * 1000),
                allSubscribers: 500,
                paidSubscribers: 50,
                freeSubscribers: 450,
                postCount: 100,
                url: 'https://example.beehiiv.com'
            });
        });

        it('handles publications with no posts', async () => {
            const apiPub = {
                id: 'pub-1',
                name: 'Empty Pub',
                created: 1700000000,
                stats: {active_subscriptions: 0, active_premium_subscriptions: 0, active_free_subscriptions: 0}
            };

            fetchMock.mock.mockImplementation((url: URL) => {
                if (url.pathname.endsWith('/posts')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 0, data: []})
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: [apiPub]})
                });
            });

            const result = await listPublications('test-api-key');

            assert.equal(result[0].postCount, 0);
            assert.equal(result[0].url, undefined);
            assert.equal(result[0].allSubscribers, 0);
        });

        it('defaults subscriber counts to 0 when stats are missing', async () => {
            const apiPub = {id: 'pub-1', name: 'No Stats', created: 1700000000};

            fetchMock.mock.mockImplementation((url: URL) => {
                if (url.pathname.endsWith('/posts')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 5, data: [{web_url: 'https://example.com/p/post'}]})
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: [apiPub]})
                });
            });

            const result = await listPublications('test-api-key');

            assert.equal(result[0].allSubscribers, 0);
            assert.equal(result[0].paidSubscribers, 0);
            assert.equal(result[0].freeSubscribers, 0);
        });

        it('throws error on failed request with context', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 403,
                statusText: 'Forbidden',
                url: 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats'
            }));

            await assert.rejects(async () => {
                await listPublications('invalid-key');
            }, (err: any) => {
                assert.equal(err.message, 'Request failed: 403 Forbidden');
                assert.equal(err.context, 'GET /v2/publications');
                return true;
            });
        });

        it('throws error on server error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                url: 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats'
            }));

            await assert.rejects(async () => {
                await listPublications('test-key');
            }, /Request failed: 500 Internal Server Error/);
        });
    });
});
