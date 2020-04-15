// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

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
});
