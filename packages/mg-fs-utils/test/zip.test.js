// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

// Require the zip module
const zip = require('../lib/zip');

describe('Read Zip', function () {
    let fakeEntries = [];

    before(function () {
        sinon.stub(zip._private, 'openZipForRead').callsFake(() => {
            return {
                getEntries: function getEntries() {
                    return fakeEntries;
                }
            };
        });
    });

    after(function () {
        sinon.restore();
    });

    it('Reads a simple file list', function () {
        let entryCallbackSpy = sinon.spy();

        fakeEntries = [
            {isDirectory: false, entryName: 'file1.html'},
            {isDirectory: false, entryName: 'file2.html'},
            {isDirectory: false, entryName: 'file3.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        entryCallbackSpy.callCount.should.eql(3);
        entryCallbackSpy.getCall(0).args[0].should.eql('file1.html');
        entryCallbackSpy.getCall(1).args[0].should.eql('file2.html');
        entryCallbackSpy.getCall(2).args[0].should.eql('file3.html');
    });

    it('Flattens a single top level directory', function () {
        let entryCallbackSpy = sinon.spy();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'test-folder/random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        entryCallbackSpy.callCount.should.eql(2);

        entryCallbackSpy.getCall(0).args[0].should.eql('file1.html');
        entryCallbackSpy.getCall(1).args[0].should.eql('random.js');
    });

    it('Skips a single top level directory if there are other files', function () {
        let entryCallbackSpy = sinon.spy();

        fakeEntries = [
            {isDirectory: true, entryName: 'test-folder/'},
            {isDirectory: false, entryName: 'test-folder/file1.html'},
            {isDirectory: false, entryName: 'random.js'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        entryCallbackSpy.callCount.should.eql(3);

        entryCallbackSpy.getCall(0).args[0].should.eql('test-folder/');
        entryCallbackSpy.getCall(1).args[0].should.eql('test-folder/file1.html');
        entryCallbackSpy.getCall(2).args[0].should.eql('random.js');
    });

    it('Keeps multiple directories', function () {
        let entryCallbackSpy = sinon.spy();

        fakeEntries = [
            {isDirectory: true, entryName: 'posts/'},
            {isDirectory: false, entryName: 'posts/file1.html'},
            {isDirectory: false, entryName: 'posts/file2.html'},
            {isDirectory: true, entryName: 'profile/'},
            {isDirectory: false, entryName: 'profile/profile.html'}
        ];

        zip.read('testFilePath', entryCallbackSpy);

        entryCallbackSpy.callCount.should.eql(5);
        entryCallbackSpy.getCall(0).args[0].should.eql('posts/');
        entryCallbackSpy.getCall(1).args[0].should.eql('posts/file1.html');
        entryCallbackSpy.getCall(2).args[0].should.eql('posts/file2.html');
        entryCallbackSpy.getCall(3).args[0].should.eql('profile/');
        entryCallbackSpy.getCall(4).args[0].should.eql('profile/profile.html');
    });
});
