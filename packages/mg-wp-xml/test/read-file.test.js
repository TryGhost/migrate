import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {join} from 'node:path';
import {readFile, readFolder, detectType} from '../lib/read-file.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Read file', function () {
    it('Can detect a file', async function () {
        const type = await detectType(join(__dirname, 'fixtures/sample.xml'));
        assert.equal(type, 'file');
    });

    it('Can detect a folder', async function () {
        const type = await detectType(join(__dirname, 'fixtures/multiple'));
        assert.equal(type, 'folder');
    });

    it('Can read single XML file', async function () {
        const result = await readFile(join(__dirname, 'fixtures/sample.xml'));

        assert.equal(result.match(/<wp:category>/g).length, 1);
        assert.equal(result.match(/<wp:author>/g).length, 2);
        assert.equal(result.match(/<item>/g).length, 6);
    });

    it('Can read folder of XML files', async function () {
        const result = await readFolder(join(__dirname, 'fixtures/multiple'));

        assert.equal(result.match(/<wp:category>/g).length, 1);
        assert.equal(result.match(/<wp:author>/g).length, 2);
        assert.equal(result.match(/<item>/g).length, 6);
    });
});
