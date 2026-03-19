import {URL} from 'node:url';
import {unlink, mkdirSync, writeFileSync, copyFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {join} from 'node:path';
import {execSync} from 'node:child_process';
import mapper, {contentStats, readZip} from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const inputZipPath = join(__dirname, '/export.zip');
const csvZipPath = join(__dirname, '/export-csv.zip');
const csvFixturesPath = join(__dirname, '/csv-fixtures');

describe('Buttondown Zip Reader', () => {
    before(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: fixturesPath
        });

        mkdirSync(join(csvFixturesPath, 'emails'), {recursive: true});
        copyFileSync(join(fixturesPath, 'emails/plain-post.md'), join(csvFixturesPath, 'emails/plain-post.md'));
        copyFileSync(join(fixturesPath, 'emails/fancy-post.md'), join(csvFixturesPath, 'emails/fancy-post.md'));
        copyFileSync(join(fixturesPath, 'emails.csv'), join(csvFixturesPath, 'emails.csv'));
        execSync(`zip -r ${csvZipPath} *`, {
            cwd: csvFixturesPath
        });
    });

    after(function () {
        unlink(inputZipPath, () => {});
        unlink(csvZipPath, () => {});
        execSync(`rm -rf ${csvFixturesPath}`);
    });

    it('Reads ZIP and gets stats', async function () {
        const stats = await contentStats(inputZipPath);
        assert.equal(stats.posts, 2);
    });

    it('Reads ZIP and combine contents', async function () {
        const data = await readZip(inputZipPath);
        assert.equal(data.json.length, 2);
        assert.equal(data.json[0].subject, 'This is a Fancy Post');
        assert.equal(data.json[0].slug, 'fancy-post');
        assert.equal(data.posts.length, 2);
        assert.equal(data.posts[0].name, 'fancy-post.md');
    });

    it('Reads ZIP and maps', async function () {
        const data: any = await mapper({
            options: {
                url: 'https://example.com',
                pathToZip: inputZipPath
            }
        });

        assert.equal(data.posts.length, 2);
        assert.equal(data.posts[0].url, 'https://example.com/fancy-post');
    });

    it('Reads ZIP with emails.csv instead of emails.json', async function () {
        const data = await readZip(csvZipPath);
        assert.equal(data.json.length, 2);
        assert.equal(data.json[0].subject, 'This is a Fancy Post');
        assert.equal(data.json[0].slug, 'fancy-post');
        assert.equal(data.posts.length, 2);
    });

    it('Reads CSV ZIP and maps correctly', async function () {
        const data: any = await mapper({
            options: {
                url: 'https://example.com',
                pathToZip: csvZipPath
            }
        });

        assert.equal(data.posts.length, 2);
        assert.equal(data.posts[0].url, 'https://example.com/fancy-post');
    });
});
