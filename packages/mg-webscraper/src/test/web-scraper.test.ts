import assert from 'node:assert/strict';
import {describe, it, afterEach, mock} from 'node:test';
import nock from 'nock';
import errors from '@tryghost/errors';
import WebScraper from '../index.js';
import type {FileCache} from '../index.js';

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

function makeMockFileCache(overrides: Partial<{hasFile: any; writeTmpFile: any; readTmpJSONFile: any}> = {}): FileCache & {hasFile: any; writeTmpFile: any; readTmpJSONFile: any} {
    return {
        hasFile: overrides.hasFile || mock.fn(() => false),
        writeTmpFile: overrides.writeTmpFile || mock.fn(() => true),
        readTmpJSONFile: overrides.readTmpJSONFile || mock.fn(() => ({}))
    };
}

describe('ScrapeURL', function () {
    let mockFileCache: ReturnType<typeof makeMockFileCache>;

    afterEach(function () {
        mockFileCache.hasFile.mock.restore();
        mockFileCache.writeTmpFile.mock.restore();
        mockFileCache.readTmpJSONFile.mock.restore();
    });

    it('Will load from cache', async function () {
        mockFileCache = makeMockFileCache({
            hasFile: mock.fn(() => true),
            readTmpJSONFile: mock.fn(() => mockResponse)
        });

        const webScraper = new WebScraper(mockFileCache, mockConfig);

        const response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        assert.equal(mockFileCache.hasFile.mock.callCount(), 1);
        assert.equal(mockFileCache.readTmpJSONFile.mock.callCount(), 1);

        assert.deepEqual(response, mockResponse);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => mockResponse) as any;

        const response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        assert.equal(mockFileCache.hasFile.mock.callCount(), 1);
        assert.equal(mockFileCache.writeTmpFile.mock.callCount(), 1);

        assert.deepEqual(response, mockResponse);
    });
});

describe('scrapePost', function () {
    it('Scrapes and sets fields on the post', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Scraped Title',
                meta_description: 'Scraped Desc'
            }
        })) as any;

        const fields: Record<string, any> = {};
        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set(key: string, value: any) {
                fields[key] = value;
            },
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Scraped Title');
        assert.equal(fields.meta_description, 'Scraped Desc');
    });

    it('Skips when post has no source URL', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: {}})) as any;

        const post = {
            getSourceValue: () => null,
            set: mock.fn(),
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal((webScraper.scrape as any).mock.callCount(), 0);
    });

    it('Skips when config has no posts section', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, {});
        webScraper.scrape = mock.fn(async () => ({responseData: {}})) as any;

        const post = {
            getSourceValue: () => mockUrl,
            set: mock.fn(),
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal((webScraper.scrape as any).mock.callCount(), 0);
    });

    it('Skips when responseData is empty', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: null})) as any;

        const fields: Record<string, any> = {};
        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set(key: string, value: any) {
                fields[key] = value;
            },
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal(Object.keys(fields).length, 0);
        assert.equal(post.webscrapeData, null);
    });

    it('Skips null and empty values', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Has Value',
                meta_description: '',
                og_title: null
            }
        })) as any;

        const fields: Record<string, any> = {};
        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set(key: string, value: any) {
                fields[key] = value;
            },
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Has Value');
        assert.equal(fields.meta_description, undefined);
        assert.equal(fields.og_title, undefined);
    });

    it('Silently skips fields not in schema', async function () {
        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'Valid',
                not_a_real_field: 'Should be skipped'
            }
        })) as any;

        const fields: Record<string, any> = {};
        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set(key: string, value: any) {
                if (key === 'not_a_real_field') {
                    throw new errors.ValidationError({message: 'Unknown field'});
                }
                fields[key] = value;
            },
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'Valid');
        assert.equal(fields.not_a_real_field, undefined);
    });

    it('Stores raw scraped data on post.webscrapeData', async function () {
        const mockFileCache = makeMockFileCache();

        const scraped = {
            meta_title: 'Scraped Title',
            meta_description: 'Scraped Desc'
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: scraped})) as any;

        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set() {},
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.deepEqual(post.webscrapeData, scraped);
    });

    it('Applies postProcessor before setting fields', async function () {
        const mockFileCache = makeMockFileCache();

        const postProcessor = (data: any) => {
            return {...data, meta_title: data.meta_title.toUpperCase()};
        };

        const webScraper = new WebScraper(mockFileCache, mockConfig, postProcessor);
        webScraper.scrape = mock.fn(async () => ({
            responseData: {
                meta_title: 'lowercase title'
            }
        })) as any;

        const fields: Record<string, any> = {};
        const post = {
            getSourceValue(key: string) {
                return key === 'url' ? mockUrl : null;
            },
            set(key: string, value: any) {
                fields[key] = value;
            },
            webscrapeData: null as any
        };

        await webScraper.scrapePost(post);

        assert.equal(fields.meta_title, 'LOWERCASE TITLE');
    });
});

