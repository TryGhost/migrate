import {join} from 'node:path';
import {memberStats} from '../index.js';
import errors from '@tryghost/errors';
import {getError} from './lib/no-error-thrown-error.js';
const __dirname = new URL('.', import.meta.url).pathname;

describe('Substack member CSV stats', function () {
    test('Count members with active subscriptions', async function () {
        const allMembers = join(__dirname, '/fixtures/fixtures_signup_emails.csv');

        const stats = await memberStats({csvPath: allMembers});

        expect(stats.allMembers).toBe(21);
        expect(stats.hasSubscription).toBe(16);
        expect(stats.noSubscription).toBe(5);
    });

    test('Throws if no path provided', async function () {
        const error = await getError(async () => await memberStats());
        expect(error).toBeInstanceOf(errors.BadRequestError);
    });

    test('Throws if file cannot be found', async function () {
        const error = await getError(async () => await memberStats({csvPath: 'not-a-file.csv'}));
        expect(error).toBeInstanceOf(errors.BadRequestError);
    });

    test('Throws if not a valid CSV file', async function () {
        const invalidCSV = join(__dirname, '/fixtures/invalid.csv');
        const error = await getError(async () => await memberStats({csvPath: invalidCSV}));
        expect(error).toBeInstanceOf(errors.BadRequestError);
    });
});
