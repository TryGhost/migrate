import assert from 'node:assert/strict';
import {describe, it, before, after, mock} from 'node:test';
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
