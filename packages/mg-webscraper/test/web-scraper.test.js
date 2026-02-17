import {jest} from '@jest/globals';
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
        mockFileCache.hasFile.mockRestore();
        mockFileCache.writeTmpFile.mockRestore();
        mockFileCache.readTmpJSONFile.mockRestore();
    });

    test('Will load from cache', async function () {
        mockFileCache = {
            hasFile: jest.fn(() => {
                return true;
            }),
            writeTmpFile: jest.fn(() => {
                return true;
            }),
            readTmpJSONFile: jest.fn(() => {
                return mockResponse;
            })
        };

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        expect(mockFileCache.hasFile).toHaveBeenCalledTimes(1);
        expect(mockFileCache.readTmpJSONFile).toHaveBeenCalledTimes(1);

        expect(response).toEqual(mockResponse);
    });

    test('Will fetch and cache when not in the cache', async function () {
        mockFileCache = {
            hasFile: jest.fn(() => {
                return false;
            }),
            writeTmpFile: jest.fn(() => {
                return true;
            }),
            readTmpJSONFile: jest.fn(() => {
                return mockResponse;
            })
        };

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        // Fake scraping the page, we don't need to test that part
        webScraper.scrape = jest.fn(async () => mockResponse);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        expect(mockFileCache.hasFile).toHaveBeenCalledTimes(1);
        expect(mockFileCache.writeTmpFile).toHaveBeenCalledTimes(1);

        expect(response).toEqual(mockResponse);
    });
});

describe('hydrate', function () {
    test('Caps filename at 250 chars for long post URLs', async function () {
        const baseUrl = 'https://example.com/p/';
        const longPath = 'a'.repeat(300);
        const longUrl = baseUrl + longPath;

        const mockFileCache = {
            hasFile: jest.fn(() => false),
            writeTmpFile: jest.fn(() => true),
            readTmpJSONFile: jest.fn(() => ({responseData: {}}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = jest.fn(async () => ({responseData: {}}));

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
        expect(tasks).toHaveLength(1);

        await tasks[0].task(ctx);

        expect(mockFileCache.hasFile).toHaveBeenCalled();
        const filenameArg = mockFileCache.hasFile.mock.calls[0][0];
        expect(filenameArg.endsWith('.json')).toBe(true);
        const filename = filenameArg.slice(0, -5);
        expect(filename.length).toBeLessThanOrEqual(250);
    });
});
