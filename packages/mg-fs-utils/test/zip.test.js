import {jest} from '@jest/globals';
import zip from '../lib/zip.js';

describe('Zip', function () {
    let fakeEntries = [];

    beforeAll(function () {
        jest.spyOn(zip._private, 'openZipForRead').mockImplementation(() => {
            return {
                getEntries: function getEntries() {
                    return fakeEntries;
                }
            };
        });
    });

    afterAll(function () {
        jest.restoreAllMocks();
    });

    test('Reads a simple file list', function () {
        let entryCallbackSpy = jest.fn();

        fakeEntries = [
            {isDirectory: false, entryName: 'file1.html'},
            {isDirectory: false, entryName: 'file2.html'},
            {isDirectory: false, entryName: 'file3.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        expect(entryCallbackSpy).toHaveBeenCalledTimes(3);
        expect(entryCallbackSpy.mock.calls[0][0]).toEqual('file1.html');
        expect(entryCallbackSpy.mock.calls[1][0]).toEqual('file2.html');
        expect(entryCallbackSpy.mock.calls[2][0]).toEqual('file3.html');
    });

    test('Flattens a single top level directory', function () {
        let entryCallbackSpy = jest.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'test-folder/random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        expect(entryCallbackSpy).toHaveBeenCalledTimes(2);

        expect(entryCallbackSpy.mock.calls[0][0]).toEqual('file1.html');
        expect(entryCallbackSpy.mock.calls[1][0]).toEqual('random.js');
    });

    test('Skips a single top level directory if there are other files', function () {
        let entryCallbackSpy = jest.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        expect(entryCallbackSpy).toHaveBeenCalledTimes(3);

        expect(entryCallbackSpy.mock.calls[0][0]).toEqual('test-folder/');
        expect(entryCallbackSpy.mock.calls[1][0]).toEqual('test-folder/file1.html');
        expect(entryCallbackSpy.mock.calls[2][0]).toEqual('random.js');
    });

    test('Keeps multiple directories', function () {
        let entryCallbackSpy = jest.fn();

        fakeEntries = [
            {isDirectory: true, entryName: 'posts/'},
            {isDirectory: false, entryName: 'posts/file1.html'},
            {isDirectory: false, entryName: 'posts/file2.html'},
            {isDirectory: true, entryName: 'profile/'},
            {isDirectory: false, entryName: 'profile/profile.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        expect(entryCallbackSpy).toHaveBeenCalledTimes(5);

        expect(entryCallbackSpy.mock.calls[0][0]).toEqual('posts/');
        expect(entryCallbackSpy.mock.calls[1][0]).toEqual('posts/file1.html');
        expect(entryCallbackSpy.mock.calls[2][0]).toEqual('posts/file2.html');
        expect(entryCallbackSpy.mock.calls[3][0]).toEqual('profile/');
        expect(entryCallbackSpy.mock.calls[4][0]).toEqual('profile/profile.html');
    });
});
