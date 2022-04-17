// Switch these lines once there are useful utils
const testUtils = require('./utils');

const fs = require('fs-extra');
const imageTransform = require('@tryghost/image-transform');
const FileCache = require('../').FileCache;

const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;
const mockOriginalPath = `/tmp/blah/test_o.jpg`;

describe('writeImageFile', function () {
    let outputFileStub, transformStub;

    beforeEach(function () {
        outputFileStub = sinon.stub(fs, 'outputFile');
        transformStub = sinon.stub(imageTransform, 'resizeFromBuffer').returns('optimizedimagebuffer');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Writes one file if optimize is false', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: false
        });

        outputFileStub.calledOnce.should.be.true();
        transformStub.calledOnce.should.be.false();

        resultPath.should.eql(mockOutputPath);
    });

    it('Writes two files if optimize is true', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: true
        });

        outputFileStub.calledTwice.should.be.true();
        transformStub.calledOnce.should.be.true();

        outputFileStub.firstCall.args.should.eql([mockStoragePath, 'optimizedimagebuffer']);
        outputFileStub.secondCall.args.should.eql([mockOriginalPath, 'imagebuffer']);

        resultPath.should.eql(mockOutputPath);
    });

    it('Writes one file if the extension is not supported for optimization', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: 'blah.gif',
            storagePath: '/tmp/blah.gif',
            outputPath: '/content/images/blah.gif',
            optimize: true
        });

        outputFileStub.calledOnce.should.be.true();
        transformStub.calledOnce.should.be.false();

        resultPath.should.eql('/content/images/blah.gif');
    });

    it('Correctly converts file sizes', async function () {
        let fileCache = new FileCache('test');

        const check1 = fileCache.convertMbToBytes(1.5);
        check1.should.equal(1572864);

        const check2 = fileCache.convertMbToBytes('1.5');
        check2.should.equal(1572864);

        const check3 = fileCache.convertMbToBytes(20);
        check3.should.equal(20971520);
    });

    it('Generates a list of files', async function () {
        let fileCache = new FileCache('test');

        const files = fileCache.getAllFiles(testUtils.fixtures.getPath());

        files.should.be.an.Array().with.lengthOf(2);
        files[0].should.containEql('mg-fs-utils/test/fixtures/sample-images/ghost-logo-dark.png');
        files[1].should.containEql('mg-fs-utils/test/fixtures/sample-images/ghost-logo-orb.png');
    });

    it('Generates a report on file sizes', async function () {
        let fileCache = new FileCache('test');

        const fileReport = fileCache.getFileSizes(testUtils.fixtures.getPath(), 0.045); // 45kb

        fileReport.should.be.an.Object().with.lengthOf(2);

        fileReport[0].humanSize.should.eql('46.22KB');
        fileReport[0].bytesSize.should.eql(47328);
        fileReport[0].path.should.containEql('mg-fs-utils/test/fixtures/sample-images/ghost-logo-dark.png');
        fileReport[0].overSizeLimit.should.be.true();

        fileReport[1].humanSize.should.eql('43.49KB');
        fileReport[1].bytesSize.should.eql(44537);
        fileReport[1].path.should.containEql('mg-fs-utils/test/fixtures/sample-images/ghost-logo-orb.png');
        fileReport[1].overSizeLimit.should.be.false();
    });
});
