// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

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

    beforeEach(function () {
        mockFileCache = {
            hasFile: sinon.stub(),
            writeTmpFile: sinon.stub(),
            readTmpJSONFile: sinon.stub()
        };

        mockFileCache.readTmpJSONFile.resolves(mockResponse);
        mockFileCache.writeTmpFile.resolves();
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Will load from cache', async function () {
        mockFileCache.hasFile.returns(true);

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        mockFileCache.hasFile.calledOnce.should.be.true();
        mockFileCache.readTmpJSONFile.calledOnce.should.be.true();

        response.should.eql(mockResponse);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache.hasFile.returns(false);

        let webScraper = new WebScraper(mockFileCache, mockConfig);

        // Fake scraping the page, we don't need to test that part
        webScraper.scrape = sinon.stub().resolves(mockResponse);

        let response = await webScraper.scrapeUrl(mockUrl, mockConfig.posts, mockFilename);

        mockFileCache.hasFile.calledOnce.should.be.true();
        mockFileCache.writeTmpFile.calledOnce.should.be.true();

        response.should.eql(mockResponse);
    });
});
