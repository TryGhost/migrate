import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {join} from 'node:path';
import {memberStats} from '../index.js';
import errors from '@tryghost/errors';
import {getError} from './lib/no-error-thrown-error.js';
const __dirname = new URL('.', import.meta.url).pathname;

describe('Substack member CSV stats', function () {
    it('Count members with active subscriptions', async function () {
        const allMembers = join(__dirname, '/fixtures/fixtures_signup_emails.csv');

        const stats = await memberStats({csvPath: allMembers});

        assert.equal(stats.allMembers, 21);
        assert.equal(stats.hasSubscription, 16);
        assert.equal(stats.noSubscription, 5);
    });

    it('Throws if no path provided', async function () {
        const error = await getError(async () => await memberStats());
        assert.ok(error instanceof errors.BadRequestError);
    });

    it('Throws if file cannot be found', async function () {
        const error = await getError(async () => await memberStats({csvPath: 'not-a-file.csv'}));
        assert.ok(error instanceof errors.BadRequestError);
    });

    it('Throws if not a valid CSV file', async function () {
        const invalidCSV = join(__dirname, '/fixtures/invalid.csv');
        const error = await getError(async () => await memberStats({csvPath: invalidCSV}));
        assert.ok(error instanceof errors.BadRequestError);
    });
});
