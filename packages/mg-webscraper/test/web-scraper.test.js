import assert from 'node:assert/strict';
import {describe, it, afterEach, mock} from 'node:test';
import errors from '@tryghost/errors';
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

describe('scrapePost', function () {
    it('Scrapes and sets fields on the post', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Scraped Title',
                meta_description: 'Scraped Desc'
            }
        }));

        const fields = {};
        const post = {
            getSourceValue: function (key) {
                return key === 'url' ? mockUrl : null;
            },
            set: (key, value) => {
                fields[key] = value;
            }
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Scraped Title');
        assert.equal(fields.meta_description, 'Scraped Desc');
    });

    it('Skips when post has no source URL', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: {}}));

        const post = {
            getSourceValue: () => null,
            set: mock.fn()
        };

        await webScraper.scrapePost(post);

        assert.equal(webScraper.scrape.mock.callCount(), 0);
    });

    it('Skips when config has no posts section', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const webScraper = new WebScraper(mockFileCache, {});
        webScraper.scrape = mock.fn(async () => ({responseData: {}}));

        const post = {
            getSourceValue: () => mockUrl,
            set: mock.fn()
        };

        await webScraper.scrapePost(post);

        assert.equal(webScraper.scrape.mock.callCount(), 0);
    });

    it('Skips null and empty values', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Has Value',
                meta_description: '',
                og_title: null
            }
        }));

        const fields = {};
        const post = {
            getSourceValue: function (key) {
                return key === 'url' ? mockUrl : null;
            },
            set: (key, value) => {
                fields[key] = value;
            }
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Has Value');
        assert.equal(fields.meta_description, undefined);
        assert.equal(fields.og_title, undefined);
    });

    it('Silently skips fields not in schema', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Valid',
                not_a_real_field: 'Should be skipped'
            }
        }));

        const fields = {};
        const post = {
            getSourceValue: function (key) {
                return key === 'url' ? mockUrl : null;
            },
            set: (key, value) => {
                if (key === 'not_a_real_field') {
                    throw new errors.ValidationError({message: 'Unknown field'}); // eslint-disable-line no-shadow
                }
                fields[key] = value;
            }
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Valid');
        assert.equal(fields.not_a_real_field, undefined);
    });

    it('Stores raw scraped data on post.webscrapeData', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const scraped = {
            meta_title: 'Scraped Title',
            meta_description: 'Scraped Desc'
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: scraped}));

        let storedWebscrapeData = null;
        const post = {
            getSourceValue: function (key) {
                return key === 'url' ? mockUrl : null;
            },
            set: () => {},
            set webscrapeData(value) {
                storedWebscrapeData = value;
            }
        };

        await webScraper.scrapePost(post);

        assert.deepEqual(storedWebscrapeData, scraped);
    });

    it('Applies postProcessor before setting fields', async function () {
        const mockFileCache = {
            hasFile: mock.fn(() => false),
            writeTmpFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => ({}))
        };

        const postProcessor = (data) => {
            return {...data, meta_title: data.meta_title.toUpperCase()};
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig, postProcessor);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'lowercase title'
            }
        }));

        const fields = {};
        const post = {
            getSourceValue: function (key) {
                return key === 'url' ? mockUrl : null;
            },
            set: (key, value) => {
                fields[key] = value;
            }
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'LOWERCASE TITLE');
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
