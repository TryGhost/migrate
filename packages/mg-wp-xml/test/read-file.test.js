import {join} from 'node:path';
import {readFile, readFolder, detectType} from '../lib/read-file.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Read file', function () {
    test('Can detect a file', async function () {
        const type = await detectType(join(__dirname, 'fixtures/sample.xml'));
        expect(type).toBe('file');
    });

    test('Can detect a folder', async function () {
        const type = await detectType(join(__dirname, 'fixtures/multiple'));
        expect(type).toBe('folder');
    });

    test('Can read single XML file', async function () {
        const result = await readFile(join(__dirname, 'fixtures/sample.xml'));

        expect(result.match(/<wp:category>/g).length).toBe(1);
        expect(result.match(/<wp:author>/g).length).toBe(2);
        expect(result.match(/<item>/g).length).toBe(6);
    });

    test('Can read folder of XML files', async function () {
        const result = await readFolder(join(__dirname, 'fixtures/multiple'));

        expect(result.match(/<wp:category>/g).length).toBe(1);
        expect(result.match(/<wp:author>/g).length).toBe(2);
        expect(result.match(/<item>/g).length).toBe(6);
    });
});
