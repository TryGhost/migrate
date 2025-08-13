import {URL} from 'node:url';
import {unlink} from 'node:fs';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import mapper, {contentStats, readZip} from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const inputZipPath = join(__dirname, '/export.zip');

describe('Buttondown Zip Reader', () => {
    beforeAll(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: fixturesPath
        });
    });

    afterAll(function () {
        unlink(inputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });
    });

    it('Reads ZIP and gets stats', async function () {
        const stats = await contentStats(inputZipPath);
        assert.equal(stats.posts, 2);
    });

    it('Reads ZIP and combine contents', async function () {
        const data = await readZip(inputZipPath);
        assert.equal(data.json.length, 2);
        assert.equal(data.json[0].subject, 'This is a Plain Post');
        assert.equal(data.json[0].slug, 'plain-post');
        assert.equal(data.posts.length, 2);
        assert.equal(data.posts[0].name, 'plain-post.md');
    });

    it('Reads ZIP and maps', async function () {
        const data: any = await mapper({
            options: {
                url: 'https://example.com',
                pathToZip: inputZipPath
            }
        });

        assert.equal(data.posts.length, 2);
        assert.equal(data.posts[0].url, 'https://example.com/plain-post');
    });
});
