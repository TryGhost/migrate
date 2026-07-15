import {URL} from 'node:url';
import {readdirSync, unlink} from 'node:fs';
import {execFileSync} from 'node:child_process';
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
        // Zip the fixture files without going through a shell: list the entries
        // explicitly (excluding dotfiles, to match shell `*` glob behaviour) and
        // pass them as an arguments array so no path is interpolated into a command.
        const filesToZip = readdirSync(inputPath).filter(name => !name.startsWith('.'));
        execFileSync('zip', ['-r', inputZipPath, ...filesToZip], {
            cwd: inputPath
        });
    });

    after(function () {
        unlink(inputZipPath, err => {
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
