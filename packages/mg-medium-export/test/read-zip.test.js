import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {URL} from 'node:url';
import {unlink} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import {contentStats} from '../lib/read-zip.js';

const __dirname = new URL('.', import.meta.url).pathname;

const inputPath = join(__dirname, '/fixtures/export/');
const inputZipPath = join(__dirname, '/fixtures/export.zip');

describe('contentStats', function () {
    before(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: inputPath
        });
    });

    after(function () {
        unlink(inputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });
    });

    it('Count posts & users', async function () {
        const stats = await contentStats(inputZipPath);

        for (const key of ['posts', 'users']) {
            assert.ok(key in stats);
        }
        assert.equal(stats.posts, 7);
        assert.equal(stats.users, 1);
    });
});
