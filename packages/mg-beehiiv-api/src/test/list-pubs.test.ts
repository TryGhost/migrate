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
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve(mockData)
            }));

            await listPublications('test-api-key');

            assert.equal(fetchMock.mock.callCount(), 1);
            const [calledUrl, options] = fetchMock.mock.calls[0].arguments;
            assert.equal(calledUrl.toString(), 'https://api.beehiiv.com/v2/publications?expand%5B%5D=stats');
            assert.equal(options.method, 'GET');
            assert.equal(options.headers.Authorization, 'Bearer test-api-key');
        });

        it('returns publications data', async () => {
            const publications = [
                {id: 'pub-1', name: 'Publication One'},
                {id: 'pub-2', name: 'Publication Two'}
            ];
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: true,
                json: () => Promise.resolve({data: publications})
            }));

            const result = await listPublications('test-api-key');

            assert.deepEqual(result, publications);
        });

        it('throws error on failed request', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 403,
                statusText: 'Forbidden'
            }));

            await assert.rejects(async () => {
                await listPublications('invalid-key');
            }, /Request failed: 403 Forbidden/);
        });

        it('throws error on server error', async () => {
            fetchMock.mock.mockImplementation(() => Promise.resolve({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error'
            }));

            await assert.rejects(async () => {
                await listPublications('test-key');
            }, /Request failed: 500 Internal Server Error/);
        });
    });
});
