import {jest} from '@jest/globals';
import fs from 'fs-extra';
import imageTransform from '@tryghost/image-transform';
import {FileCache} from '../lib/FileCache.js';

const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;
const mockOriginalPath = `/tmp/blah/test_o.jpg`;

describe('writeImageFile', function () {
    let outputFileStub;
    let transformStub;

    beforeEach(function () {
        outputFileStub = jest.spyOn(fs, 'outputFile');
        transformStub = jest.spyOn(imageTransform, 'resizeFromBuffer').mockReturnValue('optimizedimagebuffer');
    });

    afterEach(function () {
        outputFileStub.mockReset();
        transformStub.mockReset();
    });

    it('Writes one file if optimize is false', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: false
        });

        expect(outputFileStub).toHaveBeenCalledTimes(1);
        expect(transformStub).toHaveBeenCalledTimes(0);

        expect(resultPath).toEqual(mockOutputPath);
    });

    it('Writes two files if optimize is true', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: true
        });

        expect(outputFileStub).toHaveBeenCalledTimes(2);
        expect(transformStub).toHaveBeenCalledTimes(1);

        expect(outputFileStub.mock.calls[1]).toEqual([mockStoragePath, 'optimizedimagebuffer']);
        expect(outputFileStub.mock.calls[0]).toEqual([mockOriginalPath, 'imagebuffer']);

        expect(resultPath).toEqual(mockOutputPath);
    });

    it('Writes one file if the extension is not supported for optimization', async function () {
        let fileCache = new FileCache('test');

        let resultPath = await fileCache.writeImageFile('imagebuffer', {
            filename: 'blah.bmp',
            storagePath: '/tmp/blah.bmp',
            outputPath: '/content/images/blah.bmp',
            optimize: true
        });

        expect(outputFileStub).toHaveBeenCalledTimes(1);
        expect(transformStub).toHaveBeenCalledTimes(0);

        expect(resultPath).toEqual('/content/images/blah.bmp');
    });

    it('Correctly converts file sizes', async function () {
        let fileCache = new FileCache('test');

        const check1 = fileCache.convertMbToBytes(1.5);
        expect(check1).toEqual(1572864);

        const check2 = fileCache.convertMbToBytes('1.5');
        expect(check2).toEqual(1572864);

        const check3 = fileCache.convertMbToBytes(20);
        expect(check3).toEqual(20971520);
    });

    it('Will not shortern the storage path is too long', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        expect(fileName.filename).toEqual('/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        expect(fileName.storagePath).toInclude('/content/images/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        expect(fileName.outputPath).toEqual('/content/images/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
    });

    it('Will shortern the storage path is too long', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        expect(fileName.filename).toEqual('/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        expect(fileName.storagePath).toInclude('/content/images/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        expect(fileName.outputPath).toEqual('/content/images/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
    });

    it('Will change jpeg to jpg', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/blah.jpeg');

        expect(fileName.filename).toEqual('/my-images/blah.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/blah.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/blah.jpg');
    });
});

describe('resolveFileName character handling', function () {
    it('Will handle Russian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/счастливые-маленькие-деревья.jpeg');

        expect(fileName.filename).toEqual('/my-images/schastlivye-malenkie-derevya.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/schastlivye-malenkie-derevya.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/schastlivye-malenkie-derevya.jpg');
    });

    it('Will handle Bulgarian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/щастливи-малки-дървета.jpeg');

        expect(fileName.filename).toEqual('/my-images/shchastlivi-malki-drveta.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/shchastlivi-malki-drveta.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/shchastlivi-malki-drveta.jpg');
    });

    it('Will handle Serbian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/с-ећна=мала-дрвећа.jpeg');

        expect(fileName.filename).toEqual('/my-images/s-etshna-mala-drvetsha.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/s-etshna-mala-drvetsha.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/s-etshna-mala-drvetsha.jpg');
    });

    it('Will handle Chinese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/快乐的小树.jpeg');

        expect(fileName.filename).toEqual('/my-images/kuai-le-de-xiao-shu.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/kuai-le-de-xiao-shu.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/kuai-le-de-xiao-shu.jpg');
    });

    it('Will handle Japanese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/幸せな小さな木.jpeg');

        expect(fileName.filename).toEqual('/my-images/xing-senaxiao-sanamu.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/xing-senaxiao-sanamu.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/xing-senaxiao-sanamu.jpg');
    });

    it('Will handle Arabic characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/أشجار صغيرة سعيدة.jpeg');

        expect(fileName.filename).toEqual('/my-images/shjr-sgyr-saayd.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/shjr-sgyr-saayd.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/shjr-sgyr-saayd.jpg');
    });
});
