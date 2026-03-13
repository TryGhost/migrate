import assert from 'node:assert/strict';
import {describe, it, before, after, afterEach, mock} from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zip from '../lib/zip.js';

describe('Zip', function () {
    let fakeEntries = [];

    before(function () {
        mock.method(zip._private, 'openZipForRead', () => {
            return {
                getEntries: function getEntries() {
                    return fakeEntries;
                }
            };
        });
    });

    after(function () {
        mock.restoreAll();
    });

    it('Reads a simple file list', function () {
        let entryCallbackSpy = mock.fn();

        fakeEntries = [
            {isDirectory: false, entryName: 'file1.html'},
            {isDirectory: false, entryName: 'file2.html'},
            {isDirectory: false, entryName: 'file3.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        assert.equal(entryCallbackSpy.mock.callCount(), 3);
        assert.equal(entryCallbackSpy.mock.calls[0].arguments[0], 'file1.html');
        assert.equal(entryCallbackSpy.mock.calls[1].arguments[0], 'file2.html');
        assert.equal(entryCallbackSpy.mock.calls[2].arguments[0], 'file3.html');
    });

    it('Flattens a single top level directory', function () {
        let entryCallbackSpy = mock.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'test-folder/random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        assert.equal(entryCallbackSpy.mock.callCount(), 2);

        assert.equal(entryCallbackSpy.mock.calls[0].arguments[0], 'file1.html');
        assert.equal(entryCallbackSpy.mock.calls[1].arguments[0], 'random.js');
    });

    it('Skips a single top level directory if there are other files', function () {
        let entryCallbackSpy = mock.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        assert.equal(entryCallbackSpy.mock.callCount(), 3);

        assert.equal(entryCallbackSpy.mock.calls[0].arguments[0], 'test-folder/');
        assert.equal(entryCallbackSpy.mock.calls[1].arguments[0], 'test-folder/file1.html');
        assert.equal(entryCallbackSpy.mock.calls[2].arguments[0], 'random.js');
    });

    it('Keeps multiple directories', function () {
        let entryCallbackSpy = mock.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'posts/'},
            {isDirectory: false, entryName: 'posts/file1.html'},
            {isDirectory: false, entryName: 'posts/file2.html'},
            {isDirectory: true, entryName: 'profile/'},
            {isDirectory: false, entryName: 'profile/profile.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        assert.equal(entryCallbackSpy.mock.callCount(), 5);

        assert.equal(entryCallbackSpy.mock.calls[0].arguments[0], 'posts/');
        assert.equal(entryCallbackSpy.mock.calls[1].arguments[0], 'posts/file1.html');
        assert.equal(entryCallbackSpy.mock.calls[2].arguments[0], 'posts/file2.html');
        assert.equal(entryCallbackSpy.mock.calls[3].arguments[0], 'profile/');
        assert.equal(entryCallbackSpy.mock.calls[4].arguments[0], 'profile/profile.html');
    });
});

describe('Zip read error handling', function () {
    it('Throws InternalServerError when zip file is invalid', function () {
        assert.throws(
            () => zip.read('/nonexistent/bad.zip', () => {}),
            (err) => {
                assert.ok(err.message.includes('Unable to read zip file'));
                return true;
            }
        );
    });
});

describe('Zip write', function () {
    let tmpDir;

    afterEach(function () {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    it('Writes a zip file with a given filename', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
        const contentDir = path.join(tmpDir, 'content');
        fs.mkdirSync(contentDir);
        fs.writeFileSync(path.join(contentDir, 'test.txt'), 'hello');

        const outputDir = path.join(tmpDir, 'output');
        const result = await zip.write(outputDir, contentDir, 'test.zip');

        assert.equal(result.path, path.join(outputDir, 'test.zip'));
        assert.ok(fs.existsSync(result.path));
    });

    it('Generates a filename when none is provided', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-test-'));
        const contentDir = path.join(tmpDir, 'content');
        fs.mkdirSync(contentDir);
        fs.writeFileSync(path.join(contentDir, 'test.txt'), 'hello');

        const outputDir = path.join(tmpDir, 'output');
        const result = await zip.write(outputDir, contentDir);

        assert.ok(result.path.includes('ghost-import-'));
        assert.ok(result.path.endsWith('.zip'));
        assert.ok(fs.existsSync(result.path));
    });
});

describe('Zip deleteFile', function () {
    it('Deletes a file', async function () {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-del-'));
        const filePath = path.join(tmpDir, 'to-delete.txt');
        fs.writeFileSync(filePath, 'delete me');

        assert.ok(fs.existsSync(filePath));

        await zip.deleteFile(filePath);

        assert.ok(!fs.existsSync(filePath));
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });

    it('Creates and deletes a file that does not yet exist', async function () {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zip-del-'));
        const filePath = path.join(tmpDir, 'nonexistent.txt');

        assert.ok(!fs.existsSync(filePath));

        await zip.deleteFile(filePath);

        assert.ok(!fs.existsSync(filePath));
        fs.rmSync(tmpDir, {recursive: true, force: true});
    });
});
