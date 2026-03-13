import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {URL} from 'node:url';
import {unlinkSync, existsSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import readZip, {contentStats} from '../lib/read-zip.js';

const __dirname = new URL('.', import.meta.url).pathname;

const inputPath = join(__dirname, '/fixtures/export/');
const inputZipPath = join(__dirname, '/fixtures/export.zip');
const inputZipWithSkipsPath = join(__dirname, '/fixtures/export-with-skips.zip');
const dirOfZipsPath = join(__dirname, '/fixtures/zip-dir/');

describe('contentStats', function () {
    before(function () {
        if (!existsSync(inputZipPath)) {
            execSync(`zip -r ${inputZipPath} *`, {cwd: inputPath});
        }
    });

    after(function () {
        if (existsSync(inputZipPath)) {
            unlinkSync(inputZipPath);
        }
    });

    it('Count posts & users', async function () {
        const stats = await contentStats(inputZipPath);

        for (const key of ['posts', 'users']) {
            assert.ok(key in stats);
        }
        assert.equal(stats.posts, 9);
        assert.equal(stats.users, 1);
    });
});

describe('readZip', function () {
    before(function () {
        // Create the main zip
        if (!existsSync(inputZipPath)) {
            execSync(`zip -r ${inputZipPath} *`, {cwd: inputPath});
        }

        // Create a zip with an extra HTML file at root level (to test skipped files)
        const tempDir = join(__dirname, '/fixtures/export-with-skips-src/');
        mkdirSync(join(tempDir, 'posts'), {recursive: true});
        mkdirSync(join(tempDir, 'profile'), {recursive: true});
        writeFileSync(join(tempDir, 'posts/test-post-abc123.html'), '<html><body>test</body></html>');
        writeFileSync(join(tempDir, 'profile/profile.html'), '<html><body>profile</body></html>');
        writeFileSync(join(tempDir, 'other.html'), '<html><body>skipped</body></html>');
        execSync(`zip -r ${inputZipWithSkipsPath} *`, {cwd: tempDir});
        rmSync(tempDir, {recursive: true});

        // Create a directory containing zip files (to test directory path)
        mkdirSync(dirOfZipsPath, {recursive: true});
        execSync(`cp ${inputZipPath} ${join(dirOfZipsPath, 'export.zip')}`);
    });

    after(function () {
        if (existsSync(inputZipPath)) {
            unlinkSync(inputZipPath);
        }
        if (existsSync(inputZipWithSkipsPath)) {
            unlinkSync(inputZipWithSkipsPath);
        }
        if (existsSync(dirOfZipsPath)) {
            rmSync(dirOfZipsPath, {recursive: true});
        }
    });

    it('Can read a zip file', function () {
        const content = readZip(inputZipPath, {});

        assert.ok(content.profiles);
        assert.ok(content.posts);
        assert.equal(content.profiles.length, 1);
        assert.equal(content.posts.length, 9);
        assert.ok(content.profiles[0].data.includes('User Name'));
        assert.ok(content.posts[0].name.startsWith('posts/'));
        assert.ok(content.posts[0].html.length > 0);
    });

    it('Can read a directory of zip files', function () {
        const content = readZip(dirOfZipsPath, {});

        assert.ok(content.posts.length > 0);
        assert.ok(content.profiles.length > 0);
    });

    it('Can skip non-post non-profile HTML files', function () {
        const content = readZip(inputZipWithSkipsPath, {});

        assert.equal(content.posts.length, 1);
        assert.equal(content.profiles.length, 1);
    });

    it('Can skip files with verbose logging', function () {
        const content = readZip(inputZipWithSkipsPath, {verbose: true});

        assert.equal(content.posts.length, 1);
        assert.equal(content.profiles.length, 1);
    });
});
