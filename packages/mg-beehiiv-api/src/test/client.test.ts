import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {client} from '../lib/client.js';

describe('beehiiv API Client', () => {
    let fetchMock: any;

    beforeEach(() => {
        fetchMock = mock.method(global, 'fetch', () => Promise.resolve());
    });

    afterEach(() => {
        mock.restoreAll();
    });

    describe('client', () => {
        it('makes authenticated request to publications endpoint', async () => {
            const mockData = {data: [{id: 'pub-1', name: 'Test Publication'}]};
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData)
            }));

            await client('test-api-key');

            assert.equal(fetchMock.mock.callCount(), 1);
            const [calledUrl, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(calledUrl.toString(), 'https://api.beehiiv.com/v2/publications');
            assert.equal(options.method, 'GET');
            assert.equal(options.headers.Authorization, 'Bearer test-api-key');
        });

        it('returns publications data', async () => {
            const publications = [{id: 'pub-1', name: 'Test Pub'}];
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({data: publications})
            }));

            const result = await client('test-api-key');

            assert.deepEqual(result, publications);
        });

        it('throws error on failed request', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            }));

            await assert.rejects(async () => {
                await client('invalid-key');
            }, /Request failed: 401 Unauthorized/);
        });
    });
});
