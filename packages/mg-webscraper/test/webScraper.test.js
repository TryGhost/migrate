/* eslint no-undef: 0 */
const WebScraper = require('../');

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
    responseUrl: mockUrl,
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
