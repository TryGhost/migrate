import assert from 'node:assert/strict';
import {join} from 'node:path';
import processCsv from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('Mailchimp Members', () => {
    it('Can parse single CSV', async () => {
        const cleanedProcessed = await processCsv({
            csvPath: join(fixturesPath, 'cleaned.csv')
        });

        assert.equal(cleanedProcessed.length, 5);
    });

    it('Can parse multiple CSVs', async () => {
        const cleanedProcessed = await processCsv({
            csvPath: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ]
        });

        assert.equal(cleanedProcessed.length, 15);
    });

    it('Can get subscribed member values', async () => {
        const processed = await processCsv({
            csvPath: join(fixturesPath, 'subscribed.csv')
        });

        const member = processed[4];

        assert.equal(member.email, 's5@example.com');
        assert.equal(member.name, 'Dolor Simet');
        assert.equal(member.note, null);
        assert.equal(member.subscribed_to_emails, true);
        assert.equal(member.stripe_customer_id, null);
        assert.equal(member.complimentary_plan, false);
        assert.equal(member.labels.length, 1);
        assert.equal(member.labels[0], 'Lorem Editors');
        assert.deepEqual(member.created_at, new Date('2018-02-05T19:28:22.000Z'));
    });

    it('Can get unsubscribed member values', async () => {
        const processed = await processCsv({
            csvPath: join(fixturesPath, 'unsubscribed.csv')
        });

        const member = processed[2];

        assert.equal(member.email, 'u3@example.com');
        assert.equal(member.name, 'Lorem Ipsum');
        assert.equal(member.note, 'Unsubscribed to emails on 2022-12-05 21:01:47');
        assert.equal(member.subscribed_to_emails, false);
        assert.equal(member.stripe_customer_id, null);
        assert.equal(member.complimentary_plan, false);
        assert.equal(member.labels.length, 2);
        assert.equal(member.labels[0], 'Lorem Editors');
        assert.equal(member.labels[1], 'mailchimp-unsubscribed');
        assert.deepEqual(member.created_at, new Date('2020-12-25T13:35:34.000Z'));
    });

    it('Can count subscribed members', async () => {
        const cleanedProcessed = await processCsv({
            csvPath: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ]
        });

        const isSubscribed = cleanedProcessed.filter((member) => {
            return member.subscribed_to_emails === true;
        });

        const notSubscribed = cleanedProcessed.filter((member) => {
            return member.subscribed_to_emails === false;
        });

        assert.equal(isSubscribed.length, 10);

        assert.equal(notSubscribed.length, 5);
        assert.equal(notSubscribed[0].note, 'Unsubscribed to emails on 2018-07-23 12:19:27');
    });

    it('Can add member label', async () => {
        const cleanedProcessed = await processCsv({
            csvPath: join(fixturesPath, 'cleaned.csv'),
            addLabel: 'Migrated Member, Old Site'
        });

        cleanedProcessed.forEach((member) => {
            assert.equal(member.labels[0], 'Migrated Member');
            assert.equal(member.labels[1], 'Old Site');
        });
    });

    it('Can exclude unsubscribed members', async () => {
        const cleanedProcessed = await processCsv({
            csvPath: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ],
            includeUnsubscribed: false
        });

        cleanedProcessed.forEach((member) => {
            assert.equal(member.subscribed_to_emails, true);
        });
    });
});
