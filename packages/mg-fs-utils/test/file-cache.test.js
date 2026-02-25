import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {tmpdir} from 'node:os';
import imageTransform from '@tryghost/image-transform';
import FileCache from '../lib/FileCache.js';

const mockFile = 'test.jpg';
const mockStoragePath = `/tmp/blah/${mockFile}`;
const mockOutputPath = `/content/images/${mockFile}`;
const mockOriginalPath = `/tmp/blah/test_o.jpg`;

describe('FileCache', function () {
    it('Can set cache name from path in constructor', function () {
        let fileCache = new FileCache('/this/is/a/long/file/path/for/1234-current_migration_file.zip');
        assert.equal(fileCache.cacheName, '1234-current-migration-file');
    });
});

describe('writeContentFile', function () {
    let transformStub;

    beforeEach(function () {
        delete process.env.CACHE_PATH;

        transformStub = mock.method(imageTransform, 'resizeFromBuffer', () => 'optimizedimagebuffer');
    });

    afterEach(function () {
        mock.restoreAll();
    });

    it('Can use a custom specified cache directory', async function () {
        let fileCache = new FileCache('test', {
            tmpPath: '/Users/MyName/Desktop/Files'
        });

        assert.equal(fileCache.tmpDirPath, '/Users/MyName/Desktop/Files');
        assert.equal(fileCache.cacheBaseDir, '/Users/MyName/Desktop/Files/mg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will use env', async function () {
        process.env.CACHE_PATH = '/random/location';

        let fileCache = new FileCache('test');

        assert.equal(fileCache.tmpDirPath, '/random/location');
        assert.equal(fileCache.cacheBaseDir, '/random/location/mg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will use constructor tmpPath even if env CACHE_PATH is specified', async function () {
        process.env.CACHE_PATH = '/random/location';

        let fileCache = new FileCache('test', {
            tmpPath: '/Users/MyName/Desktop/Files'
        });

        assert.equal(fileCache.tmpDirPath, '/Users/MyName/Desktop/Files');
        assert.equal(fileCache.cacheBaseDir, '/Users/MyName/Desktop/Files/mg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will use system temp dir if constructor tmpPath and env CACHE_PATH are empty', async function () {
        let fileCache = new FileCache('test');

        const osTempDir = tmpdir();

        assert.equal(fileCache.tmpDirPath, osTempDir);
        assert.equal(fileCache.cacheBaseDir, `${osTempDir}/mg`);

        await fileCache.emptyCurrentCacheDir();
    });

    it('Writes one file if optimize is false', async function () {
        let fileCache = new FileCache('test');
        let spy = mock.method(fileCache, 'saveFile', () => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: false
        });

        assert.equal(spy.mock.callCount(), 1);
        assert.equal(transformStub.mock.callCount(), 0);

        assert.equal(resultPath, mockOutputPath);

        spy.mock.restore();
        await fileCache.emptyCurrentCacheDir();
    });

    it('Writes two files if optimize is true', async function () {
        let fileCache = new FileCache('test');
        let spy = mock.method(fileCache, 'saveFile', () => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: true
        });

        assert.equal(spy.mock.callCount(), 2);
        assert.equal(transformStub.mock.callCount(), 1);

        assert.deepStrictEqual(spy.mock.calls[1].arguments, [mockStoragePath, 'optimizedimagebuffer']);
        assert.deepStrictEqual(spy.mock.calls[0].arguments, [mockOriginalPath, 'imagebuffer']);

        assert.equal(resultPath, mockOutputPath);

        spy.mock.restore();
        await fileCache.emptyCurrentCacheDir();
    });

    it('Writes one file if the extension is not supported for optimization', async function () {
        let fileCache = new FileCache('test');
        let spy = mock.method(fileCache, 'saveFile', () => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: 'blah.bmp',
            storagePath: '/tmp/blah.bmp',
            outputPath: '/content/images/blah.bmp',
            optimize: true
        });

        assert.equal(spy.mock.callCount(), 1);
        assert.equal(transformStub.mock.callCount(), 0);

        assert.equal(resultPath, '/content/images/blah.bmp');

        spy.mock.restore();
        await fileCache.emptyCurrentCacheDir();
    });

    it('Correctly converts file sizes', async function () {
        let fileCache = new FileCache('test');

        const check1 = fileCache.convertMbToBytes(1.5);
        assert.equal(check1, 1572864);

        const check2 = fileCache.convertMbToBytes('1.5');
        assert.equal(check2, 1572864);

        const check3 = fileCache.convertMbToBytes(20);
        assert.equal(check3, 20971520);

        await fileCache.emptyCurrentCacheDir();
    });
});

describe('resolveFileName character handling', function () {
    it('Will not shortern the storage path is too long', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        assert.equal(fileName.filename, '/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg'));
        assert.equal(fileName.outputPath, '/content/images/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will shortern the storage path is too long', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        assert.equal(fileName.filename, '/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg'));
        assert.equal(fileName.outputPath, '/content/images/yZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz1234567890/blah.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will convert entities to dashes', async function () {
        let fileCache = new FileCache('test');

        let fileName = await fileCache.resolveFileName('/image/fetch/w_600%2Ch_400,c_fill,f_auto,q_auto:good,fl_progressive:steep,g_center/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fad8015f6-a9.0c-46f8-89f2-b6d7db866c6e_3866x2298.jpeg');

        assert.equal(fileName.filename, '/image/fetch/w_600-h_400-c_fill-f_auto-q_auto:good-fl_progressive:steep-g_center/https_3a_2f_2fsubstack-post-media-s3-amazonaws-com_2fpublic_2fimages_2fad8015f6-a9-0c-46f8-89f2-b6d7db866c6e_3866x2298.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle URLs with 2 extensions', async function () {
        let fileCache = new FileCache('test');

        let fileName = await fileCache.resolveFileName('/file.jpg/blah.jpeg');

        assert.equal(fileName.filename, '/file-jpg/blah.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will change jpeg to jpg', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/blah.jpeg');

        assert.equal(fileName.filename, '/my-images/blah.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/blah.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/blah.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will not concatenate dashes', async function () {
        let fileCache = new FileCache('test');

        let fileNameOneDash = await fileCache.resolveFileName('/my-images/-.jpeg');
        assert.equal(fileNameOneDash.filename, '/my-images/-.jpg');
        assert.ok(fileNameOneDash.storagePath.includes('/content/images/my-images/-.jpg'));
        assert.equal(fileNameOneDash.outputPath, '/content/images/my-images/-.jpg');

        let fileNameThreeDashes = await fileCache.resolveFileName('/my-images/---.jpeg');
        assert.equal(fileNameThreeDashes.filename, '/my-images/---.jpg');
        assert.ok(fileNameThreeDashes.storagePath.includes('/content/images/my-images/---.jpg'));
        assert.equal(fileNameThreeDashes.outputPath, '/content/images/my-images/---.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Handles extensions in the middle of the path', async function () {
        let fileCache = new FileCache('test');

        let fileNameOneDash = await fileCache.resolveFileName('/photo.jpg/my-images/hello.png');
        assert.equal(fileNameOneDash.filename, '/photo-jpg/my-images/hello.png');
        assert.ok(fileNameOneDash.storagePath.includes('/content/images/photo-jpg/my-images/hello.png'));
        assert.equal(fileNameOneDash.outputPath, '/content/images/photo-jpg/my-images/hello.png');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Handles spaces in the middle of the path', async function () {
        let fileCache = new FileCache('test');

        let fileNameEncodedSpaces = await fileCache.resolveFileName('/assets/Lorem%20Ipsum/Dolor%20Sit%20Amet/document.pdf');
        assert.equal(fileNameEncodedSpaces.filename, '/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf');
        assert.ok(fileNameEncodedSpaces.storagePath.includes('/content/images/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf'));
        assert.equal(fileNameEncodedSpaces.outputPath, '/content/images/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf');

        let fileNameRawSpaces = await fileCache.resolveFileName('/assets/Lorem Ipsum/Dolor Sit Amet/document.pdf');
        assert.equal(fileNameRawSpaces.filename, '/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf');
        assert.ok(fileNameRawSpaces.storagePath.includes('/content/images/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf'));
        assert.equal(fileNameRawSpaces.outputPath, '/content/images/assets/Lorem-Ipsum/Dolor-Sit-Amet/document.pdf');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Russian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/счастливые-маленькие-деревья.jpeg');

        assert.equal(fileName.filename, '/my-images/schastlivye-malenkie-derevya.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/schastlivye-malenkie-derevya.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/schastlivye-malenkie-derevya.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Bulgarian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/щастливи-малки-дървета.jpeg');

        assert.equal(fileName.filename, '/my-images/shchastlivi-malki-drveta.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/shchastlivi-malki-drveta.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/shchastlivi-malki-drveta.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Serbian characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/с-ећна=мала-дрвећа.jpeg');

        assert.equal(fileName.filename, '/my-images/s-etshna_mala-drvetsha.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/s-etshna_mala-drvetsha.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/s-etshna_mala-drvetsha.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Chinese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/快乐的小树.jpeg');

        assert.equal(fileName.filename, '/my-images/kuai_le_de_xiao_shu.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/kuai_le_de_xiao_shu.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/kuai_le_de_xiao_shu.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Japanese characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/幸せな小さな木.jpeg');

        assert.equal(fileName.filename, '/my-images/xing_senaxiao_sanamu.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/xing_senaxiao_sanamu.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/xing_senaxiao_sanamu.jpg');

        await fileCache.emptyCurrentCacheDir();
    });

    it('Will handle Arabic characters', async function () {
        let fileCache = new FileCache('test');
        let fileName = await fileCache.resolveFileName('/my-images/أشجار صغيرة سعيدة.jpeg');

        assert.equal(fileName.filename, '/my-images/shjr-sgyr_-saayd.jpg');
        assert.ok(fileName.storagePath.includes('/content/images/my-images/shjr-sgyr_-saayd.jpg'));
        assert.equal(fileName.outputPath, '/content/images/my-images/shjr-sgyr_-saayd.jpg');

        await fileCache.emptyCurrentCacheDir();
    });
});
