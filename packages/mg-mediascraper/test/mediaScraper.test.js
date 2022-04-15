// Switch these lines once there are useful utils
const testUtils = require('./utils');

const MediaScraper = require('..');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

const mockUrl = 'https://mysite.com/images/audio.mp3';
const mockFile = 'audio.mp3';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/media/${mockFile}`;

describe('Download Media File', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = {
            resolveFileName: sinon.stub(),
            hasFile: sinon.stub(),
            writeFile: sinon.stub()
        };

        mockFileCache.writeFile.resolves();

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

        let mediaScraper = new MediaScraper(mockFileCache);

        let resultPath = await mediaScraper.downloadMedia(mockUrl);

        mockFileCache.resolveFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });

    it('Will fetch and cache when not in the cache', async function () {
        mockFileCache.hasFile.returns(false);

        let mediaScraper = new MediaScraper(mockFileCache);

        // Fake fetching the image, we don't need to test that part
        mediaScraper.fetchMedia = sinon.stub().resolves({body: 'imagedata'});

        let resultPath = await mediaScraper.downloadMedia(mockUrl);

        mockFileCache.resolveFileName.calledOnce.should.be.true();
        mockFileCache.hasFile.calledOnce.should.be.true();
        mockFileCache.writeFile.calledOnce.should.be.true();

        resultPath.should.eql(mockOutputPath);
    });

    it('Will find and replace video elements in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql('<video><source src="/content/media/audio.mp3" type="video/mp4"></video>');
        post.html.should.not.containEql('<video><source src="https://mysite.com/files/video.mp4" /></video>');

        post.html.should.containEql('<video src="/content/media/audio.mp3"></video>');
        post.html.should.not.containEql('<video src="https://mysite.com/files/video.mp4"></video>');
    });

    it('Will find and replace audio elements in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql('<audio><source src="/content/media/audio.mp3"></audio>');
        post.html.should.not.containEql('<audio><source src="https://mysite.com/files/audio.mp3" /></audio>');

        post.html.should.containEql('<audio src="/content/media/audio.mp3"></audio>');
        post.html.should.not.containEql('<audio src="https://mysite.com/files/audio.mp3"></audio>');
    });

    it('Will find and replace media links in HTML', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[0];

        post.html.should.containEql('<a href="/content/media/audio.mp3">Repudiandae</a>');
        post.html.should.not.containEql('<a href="https://mysite.com/files/audio.mp3">Repudiandae</a>');
    });

    it('Will find and replace media elements & links in Mobiledoc posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[1];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check an Audio card
        collectedJSON.cards[0][0].should.eql('audio');
        collectedJSON.cards[0][1].should.be.an.Object();
        collectedJSON.cards[0][1].src.should.eql('/content/media/audio.mp3');
        collectedJSON.cards[0][1].title.should.eql('My audio file');
        collectedJSON.cards[0][1].duration.should.eql(52.819592);

        // Check a Video card
        collectedJSON.cards[1][0].should.eql('video');
        collectedJSON.cards[1][1].should.be.an.Object();
        collectedJSON.cards[1][1].src.should.eql('/content/media/audio.mp3'); // @TODO: Fix stubbing of mocked cached files so more than one can be used
        collectedJSON.cards[1][1].fileName.should.eql('file_example_MP4_640_3MG.mp4');
        collectedJSON.cards[1][1].caption.should.eql('My video');
        collectedJSON.cards[1][1].duration.should.eql(30.526667);
        collectedJSON.cards[1][1].width.should.eql(640);
        collectedJSON.cards[1][1].height.should.eql(360);
        collectedJSON.cards[1][1].mimeType.should.eql('video/mp4');

        // Check the contents of a HTML card in Mobiledoc
        collectedJSON.cards[2][0].should.eql('html');
        collectedJSON.cards[2][1].should.be.an.Object();
        collectedJSON.cards[2][1].html.should.be.an.String();
        collectedJSON.cards[2][1].html.should.containEql('<audio controls=""><source src="/content/media/audio.mp3"></audio>'); // @TODO: Fix stubbing of mocked cached files so more than one can be used
        collectedJSON.cards[2][1].html.should.containEql('<audio controls="" src="/content/media/audio.mp3"></audio>'); // @TODO: Fix stubbing of mocked cached files so more than one can be used

        // Check Mobiledoc links
        collectedJSON.markups[0][0].should.eql('a');
        collectedJSON.markups[0][1].should.be.an.Array().with.lengthOf(2);
        collectedJSON.markups[0][1][0].should.eql('href');
        collectedJSON.markups[0][1][1].should.eql('/content/media/audio.mp3');
    });

    it('Will find and replace media elements & links in Markdown posts', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[2];
        let mobiledoc = post.mobiledoc;
        let collectedJSON = JSON.parse(mobiledoc);

        // Check an Audio element
        collectedJSON.cards[0][0].should.eql('markdown');
        collectedJSON.cards[0][1].should.be.an.Object();
        collectedJSON.cards[0][1].markdown.should.containEql('This is [My MP3 File](/content/media/audio.mp3)');
        collectedJSON.cards[0][1].markdown.should.containEql('<audio controls=""><source src="/content/media/audio.mp3"></audio>');
    });

    it('Will not find and replace unsupported media elements & links in Mobiledoc', async function () {
        let ctx = testUtils.fixtures.readSync('ctx.json');

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

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

        mockFileCache.hasFile.returns(true);
        let mediaScraper = new MediaScraper(mockFileCache);

        let tasks = mediaScraper.fetch(ctx);
        const doTasks = makeTaskRunner(tasks, {renderer: 'silent'});
        await doTasks.run();

        const post = ctx.result.data.posts[4];

        post.html.should.containEql('<img width="1024" height="683" src="https://mysite.com/files/uploads/2021/12/image.jpg" alt="">');
        post.html.should.containEql('<p>A link to <a href="https://mysite.com/files/uploads/2021/12/image.jpg">my JPG file</a></p>');

        post.html.should.containEql('<p>A link to <a href="/content/media/audio.mp3">my MP3 file</a></p>');
        post.html.should.not.containEql('<p>A link to <a href="https://mysite.com/files/audio.mp3">my MP3 file</a></p>');
    });
});
