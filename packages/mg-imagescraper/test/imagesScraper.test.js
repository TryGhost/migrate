// Switch these lines once there are useful utils
const testUtils = require('./utils');

const path = require('path');
const fs = require('fs').promises;
const ImageScraper = require('../');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

const mockUrl = 'https://mysite.com/images/test.png';
const mockFile = 'test.png';
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
            filename: mockFile,
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
        const imageBuffer = await fs.readFile(path.join(__dirname, 'fixtures/test.png'));
        imageScraper.fetchImage = sinon.stub().resolves({data: imageBuffer});

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
        post.html.should.containEql('<img src="/content/images/test.png">');
        post.html.should.not.containEql('<img src="https://mysite.com/images/test.png" />');

        // Check the `feature_image_alt` and `feature_image_caption` are un-touched
        post.feature_image_alt.should.eql('Feature image alt text');
        post.feature_image_caption.should.eql('Feature image caption text');
    });

    it('Will find and replace linked images in posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let imageScraper = new ImageScraper(mockFileCache);

        let tasks = imageScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.feature_image.should.eql(mockOutputPath);
        post.html.should.containEql('<a href="/content/images/test.png">image</a>');
        post.html.should.not.containEql('<a href="https://mysite.com/images/test.png">image</a>');

        post.html.should.containEql('<a href="/content/images/test.png">relative image</a>');
        post.html.should.not.containEql('<a href="/images/test.png">relative image</a>');
    });

    it('Will find image type from buffer', async function () {
        mockFileCache.hasFile.returns(true);
        const imageScraper = new ImageScraper(mockFileCache);

        const imageBuffer = await fs.readFile(path.join(__dirname, 'fixtures/test.png'));
        const imageData = imageScraper.getImageDataFromBuffer(imageBuffer);

        imageData.ext.should.eql('png');
        imageData.mime.should.eql('image/png');
    });

    it('Will change jpeg to jpg', async function () {
        const mockJpgUrl = 'https://mysite.com/images/test.jpeg';
        const mockJpgFile = 'test.jpeg';
        const mockJpgStoragePath = `/tmp/blah/${mockJpgFile}`;
        const mockJpgOutputPath = `/content/images/${mockJpgFile}`;

        let mockJpgFileCache = {
            resolveFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeImageFile: sinon.stub()
        };

        mockJpgFileCache.writeImageFile.resolves();

        mockJpgFileCache.resolveFileName.returns({
            filename: mockFile,
            storagePath: mockJpgStoragePath,
            outputPath: mockJpgOutputPath
        });

        mockJpgFileCache.hasFile.returns(true);
        let imageJpgScraper = new ImageScraper(mockFileCache);

        // Fake fetching the image, we don't need to test that part
        const imageBuffer = await fs.readFile(path.join(__dirname, 'fixtures/test.jpeg'));
        imageJpgScraper.fetchImage = sinon.stub().resolves({data: imageBuffer});

        const imageData = imageJpgScraper.getImageDataFromBuffer(imageBuffer);
        imageData.ext.should.eql('jpg');
        imageData.mime.should.eql('image/jpeg');

        const resultPath = await imageJpgScraper.downloadImage(mockJpgUrl);

        resultPath.should.eql('/content/images/test.jpg');
    });

    it('Will skip images that do not exist', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(false);
        let imageScraper = new ImageScraper(mockFileCache);

        imageScraper.fetchImage = sinon.stub().resolves(false);

        let resultPath = await imageScraper.downloadImage('https://mysite.com/images/does-not-exist.gif');

        let tasks = imageScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[2];

        resultPath.should.eql('https://mysite.com/images/does-not-exist.gif');

        post.html.should.containEql('<img src="https://mysite.com/images/does-not-exist.gif">');
        post.html.should.not.containEql('<img src="/content/images/does-not-exist.gif">');
    });
});
