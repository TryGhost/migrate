import {readZipEntries} from '../lib/read-zip.js';
import {execSync} from 'node:child_process';
import {unlink} from 'node:fs';
import {URL} from 'node:url';
import {join} from 'node:path';
const __dirname = new URL('.', import.meta.url).pathname;
const inputPath = join(__dirname, '/fixtures/read-zip/');
const inputZipPath = join(__dirname, '/fixtures/read-zip/posts.zip');

describe('Read Zip', function () {
    beforeAll(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: inputPath
        });
    });

    afterAll(function () {
        unlink(inputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });
    });

    it('Can read files in zip without extracting it', async function () {
        let zipEntries = await readZipEntries(inputZipPath);

        expect(zipEntries).toBeArrayOfSize(5);
        expect(zipEntries).toIncludeAllMembers([
            'posts/123402.podcast.html',
            'posts/123404.draft-text.html',
            'posts/123403.thread.html',
            'posts/123401.plain-text.html',
            'posts.csv'
        ]);
    });
});
