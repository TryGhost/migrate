import {URL} from 'node:url';
import {unlink} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import {contentStats} from '../lib/read-zip.js';

const __dirname = new URL('.', import.meta.url).pathname;

const inputPath = join(__dirname, '/fixtures/export/');
const inputZipPath = join(__dirname, '/fixtures/export.zip');

describe('contentStats', function () {
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

    it('Count posts & users', async function () {
        const stats = await contentStats(inputZipPath);

        expect(stats).toContainAllKeys(['posts', 'users']);
        expect(stats.posts).toEqual(7);
        expect(stats.users).toEqual(1);
    });
});

