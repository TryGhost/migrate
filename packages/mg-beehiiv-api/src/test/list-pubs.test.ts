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
            const mockData = {data: [{id: 'pub-1', name: 'Test Publication'}]};
            // First call: listPublications, second call: discover for each pub
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData)
            }));

            await listPublications('test-api-key');

            // 1 call for publications + 1 call for discover per pub
            assert.equal(fetchMock.mock.callCount(), 2);
            const [calledUrl, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(calledUrl.toString(), 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats');
            assert.equal(options.method, 'GET');
            assert.equal(options.headers.Authorization, 'Bearer test-api-key');
        });

        it('returns publications data with post counts', async () => {
            const publications = [
                {id: 'pub-1', name: 'Publication One'},
                {id: 'pub-2', name: 'Publication Two'}
            ];
            fetchMock.mock.mockImplementation((url: URL) => {
                if (url.pathname.endsWith('/posts')) {
                    return Promise.resolve({
                        ok: true,
                        json: () => Promise.resolve({total_results: 42})
                    });
                }
                return Promise.resolve({
                    ok: true,
                    json: () => Promise.resolve({data: publications})
                });
            });

            const result = await listPublications('test-api-key');

            assert.equal(result.length, 2);
            assert.equal(result[0].name, 'Publication One');
            assert.equal(result[0].postCount, 42);
            assert.equal(result[1].postCount, 42);
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
