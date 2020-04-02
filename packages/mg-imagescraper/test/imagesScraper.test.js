// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

const ImageScraper = require('../');

const mockUrl = 'https://mysite.com/images/test.jpg';
const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;

describe('Download Image', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = {
            resolveImageFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeImageFile: sinon.stub()
        };

        mockFileCache.writeImageFile.resolves();

        mockFileCache.resolveImageFileName.returns({
            fileName: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath
        });
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Will load from cache', async function () {
        mockFileCache.hasFile.returns(true);

        let imageScraper = new ImageScraper(mockFileCache);

        let resultPath = await imageScraper.downloadImage(mockUrl);

        mockFileCache.resolveImageFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache.hasFile.returns(false);

        let imageScraper = new ImageScraper(mockFileCache);

        // Fake fetching the image, we don't need to test that part
        imageScraper.fetchImage = sinon.stub().resolves({body: 'imagedata'});

        let resultPath = await imageScraper.downloadImage(mockUrl);

        mockFileCache.resolveImageFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();
        mockFileCache.writeImageFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });
});
