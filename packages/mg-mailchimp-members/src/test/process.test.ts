import {URL} from 'node:url';
import {unlink} from 'node:fs';
import {execSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import processCsv from '../index.js';
import {processData} from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');
const inputPath = fixturesPath;
const inputZipPath = join(fixturesPath, 'export.zip');

describe('Mailchimp Members CSV', () => {
    it('Can parse single CSV', async () => {
        const cleanedProcessed = await processCsv({
            pathToCsv: join(fixturesPath, 'cleaned.csv')
        });

        assert.equal(cleanedProcessed.length, 5);
    });

    it('Can parse multiple CSVs', async () => {
        const cleanedProcessed = await processCsv({
            pathToCsv: [
                join(fixturesPath, 'cleaned.csv'),
                join(fixturesPath, 'subscribed.csv'),
                join(fixturesPath, 'unsubscribed.csv')
            ],
            includeUnsubscribed: true
        });

        assert.equal(cleanedProcessed.length, 15);
    });

    it('Can get subscribed member values', async () => {
        const processed = await processCsv({
            pathToCsv: join(fixturesPath, 'subscribed.csv')
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
            pathToCsv: join(fixturesPath, 'unsubscribed.csv'),
            includeUnsubscribed: true
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
            pathToCsv: [
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
        assert.equal(notSubscribed.length, 0);
    });

    it('Can add member label', async () => {
        const cleanedProcessed = await processCsv({
            pathToCsv: join(fixturesPath, 'cleaned.csv'),
            addLabel: 'Migrated Member, Old Site'
        });

        cleanedProcessed.forEach((member) => {
            assert.equal(member.labels[0], 'Migrated Member');
            assert.equal(member.labels[1], 'Old Site');
        });
    });

    it('Can exclude unsubscribed members', async () => {
        const cleanedProcessed = await processCsv({
            pathToCsv: [
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

    it('Different email key 1', async () => {
        let yo = `Email Address,First Name,Last Name
        c1@example.com,Dolor,`;

        const cleanedProcessed = await processData({
            csvContent: yo,
            includeUnsubscribed: false
        });

        assert.equal(cleanedProcessed.length, 1);
        assert.equal(cleanedProcessed[0].email, 'c1@example.com');
    });

    it('Different email key 2', async () => {
        let yo = `Deine E-Mail Adresse,First Name,Last Name
        c1@example.com,Dolor,`;

        const cleanedProcessed = await processData({
            csvContent: yo,
            includeUnsubscribed: false
        });

        assert.equal(cleanedProcessed.length, 1);
        assert.equal(cleanedProcessed[0].email, 'c1@example.com');
    });
});

describe('Mailchimp Members ZIP', () => {
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

    it('Can parse single ZIP', async () => {
        const cleanedProcessed = await processCsv({
            pathToZip: join(fixturesPath, 'export.zip')
        });

        assert.equal(cleanedProcessed.length, 10);
    });
});
