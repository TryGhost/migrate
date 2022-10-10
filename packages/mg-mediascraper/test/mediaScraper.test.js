// Switch these lines once there are useful utils
const testUtils = require('./utils');

const MediaScraper = require('..');
const makeTaskRunner = require('./utils/task-runner.js');

const mockAudioUrl = 'https://mysite.com/files/audio.mp3';
const mockAudioFile = 'audio.mp3';
const mockAudioFileSize = 3145728; // 3mb as bytes
const mockAudioStoragePath = `/tmp/blah/${mockAudioFile}`;
const mockAudioOutputPath = `/content/media/${mockAudioFile}`;

const mockVideoUrl = 'https://mysite.com/files/video.mp4';
const mockVideoFile = 'video.mp4';
const mockVideoFileSize = 5242880; // 5mb as bytes
const mockVideoStoragePath = `/tmp/blah/${mockVideoFile}`;
const mockVideoOutputPath = `/content/media/${mockVideoFile}`;

describe('Download Media File', function () {
    let mockAudioFileCache;
    let mockVideoFileCache;

    beforeEach(function () {
        mockAudioFileCache = {
            resolveFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeFile: sinon.stub()
        };

        mockAudioFileCache.writeFile.resolves();

        mockAudioFileCache.resolveFileName.returns({
            fileName: mockAudioFile,
            storagePath: mockAudioStoragePath,
            outputPath: mockAudioOutputPath
        });

        mockVideoFileCache = {
            resolveFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeFile: sinon.stub()
        };

        mockVideoFileCache.writeFile.resolves();

        mockVideoFileCache.resolveFileName.returns({
            fileName: mockVideoFile,
            storagePath: mockVideoStoragePath,
            outputPath: mockVideoOutputPath
        });
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Will load audio from cache', async function () {
        mockAudioFileCache.hasFile.returns(true);

        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let resultPath = await mediaScraper.downloadMedia(mockAudioUrl);

        mockAudioFileCache.resolveFileName.calledOnce.should.be.true();
        mockAudioFileCache.hasFile.calledOnce.should.be.true();

        resultPath.should.eql(mockAudioOutputPath);
    });

    it('Will load video from cache', async function () {
        mockVideoFileCache.hasFile.returns(true);

        let mediaScraper = new MediaScraper(mockVideoFileCache);

        let resultPath = await mediaScraper.downloadMedia(mockVideoUrl);

        mockVideoFileCache.resolveFileName.calledOnce.should.be.true();
        mockVideoFileCache.hasFile.calledOnce.should.be.true();

        resultPath.should.eql(mockVideoOutputPath);
    });

    it('Will fetch and cache audio when not in the cache', async function () {
        mockAudioFileCache.hasFile.returns(false);

        let mediaScraper = new MediaScraper(mockAudioFileCache);

        // Fake fetching the image, we don't need to test that part
        mediaScraper.fetchMedia = sinon.stub().resolves(true);

        let resultPath = await mediaScraper.downloadMedia(mockAudioUrl);

        mockAudioFileCache.resolveFileName.calledOnce.should.be.true();
        mockAudioFileCache.hasFile.calledOnce.should.be.true();
        mockAudioFileCache.writeFile.calledOnce.should.be.true();

        resultPath.should.eql(mockAudioOutputPath);
    });

    it('Will fetch and cache video when not in the cache', async function () {
        mockVideoFileCache.hasFile.returns(false);

        let mediaScraper = new MediaScraper(mockVideoFileCache);

        // Fake fetching the image, we don't need to test that part
        mediaScraper.fetchMedia = sinon.stub().resolves(true);

        let resultPath = await mediaScraper.downloadMedia(mockVideoUrl);

        mockVideoFileCache.resolveFileName.calledOnce.should.be.true();
        mockVideoFileCache.hasFile.calledOnce.should.be.true();
        mockVideoFileCache.writeFile.calledOnce.should.be.true();

        resultPath.should.eql(mockVideoOutputPath);
    });

    it('Will not fetch files that are too large if sizeLimit is defined', async function () {
        mockAudioFileCache.hasFile.returns(false);

        let mediaScraper = new MediaScraper(mockAudioFileCache, {
            sizeLimit: 1
        });

        // Fake fetching the image, we don't need to test that part
        mediaScraper.fetchMedia = sinon.stub().resolves({
            headers: {'content-length': mockAudioFileSize},
            body: 'myfakeaudiobody'
        });

        let resultPath = await mediaScraper.downloadMedia(mockAudioUrl);

        resultPath.should.eql(mockAudioUrl);

        mediaScraper.sizeReport.data.should.be.an.Array().with.lengthOf(1);
        mediaScraper.sizeReport.data[0].src.should.eql('https://mysite.com/files/audio.mp3');
        mediaScraper.sizeReport.data[0].bytesSize.should.eql(3145728);
    });

    it('Will fetch files that are within the defined sizeLimit', async function () {
        mockVideoFileCache.hasFile.returns(false);

        let mediaScraper = new MediaScraper(mockVideoFileCache, {
            sizeLimit: 10
        });

        // Fake fetching the image, we don't need to test that part
        mediaScraper.fetchMedia = sinon.stub().resolves({
            headers: {'content-length': mockVideoFileSize},
            body: 'myfakevideobody'
        });

        let resultPath = await mediaScraper.downloadMedia(mockVideoUrl);

        resultPath.should.eql(mockVideoOutputPath);

        mediaScraper.sizeReport.data.should.be.an.Array().with.lengthOf(0);
    });

    it('Will find and replace video elements in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockVideoFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockVideoFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql(`<video><source src="${mockVideoOutputPath}" type="video/mp4"></video>`);
        post.html.should.not.containEql(`<video><source src="${mockVideoUrl}" /></video>`);

        post.html.should.containEql(`<video src="${mockVideoOutputPath}"></video>`);
        post.html.should.not.containEql(`<video src="${mockVideoUrl}"></video>`);
    });

    it('Will find and replace audio elements in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql(`<audio><source src="${mockAudioOutputPath}"></audio>`);
        post.html.should.not.containEql(`<audio><source src="${mockAudioUrl}" /></audio>`);

        post.html.should.containEql(`<audio src="${mockAudioOutputPath}"></audio>`);
        post.html.should.not.containEql(`<audio src="${mockAudioUrl}"></audio>`);
    });

    it('Will find and replace media links in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql(`<a href="${mockAudioOutputPath}">Repudiandae</a>`);
        post.html.should.not.containEql(`<a href=${mockAudioUrl}">Repudiandae</a>`);
    });

    it('Will find and replace audio elements in Mobiledoc posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[1];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check an Audio card
        collectedJSON.cards[0][0].should.eql('audio');
        collectedJSON.cards[0][1].should.be.an.Object();
        collectedJSON.cards[0][1].src.should.eql(mockAudioOutputPath);
        collectedJSON.cards[0][1].title.should.eql('My audio file');
        collectedJSON.cards[0][1].duration.should.eql(52.819592);

        // Check the contents of a HTML card in Mobiledoc
        collectedJSON.cards[2][0].should.eql('html');
        collectedJSON.cards[2][1].should.be.an.Object();
        collectedJSON.cards[2][1].html.should.be.an.String();
        collectedJSON.cards[2][1].html.should.containEql(`<audio controls=""><source src="${mockAudioOutputPath}"></audio>`);
        collectedJSON.cards[2][1].html.should.containEql(`<audio controls="" src="${mockAudioOutputPath}"></audio>`);

        // Check Mobiledoc links
        collectedJSON.markups[0][0].should.eql('a');
        collectedJSON.markups[0][1].should.be.an.Array().with.lengthOf(2);
        collectedJSON.markups[0][1][0].should.eql('href');
        collectedJSON.markups[0][1][1].should.eql(mockAudioOutputPath);
    });

    it('Will find and replace audio links in Mobiledoc posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[1];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check Mobiledoc links
        collectedJSON.markups[0][0].should.eql('a');
        collectedJSON.markups[0][1].should.be.an.Array().with.lengthOf(2);
        collectedJSON.markups[0][1][0].should.eql('href');
        collectedJSON.markups[0][1][1].should.eql(mockAudioOutputPath);
    });

    it('Will find and replace video elements in Mobiledoc posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockVideoFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockVideoFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[1];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check a Video card
        collectedJSON.cards[1][0].should.eql('video');
        collectedJSON.cards[1][1].should.be.an.Object();
        collectedJSON.cards[1][1].src.should.eql(mockVideoOutputPath); // @TODO: Fix stubbing of mocked cached files so more than one can be used
        collectedJSON.cards[1][1].fileName.should.eql('file_example_MP4_640_3MG.mp4');
        collectedJSON.cards[1][1].caption.should.eql('My video');
        collectedJSON.cards[1][1].duration.should.eql(30.526667);
        collectedJSON.cards[1][1].width.should.eql(640);
        collectedJSON.cards[1][1].height.should.eql(360);
        collectedJSON.cards[1][1].mimeType.should.eql('video/mp4');
    });

    it('Will find and replace media elements & links in Markdown posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[2];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check an Audio element
        collectedJSON.cards[0][0].should.eql('markdown');
        collectedJSON.cards[0][1].should.be.an.Object();
        collectedJSON.cards[0][1].markdown.should.containEql(`This is [My MP3 File](${mockAudioOutputPath})`);
        collectedJSON.cards[0][1].markdown.should.containEql(`<audio controls=""><source src="${mockAudioOutputPath}"></audio>`);
    });

    it('Will not find and replace unsupported media elements & links in Mobiledoc', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[3];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check an Audio card
        collectedJSON.cards[0][0].should.eql('audio');
        collectedJSON.cards[0][1].should.be.an.Object();
        collectedJSON.cards[0][1].src.should.eql('https://example.com/content/media/2022/02/audio.aac');
        collectedJSON.cards[0][1].title.should.eql('My audio file');
        collectedJSON.cards[0][1].duration.should.eql(52.819592);
    });

    it('Will not find and replace unsupported media elements & links in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockAudioFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockAudioFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[4];

        post.html.should.containEql('<img width="1024" height="683" src="https://mysite.com/files/uploads/2021/12/image.jpg" alt="">');
        post.html.should.containEql('<p>A link to <a href="https://mysite.com/files/uploads/2021/12/image.jpg">my JPG file</a></p>');

        post.html.should.containEql(`<p>A link to <a href="${mockAudioOutputPath}">my MP3 file</a></p>`);
        post.html.should.not.containEql(`<p>A link to <a href="${mockAudioUrl}">my MP3 file</a></p>`);
    });
});
