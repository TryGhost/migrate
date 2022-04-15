// Switch these lines once there are useful utils
const testUtils = require('./utils');

const ImageScraper = require('../');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

const mockUrl = 'https://mysite.com/images/test.jpg';
const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;

describe('Download Image', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = {
            resolveFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeImageFile: sinon.stub()
        };

        mockFileCache.writeImageFile.resolves();

        mockFileCache.resolveFileName.returns({
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

        mockFileCache.resolveFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache.hasFile.returns(false);

        let imageScraper = new ImageScraper(mockFileCache);

        // Fake fetching the image, we don't need to test that part
        imageScraper.fetchImage = sinon.stub().resolves({body: 'imagedata'});

        let resultPath = await imageScraper.downloadImage(mockUrl);

        mockFileCache.resolveFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();
        mockFileCache.writeImageFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });

    it('Will find and replace images in posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let imageScraper = new ImageScraper(mockFileCache);

        let tasks = imageScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.feature_image.should.eql(mockOutputPath);
        post.html.should.containEql('<img src="/content/images/test.jpg">');
        post.html.should.not.containEql('<img src="https://mysite.com/images/test.jpg" />');

        // Check the `feature_image_alt` and `feature_image_caption` are un-touched
        post.feature_image_alt.should.eql('Feature image alt text');
        post.feature_image_caption.should.eql('Feature image caption text');
    });
});
