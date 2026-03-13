import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach, mock} from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {existsSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import imageTransform from '@tryghost/image-transform';
import errors from '@tryghost/errors';
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

describe('Constructor & getters', function () {
    afterEach(function () {
        delete process.env.CACHE_PATH;
    });

    it('Stores batchName when provided in options', function () {
        let fileCache = new FileCache('test', {batchName: 'batch-42'});
        assert.equal(fileCache.batchName, 'batch-42');
    });

    it('Does not set batchName when not provided', function () {
        let fileCache = new FileCache('test');
        assert.equal(fileCache.batchName, undefined);
    });

    it('cacheKey returns a deterministic memoized value', function () {
        let fileCache = new FileCache('test');
        const key1 = fileCache.cacheKey;
        const key2 = fileCache.cacheKey;

        assert.equal(key1, key2);
        assert.ok(key1.endsWith('-test'));
        assert.ok(key1.length > 5); // has the md5 prefix
    });

    it('Creates zipDir instead of content dirs when contentDir is false', async function () {
        const tmp = join(tmpdir(), `fc-test-no-content-${Date.now()}`);
        let fileCache = new FileCache('test', {tmpPath: tmp, contentDir: false});

        // Access cacheDir to trigger directory creation
        const dir = fileCache.cacheDir;

        assert.ok(existsSync(fileCache.zipDir));
        // imageDir should NOT exist inside zipDir when contentDir is false
        assert.ok(!existsSync(join(fileCache.zipDir, 'content', 'images')));

        assert.ok(dir);
        await fileCache.emptyCurrentCacheDir();
        rmSync(tmp, {recursive: true, force: true});
    });

    it('defaultCacheFileName includes batchName when set', function () {
        let fileCache = new FileCache('test', {batchName: '7'});
        const name = fileCache.defaultCacheFileName;
        assert.ok(name.startsWith('gh-test-batch-7-'));
    });

    it('defaultCacheFileName excludes batchName when not set', function () {
        let fileCache = new FileCache('test');
        const name = fileCache.defaultCacheFileName;
        assert.ok(name.startsWith('gh-test-'));
        assert.ok(!name.includes('batch'));
    });

    it('defaultTmpJSONFileName ends with .json', function () {
        let fileCache = new FileCache('test');
        assert.ok(fileCache.defaultTmpJSONFileName.endsWith('.json'));
    });

    it('defaultTmpCSVFileName ends with .csv', function () {
        let fileCache = new FileCache('test');
        assert.ok(fileCache.defaultTmpCSVFileName.endsWith('.csv'));
    });

    it('defaultZipFileName ends with .zip', function () {
        let fileCache = new FileCache('test');
        assert.ok(fileCache.defaultZipFileName.endsWith('.zip'));
    });

    it('defaultErrorFileName ends with .errors.json', function () {
        let fileCache = new FileCache('test');
        assert.ok(fileCache.defaultErrorFileName.endsWith('.errors.json'));
    });
});

describe('ensureJsonExtension', function () {
    it('Adds .json when isJSON is true and filename lacks it', function () {
        let fileCache = new FileCache('test');
        assert.equal(fileCache.ensureJsonExtension({filename: 'data'}), 'data.json');
    });

    it('Does not double .json when filename already has it', function () {
        let fileCache = new FileCache('test');
        assert.equal(fileCache.ensureJsonExtension({filename: 'data.json'}), 'data.json');
    });

    it('Does not add .json when isJSON is false', function () {
        let fileCache = new FileCache('test');
        assert.equal(fileCache.ensureJsonExtension({filename: 'data.txt', isJSON: false}), 'data.txt');
    });
});

describe('resolveMediaFileName', function () {
    it('Resolves filenames with media path', async function () {
        let fileCache = new FileCache('test');
        let result = fileCache.resolveMediaFileName('/videos/clip.mp4');

        assert.equal(result.filename, '/videos/clip.mp4');
        assert.ok(result.storagePath.includes('/content/media/videos/clip.mp4'));
        assert.equal(result.outputPath, '/content/media/videos/clip.mp4');

        await fileCache.emptyCurrentCacheDir();
    });
});

describe('resolveFileName images with unknown or missing extension', function () {
    it('Appends .jpeg when image has no extension', async function () {
        let fileCache = new FileCache('test');
        let result = fileCache.resolveFileName('/photos/no-ext', 'images');

        assert.ok(result.filename.endsWith('.jpeg'));

        await fileCache.emptyCurrentCacheDir();
    });

    it('Does not append .jpeg when image has a known extension', async function () {
        let fileCache = new FileCache('test');
        let result = fileCache.resolveFileName('/photos/pic.png', 'images');

        assert.ok(result.filename.endsWith('.png'));
        assert.ok(!result.filename.includes('.jpeg'));

        await fileCache.emptyCurrentCacheDir();
    });
});

describe('resolveFileName type=media', function () {
    it('Uses mediaDir and mediaPath', async function () {
        let fileCache = new FileCache('test');
        let result = fileCache.resolveFileName('/audio/song.mp3', 'media');

        assert.ok(result.storagePath.includes('/content/media/'));
        assert.equal(result.outputPath, '/content/media/audio/song.mp3');

        await fileCache.emptyCurrentCacheDir();
    });
});

describe('resolveFileName type=files', function () {
    it('Uses filesDir and filesPath', async function () {
        let fileCache = new FileCache('test');
        let result = fileCache.resolveFileName('/docs/readme.pdf', 'files');

        assert.ok(result.storagePath.includes('/content/files/'));
        assert.equal(result.outputPath, '/content/files/docs/readme.pdf');

        await fileCache.emptyCurrentCacheDir();
    });
});

describe('File I/O methods', function () {
    let fileCache;
    let tmpPath;

    beforeEach(function () {
        delete process.env.CACHE_PATH;
        tmpPath = join(tmpdir(), `fc-io-test-${Date.now()}`);
        fileCache = new FileCache('test', {tmpPath});
    });

    afterEach(async function () {
        await fileCache.emptyCurrentCacheDir();
        rmSync(tmpPath, {recursive: true, force: true});
    });

    describe('writeTmpFile', function () {
        it('Writes a JSON file', async function () {
            const data = {hello: 'world'};
            const filepath = await fileCache.writeTmpFile(data, 'test-data');

            assert.ok(filepath.endsWith('test-data.json'));
            assert.ok(existsSync(filepath));
        });

        it('Writes a non-JSON file', async function () {
            const data = 'plain text content';
            const filepath = await fileCache.writeTmpFile(data, 'test-data.txt', false);

            assert.ok(filepath.endsWith('test-data.txt'));
            assert.ok(existsSync(filepath));
        });
    });

    describe('writeTmpFileSync', function () {
        it('Writes a JSON file synchronously', function () {
            const data = {sync: true};
            const filepath = fileCache.writeTmpFileSync(data, 'sync-data');

            assert.ok(filepath.endsWith('sync-data.json'));
            assert.ok(existsSync(filepath));
        });

        it('Writes a non-JSON file synchronously', function () {
            const data = 'sync plain text';
            const filepath = fileCache.writeTmpFileSync(data, 'sync-data.txt', false);

            assert.ok(filepath.endsWith('sync-data.txt'));
            assert.ok(existsSync(filepath));
        });
    });

    describe('readTmpJSONFile', function () {
        it('Reads back a previously written JSON file', async function () {
            const data = {key: 'value'};
            await fileCache.writeTmpFile(data, 'read-test');
            const result = await fileCache.readTmpJSONFile('read-test');

            assert.deepEqual(result, data);
        });

        it('Does not double .json extension', async function () {
            const data = {ext: 'test'};
            await fileCache.writeTmpFile(data, 'read-ext.json');
            const result = await fileCache.readTmpJSONFile('read-ext.json');

            assert.deepEqual(result, data);
        });
    });

    describe('hasTmpJSONFile', function () {
        it('Returns true when file exists', async function () {
            await fileCache.writeTmpFile({exists: true}, 'exists-check');
            assert.equal(fileCache.hasTmpJSONFile('exists-check'), true);
        });

        it('Returns false when file does not exist', function () {
            // Access cacheDir to create dirs
            fileCache.cacheDir; // eslint-disable-line no-unused-expressions
            assert.equal(fileCache.hasTmpJSONFile('nonexistent'), false);
        });

        it('Handles filename already ending in .json', async function () {
            await fileCache.writeTmpFile({a: 1}, 'with-ext.json');
            assert.equal(fileCache.hasTmpJSONFile('with-ext.json'), true);
        });
    });

    describe('writeGhostImportFile', function () {
        it('Writes JSON import file', async function () {
            const data = {db: [{data: {posts: []}}]};
            const filepath = await fileCache.writeGhostImportFile(data);

            assert.ok(filepath.endsWith('ghost-import.json'));
            assert.ok(existsSync(filepath));
        });

        it('Writes non-JSON import file', async function () {
            const data = 'csv,data\n1,2';
            const filepath = await fileCache.writeGhostImportFile(data, {isJSON: false});

            assert.ok(existsSync(filepath));
        });

        it('Uses custom filename when provided', async function () {
            const data = {custom: true};
            const filepath = await fileCache.writeGhostImportFile(data, {filename: 'custom-import.json'});

            assert.ok(filepath.endsWith('custom-import.json'));
        });

        it('Uses custom path when provided', async function () {
            const customDir = join(tmpPath, 'custom-dir');
            mkdirSync(customDir, {recursive: true});
            const data = {pathed: true};
            const filepath = await fileCache.writeGhostImportFile(data, {path: join(customDir, 'dummy.json')});

            assert.ok(filepath.startsWith(customDir));
        });
    });

    describe('writeErrorJSONFile', function () {
        it('Writes error JSON file with default name', async function () {
            const errorData = [{message: 'something failed'}];
            const filepath = await fileCache.writeErrorJSONFile(errorData);

            assert.ok(filepath.endsWith('.errors.json'));
            assert.ok(existsSync(filepath));
        });

        it('Uses custom filename when provided', async function () {
            const errorData = [{message: 'fail'}];
            const filepath = await fileCache.writeErrorJSONFile(errorData, {filename: 'my-errors'});

            assert.ok(filepath.endsWith('my-errors.json'));
        });
    });

    describe('writeReportCSVFile', function () {
        it('Writes a CSV report file', async function () {
            const report = {
                data: [
                    {src: 'a.jpg', status: 'ok'},
                    {src: 'b.jpg', status: 'fail'},
                    {src: 'a.jpg', status: 'duplicate'} // will be deduped
                ]
            };
            const result = await fileCache.writeReportCSVFile(report, {filename: 'test-report'});

            assert.ok(result.path.endsWith('report-test-report.csv'));
            assert.ok(existsSync(result.path));
            assert.equal(result.data.length, 2); // deduped
        });

        it('Uses false as filename when none is provided', async function () {
            const report = {
                data: [{src: 'c.jpg', status: 'ok'}]
            };
            const result = await fileCache.writeReportCSVFile(report);

            assert.ok(result.path.endsWith('report-false.csv'));
            assert.ok(existsSync(result.path));
        });
    });

    describe('saveFile', function () {
        it('Saves a file to disk', async function () {
            const filePath = join(tmpPath, 'save-test', 'output.txt');
            await fileCache.saveFile(filePath, 'hello world');

            assert.ok(existsSync(filePath));
        });
    });

    describe('deleteFileOrDir', function () {
        it('Deletes a file', async function () {
            const filePath = join(tmpPath, 'delete-test.txt');
            mkdirSync(tmpPath, {recursive: true});
            writeFileSync(filePath, 'to delete');
            assert.ok(existsSync(filePath));

            await fileCache.deleteFileOrDir(filePath);
            assert.ok(!existsSync(filePath));
        });

        it('Deletes a directory', async function () {
            const dirPath = join(tmpPath, 'delete-dir');
            mkdirSync(dirPath, {recursive: true});
            writeFileSync(join(dirPath, 'inner.txt'), 'inner');
            assert.ok(existsSync(dirPath));

            await fileCache.deleteFileOrDir(dirPath);
            assert.ok(!existsSync(dirPath));
        });
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

    it('Resolves image filename when storagePath/outputPath not provided', async function () {
        let fileCache = new FileCache('test');
        let spy = mock.method(fileCache, 'saveFile', () => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: '/my-images/photo.jpg',
            optimize: false
        });

        assert.equal(spy.mock.callCount(), 1);
        assert.equal(resultPath, '/content/images/my-images/photo.jpg');

        spy.mock.restore();
        await fileCache.emptyCurrentCacheDir();
    });

    it('Falls back to saving original when resizeFromBuffer throws', async function () {
        transformStub.mock.restore();
        mock.method(imageTransform, 'resizeFromBuffer', () => {
            throw new errors.InternalServerError({message: 'transform failed'});
        });

        let fileCache = new FileCache('test');
        let spy = mock.method(fileCache, 'saveFile', () => true);

        let resultPath = await fileCache.writeContentFile('imagebuffer', {
            filename: mockFile,
            storagePath: mockStoragePath,
            outputPath: mockOutputPath,
            optimize: true
        });

        // 1st call: save original before resize attempt, 2nd call: fallback after error
        assert.equal(spy.mock.callCount(), 2);
        assert.deepStrictEqual(spy.mock.calls[1].arguments, [mockStoragePath, 'imagebuffer']);
        assert.equal(resultPath, mockOutputPath);

        spy.mock.restore();
        await fileCache.emptyCurrentCacheDir();
    });
});

describe('hasFile', function () {
    let fileCache;
    let tmpPath;

    beforeEach(function () {
        delete process.env.CACHE_PATH;
        tmpPath = join(tmpdir(), `fc-hasfile-test-${Date.now()}`);
        fileCache = new FileCache('test', {tmpPath});
    });

    afterEach(async function () {
        await fileCache.emptyCurrentCacheDir();
        rmSync(tmpPath, {recursive: true, force: true});
    });

    it('Returns true for existing tmp file', async function () {
        await fileCache.writeTmpFile({a: 1}, 'check-me');
        assert.equal(fileCache.hasFile('check-me.json', 'tmp'), true);
    });

    it('Returns false for non-existing tmp file', function () {
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions
        assert.equal(fileCache.hasFile('nope.json', 'tmp'), false);
    });

    it('Works with json type', async function () {
        // json dir is same as zip dir
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions
        assert.equal(fileCache.hasFile('ghost-import.json', 'json'), false);
    });

    it('Works with image type', function () {
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions
        assert.equal(fileCache.hasFile('photo.jpg', 'image'), false);
    });

    it('Works with zip type', function () {
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions
        assert.equal(fileCache.hasFile('archive.zip', 'zip'), false);
    });

    it('Throws NotFoundError for invalid type', function () {
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions
        assert.throws(() => {
            fileCache.hasFile('test.txt', 'invalid');
        }, {message: 'Unknown file type'});
    });

    it('Checks raw path when no type is provided', function () {
        const filePath = join(tmpPath, 'raw-check.txt');
        mkdirSync(tmpPath, {recursive: true});
        writeFileSync(filePath, 'content');

        assert.equal(fileCache.hasFile(filePath), true);
        assert.equal(fileCache.hasFile(join(tmpPath, 'nope.txt')), false);
    });
});

describe('emptyCacheDir', function () {
    let fileCache;
    let tmpPath;

    beforeEach(function () {
        delete process.env.CACHE_PATH;
        tmpPath = join(tmpdir(), `fc-empty-test-${Date.now()}`);
        fileCache = new FileCache('test', {tmpPath});
    });

    afterEach(async function () {
        rmSync(tmpPath, {recursive: true, force: true});
    });

    it('Lists and deletes directories in the cache base dir', async function () {
        // Trigger cacheDir creation which creates the directory structure
        fileCache.cacheDir; // eslint-disable-line no-unused-expressions

        const result = await fileCache.emptyCacheDir();

        assert.ok(result.directory.endsWith('mg/'));
        assert.ok(Array.isArray(result.files));
        assert.ok(result.files.length >= 1); // at least the cache key dir
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
