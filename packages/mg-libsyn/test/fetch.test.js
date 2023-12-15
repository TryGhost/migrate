import path from 'node:path';
import {promises as fs} from 'node:fs';
import {rssToJson} from '../lib/fetch.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = async (name) => {
    let fixtureFileName = path.join(__dirname, './', 'fixtures', name);
    return fs.readFile(fixtureFileName, {encoding: 'utf8'});
};

describe('rssToJson', function () {
    test('Correctly converts XML to JSON', async function () {
        const xmlFixture = await readSync('feed.xml');
        const jsonFile = await readSync('feed.json');
        const jsonFixture = JSON.parse(jsonFile);

        const converted = rssToJson(xmlFixture);

        expect(converted).toEqual(jsonFixture);
    });
});