describe('mergeResource', function () {
    it('Merges scalar values into resource', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {title: 'Original'};
        webScraper.mergeResource(resource, {meta_title: 'Scraped'});
        assert.equal(resource.meta_title, 'Scraped');
    });

    it('Merges array relations with URLs into resource', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {tags: []};
        webScraper.mergeResource(resource, {tags: [{url: 'https://example.com/tag/news/', name: 'News'}]});
        assert.equal(resource.tags.length, 1);
        assert.equal(resource.tags[0].url, 'https://example.com/tag/news/');
        assert.equal(resource.tags[0].data.name, 'News');
    });

    it('Merges array items without URLs', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {items: []};
        webScraper.mergeResource(resource, {items: [{name: 'No URL'}]});
        assert.equal(resource.items.length, 1);
        assert.equal(resource.items[0].name, 'No URL');
    });

    it('Merges array items with existing data property', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {tags: []};
        webScraper.mergeResource(resource, {tags: [{url: 'https://example.com/tag/', data: {slug: 'existing'}}]});
        assert.equal(resource.tags[0].data.slug, 'existing');
    });

    it('Merges object relations into resource', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {};
        webScraper.mergeResource(resource, {author: {url: 'https://example.com/author/alice/', name: 'Alice'}});
        assert.equal(resource.author.data.name, 'Alice');
    });

    it('Updates existing object relation', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {author: {url: 'https://example.com/author/alice/', data: {name: 'Alice'}}};
        webScraper.mergeResource(resource, {author: {url: 'https://example.com/author/alice/', bio: 'Writer'}});
        assert.equal(resource.author.data.name, 'Alice');
        assert.equal(resource.author.data.bio, 'Writer');
    });

    it('Creates null relations from scratch', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const resource: any = {tags: null};
        webScraper.mergeResource(resource, {tags: [{url: 'https://example.com/tag/news/', name: 'News'}]});
        assert.equal(resource.tags.length, 1);
    });

    it('Appends non-matching items to existing array', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const existing = [{url: 'https://example.com/tag/news/', data: {name: 'News'}}];
        const result = webScraper.mergeRelations(existing, [{url: 'https://example.com/tag/sport/', name: 'Sport'}]);
        assert.equal(result.length, 2);
        assert.equal(result[1].data.name, 'Sport');
    });

    it('Strips query params when matching URLs', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const existing = [{url: 'https://example.com/tag/news/', data: {name: 'News'}}];
        const result = webScraper.mergeRelations(existing, [{url: 'https://example.com/tag/other/?ref=1', name: 'Other'}]);
        assert.equal(result.length, 2);
        assert.equal(result[1].url, 'https://example.com/tag/other/');
    });
});

describe('processScrapedData', function () {
    it('Applies postProcessor and merges into data', function () {
        const postProcessor = (data: any) => ({...data, meta_title: data.meta_title.toUpperCase()});
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig, postProcessor);
        const data: any = {};
        webScraper.processScrapedData({meta_title: 'hello'}, data, {});
        assert.equal(data.meta_title, 'HELLO');
    });
});

