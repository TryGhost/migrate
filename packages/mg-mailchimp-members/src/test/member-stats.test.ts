import {URL} from 'node:url';
import {unlink} from 'node:fs';
import {execSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {join} from 'node:path';
import {memberStats} from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const inputPath = fixturesPath;
const inputZipPath = join(fixturesPath, 'stats.zip');

describe('Mailchimp member stats', () => {
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

    it('Can get stats for a single CSV', async () => {
        let stats = await memberStats({
            csvPath: join(fixturesPath, 'subscribed.csv')
        });

        assert.equal(stats.allMembers, 5);
    });

    it('Can get stats for a multiple CSVs', async () => {
        let stats = await memberStats({
            csvPath: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ]
        });

        assert.equal(stats.allMembers, 10);
    });

    it('Can get stats for a multiple CSVs, allowing unsubscribed', async () => {
        let stats = await memberStats({
            csvPath: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ],
            includeUnsubscribed: true
        });

        assert.equal(stats.allMembers, 15);
    });

    it('Can get stats for a single ZIP', async () => {
        let stats = await memberStats({
            zipPath: inputZipPath
        });

        assert.equal(stats.allMembers, 10);
    });
});
