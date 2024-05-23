import {tmpdir} from 'node:os';
import {jest} from '@jest/globals';
import imageTransform from '@tryghost/image-transform';
import FileCache from '../lib/FileCache.js';

const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;
const mockOriginalPath = `/tmp/blah/test_o.jpg`;

describe('FileCache', function () {
    it('Can set cache name from path in constructor', function () {
        let fileCache = new FileCache('/this/is/a/long/file/path/for/1234-current_migration_file.zip');
        expect(fileCache.cacheName).toEqual('1234-current-migration-file');
    });
});

describe('writeContentFile', function () {
    let transformStub;

    beforeEach(function () {
        transformStub = jest.spyOn(imageTransform, 'resizeFromBuffer').mockReturnValue('optimizedimagebuffer');
    });

    afterEach(function () {
        transformStub.mockReset();
    });

    it('Can use a custom specified cache directory', async function () {
        let fileCache = new FileCache('test', {
            tmpPath: '/Users/MyName/Desktop/Files'
        });

        expect(fileCache.tmpDirPath).toEqual('/Users/MyName/Desktop/Files');
        expect(fileCache.cacheBaseDir).toEqual('/Users/MyName/Desktop/Files/mg');
    });

    it('Will use env', function () {
        process.env.CACHE_PATH = '/random/location';

        let fileCache = new FileCache('test');

        expect(fileCache.tmpDirPath).toEqual('/random/location');
        expect(fileCache.cacheBaseDir).toEqual('/random/location/mg');

        delete process.env.CACHE_PATH;
    });

    it('Will use constructor tmpPath even if env CACHE_PATH is specified', function () {
        process.env.CACHE_PATH = '/random/location';

        let fileCache = new FileCache('test', {
            tmpPath: '/Users/MyName/Desktop/Files'
        });

        expect(fileCache.tmpDirPath).toEqual('/Users/MyName/Desktop/Files');
        expect(fileCache.cacheBaseDir).toEqual('/Users/MyName/Desktop/Files/mg');

        delete process.env.CACHE_PATH;
    });

    it('Will use system temp dir if constructor tmpPath and env CACHE_PATH are empty', function () {
        let fileCache = new FileCache('test');

        const osTempDir = tmpdir();

        expect(fileCache.tmpDirPath).toEqual(osTempDir);
        expect(fileCache.cacheBaseDir).toEqual(`${osTempDir}/mg`);
    });

    it('Writes one file if optimize is false', async function () {
        let fileCache = new FileCache('test');
        let spy = jest.spyOn(fileCache, 'saveFile').mockImplementation(() => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: false
        });

        expect(fileCache.saveFile).toHaveBeenCalledTimes(1);
        expect(transformStub).toHaveBeenCalledTimes(0);

        expect(resultPath).toEqual(mockOutputPath);

        spy.mockRestore();
    });

    it('Writes two files if optimize is true', async function () {
        let fileCache = new FileCache('test');
        let spy = jest.spyOn(fileCache, 'saveFile').mockImplementation(() => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: true
        });

        expect(fileCache.saveFile).toHaveBeenCalledTimes(2);
        expect(transformStub).toHaveBeenCalledTimes(1);

        expect(fileCache.saveFile.mock.calls[1]).toEqual([mockStoragePath, 'optimizedimagebuffer']);
        expect(fileCache.saveFile.mock.calls[0]).toEqual([mockOriginalPath, 'imagebuffer']);

        expect(resultPath).toEqual(mockOutputPath);

        spy.mockRestore();
    });

    it('Writes one file if the extension is not supported for optimization', async function () {
        let fileCache = new FileCache('test');
        let spy = jest.spyOn(fileCache, 'saveFile').mockImplementation(() => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: 'blah.bmp',
            storagePath: '/tmp/blah.bmp',
            outputPath: '/content/images/blah.bmp',
            optimize: true
        });

        expect(fileCache.saveFile).toHaveBeenCalledTimes(1);
        expect(transformStub).toHaveBeenCalledTimes(0);

        expect(resultPath).toEqual('/content/images/blah.bmp');

        spy.mockRestore();
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
});

describe('resolveFileName character handling', function () {
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

    it('Will not concatenate dashes', async function () {
        let fileCache = new FileCache('test');

        let fileNameOneDash = await fileCache.resolveFileName('/my-images/-.jpeg');
        expect(fileNameOneDash.filename).toEqual('/my-images/-.jpg');
        expect(fileNameOneDash.storagePath).toInclude('/content/images/my-images/-.jpg');
        expect(fileNameOneDash.outputPath).toEqual('/content/images/my-images/-.jpg');

        let fileNameThreeDashes = await fileCache.resolveFileName('/my-images/---.jpeg');
        expect(fileNameThreeDashes.filename).toEqual('/my-images/---.jpg');
        expect(fileNameThreeDashes.storagePath).toInclude('/content/images/my-images/---.jpg');
        expect(fileNameThreeDashes.outputPath).toEqual('/content/images/my-images/---.jpg');
    });

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

        expect(fileName.filename).toEqual('/my-images/s-etshna_mala-drvetsha.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/s-etshna_mala-drvetsha.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/s-etshna_mala-drvetsha.jpg');
    });

    it('Will handle Chinese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/快乐的小树.jpeg');

        expect(fileName.filename).toEqual('/my-images/kuai_le_de_xiao_shu.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/kuai_le_de_xiao_shu.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/kuai_le_de_xiao_shu.jpg');
    });

    it('Will handle Japanese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/幸せな小さな木.jpeg');

        expect(fileName.filename).toEqual('/my-images/xing_senaxiao_sanamu.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/xing_senaxiao_sanamu.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/xing_senaxiao_sanamu.jpg');
    });

    it('Will handle Arabic characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/أشجار صغيرة سعيدة.jpeg');

        expect(fileName.filename).toEqual('/my-images/shjr_sgyr_saayd.jpg');
        expect(fileName.storagePath).toInclude('/content/images/my-images/shjr_sgyr_saayd.jpg');
        expect(fileName.outputPath).toEqual('/content/images/my-images/shjr_sgyr_saayd.jpg');
    });
});
