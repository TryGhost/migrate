import assert from 'node:assert/strict';
import {describe, it, afterEach, mock} from 'node:test';
import WebScraper from '../index.js';

const mockUrl = 'https://ghost.org/docs/api/v3/migration/';
const mockFilename = 'test.json';
const mockConfig = {
    posts: {
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content'
        }
    }
};
const mockResponse = {
    responseData: {
        meta_title: 'title',
        meta_description: 'desc'
    }
};

describe('ScrapeURL', function () {
    let mockFileCache;

    afterEach(function () {
        mockFileCache.hasFile.mock.restore();
        mockFileCache.writeTmpFile.mock.restore();
        mockFileCache.readTmpJSONFile.mock.restore();
    });

    it('Will load from cache', async function () {
        mockFileCache = {
            hasFile: mock.fn(() => {
                return true;
            }),
            writeTmpFile: mock.fn(() => {
                return true;
            }),
            readTmpJSONFile: mock.fn(() => {
                return mockResponse;
            })
        };

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        assert.equal(mockFileCache.hasFile.mock.callCount(), 1);
        assert.equal(mockFileCache.readTmpJSONFile.mock.callCount(), 1);

        assert.deepEqual(response, mockResponse);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache = {
            hasFile: mock.fn(() => {
                return false;
            }),
            writeTmpFile: mock.fn(() => {
                return true;
            }),
            readTmpJSONFile: mock.fn(() => {
                return mockResponse;
            })
        };

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        // Fake scraping the page, we don't need to test that part
        webScraper.scrape = mock.fn(async () => mockResponse);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        assert.equal(mockFileCache.hasFile.mock.callCount(), 1);
        assert.equal(mockFileCache.writeTmpFile.mock.callCount(), 1);

        assert.deepEqual(response, mockResponse);
    });
});

describe('hydrate', function () {
    it('Caps filename at 250 chars for long post URLs', async function () {
        const baseUrl = 'https://example.com/p/';
        const longPath = 'a'.repeat(300);
        const longUrl = baseUrl + longPath;

        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({responseData: {}}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: {}}));

        const ctx = {
            result: {
                posts: [{
                    url: longUrl,
                    data: {}
                }]
            },
            options: {},
            errors: []
        };

        const tasks = webScraper.hydrate(ctx);
        assert.equal(tasks.length, 1);

        await tasks[0].task(ctx);

        assert.ok(mockFileCache.hasFile.mock.callCount() > 0);
        const filenameArg = mockFileCache.hasFile.mock.calls[0].arguments[0];
        assert.equal(filenameArg.endsWith('.json'), true);
        const filename = filenameArg.slice(0, -5);
        assert.ok(filename.length <= 250);
    });
});
