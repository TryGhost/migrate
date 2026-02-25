import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {readZipEntries} from '../lib/read-zip.js';
import {execSync} from 'node:child_process';
import {unlink} from 'node:fs';
import {URL} from 'node:url';
import {join} from 'node:path';
const __dirname = new URL('.', import.meta.url).pathname;
const inputPath = join(__dirname, '/fixtures/read-zip/');
const inputZipPath = join(__dirname, '/fixtures/posts.zip');
const doubleInputZipPath = join(__dirname, '/fixtures/posts-double.zip');

describe('Read Zip', function () {
    before(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: inputPath
        });

        execSync(`zip ${doubleInputZipPath} ${inputZipPath}`, {
            cwd: inputPath
        });
    });

    after(function () {
        unlink(inputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });

        unlink(doubleInputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });
    });

    it('Can read files in zip without extracting it', async function () {
        let zipEntries = await readZipEntries(inputZipPath);

        assert.ok(Array.isArray(zipEntries));
        assert.equal(zipEntries.length, 5);
        for (const member of [
            'posts/123402.podcast.html',
            'posts/123404.draft-text.html',
            'posts/123403.thread.html',
            'posts/123401.plain-text.html',
            'posts.csv'
        ]) {
            assert.ok(zipEntries.includes(member));
        }
    });

    it('Can read nested zips', async function () {
        let zipEntries = await readZipEntries(doubleInputZipPath);

        assert.ok(Array.isArray(zipEntries));
        assert.equal(zipEntries.length, 5);
        for (const member of [
            'posts/123402.podcast.html',
            'posts/123404.draft-text.html',
            'posts/123403.thread.html',
            'posts/123401.plain-text.html',
            'posts.csv'
        ]) {
            assert.ok(zipEntries.includes(member));
        }
    });
});