describe('scrape', function () {
    afterEach(function () {
        nock.cleanAll();
    });

    it('Scrapes a URL and returns parsed data', async function () {
        nock('https://example.com')
            .get('/test-page/')
            .reply(200, '<html><head><title>Test Title</title><meta name="description" content="Test Desc"></head><body></body></html>');

        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const result = await webScraper.scrape('https://example.com/test-page/', mockConfig.posts!);

        assert.equal(result.requestURL, 'https://example.com/test-page/');
        assert.equal(result.responseData.meta_title, 'Test Title');
        assert.equal(result.responseData.meta_description, 'Test Desc');
    });

    it('Wraps network errors as ScrapeError', async function () {
        nock('https://example.com')
            .get('/fail/')
            .replyWithError('ECONNRESET');

        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);

        await assert.rejects(
            () => webScraper.scrape('https://example.com/fail/', mockConfig.posts!),
            (err: any) => {
                assert.equal(err.errorType, 'ScrapeError');
                assert.equal(err.url, 'https://example.com/fail/');
                return true;
            }
        );
    });

    it('Re-throws existing ScrapeErrors unchanged', async function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);

        // Override to throw a pre-wrapped ScrapeError
        webScraper.scrape = async (url: string, _config: any) => {
            const err: any = new errors.InternalServerError({message: `Unable to scrape URL ${url}`});
            err.errorType = 'ScrapeError';
            err.url = url;
            throw err;
        };

        await assert.rejects(
            () => webScraper.scrapeUrl('https://example.com/fail/', mockConfig.posts!, 'test-file'),
            (err: any) => {
                assert.equal(err.errorType, 'ScrapeError');
                return true;
            }
        );
    });
});

describe('hydrate', function () {
    it('Caps filename at 250 chars for long post URLs', async function () {
        const baseUrl = 'https://example.com/p/';
        const longPath = 'a'.repeat(300);
        const longUrl = baseUrl + longPath;

        const mockFileCache = makeMockFileCache();

        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = mock.fn(async () => ({responseData: {}})) as any;

        const ctx = {
            result: {
                posts: [{
                    url: longUrl,
                    data: {}
                }]
            },
            options: {},
            errors: [] as any[]
        };

        const tasks = webScraper.hydrate(ctx);
        assert.equal(tasks.length, 1);

        await tasks[0].task(ctx);

        assert.ok(mockFileCache.hasFile.mock.callCount() > 0);
        const filenameArg = mockFileCache.hasFile.mock.calls[0].arguments[0] as string;
        assert.equal(filenameArg.endsWith('.json'), true);
        const filename = filenameArg.slice(0, -5);
        assert.ok(filename.length <= 250);
    });

    it('Returns result unchanged when no posts config', function () {
        const webScraper = new WebScraper(makeMockFileCache(), {});
        const ctx = {result: {posts: [{url: 'https://example.com', data: {}}]}, options: {}, errors: [] as any[]};
        const result = webScraper.hydrate(ctx);
        assert.deepEqual(result, ctx.result);
    });

    it('Returns result unchanged when no posts', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const ctx = {result: {posts: [] as any[]}, options: {}, errors: [] as any[]};
        const result = webScraper.hydrate(ctx);
        assert.deepEqual(result, ctx.result);
    });

    it('Does not skip posts when no skipFn is set', function () {
        const webScraper = new WebScraper(makeMockFileCache(), mockConfig);
        const ctx = {
            result: {posts: [{url: 'https://example.com/post/', data: {}}]},
            options: {},
            errors: [] as any[]
        };
        const tasks = webScraper.hydrate(ctx);
        assert.equal(tasks[0].skip(), false);
    });

    it('Skips posts via skipFn', async function () {
        const mockFileCache = makeMockFileCache();
        const skipFn = (post: any) => post.data.type === 'page';
        const webScraper = new WebScraper(mockFileCache, mockConfig, undefined, skipFn);

        const ctx = {
            result: {
                posts: [{url: 'https://example.com/page/', data: {type: 'page'}}]
            },
            options: {},
            errors: [] as any[]
        };

        const tasks = webScraper.hydrate(ctx);
        assert.equal(tasks.length, 1);
        assert.equal(tasks[0].skip(), true);
    });

    it('Pushes error and rethrows on scrape failure', async function () {
        const mockFileCache = makeMockFileCache();
        const webScraper = new WebScraper(mockFileCache, mockConfig);
        webScraper.scrape = async () => {
            throw new errors.InternalServerError({message: 'Network error'});
        };

        const ctx = {
            result: {
                posts: [{url: 'https://example.com/post/', data: {}}]
            },
            options: {},
            errors: [] as any[]
        };

        const tasks = webScraper.hydrate(ctx);
        await assert.rejects(() => tasks[0].task(ctx));
        assert.equal(ctx.errors.length, 1);
        assert.ok(ctx.errors[0].message.includes('https://example.com/post/'));
    });
});
