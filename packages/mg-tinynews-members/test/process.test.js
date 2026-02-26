import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import {join} from 'node:path';
import process from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;

const expectedKeys = ['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails'];

describe('Normalizes and processes Tiny News members', function () {
    it('Can create a correctly formatted object (format 1)', async function () {
        const result = await process({
            options: {
                pathToFile: join(__dirname, '/fixtures/subs-v1.csv')
            }
        });

        assert.equal(result.length, 3);

        for (const key of expectedKeys) {
            assert.ok(key in result[0]);
        }
        assert.equal(result[0].email, 'lorem@example.com');
        assert.equal(result[0].name, 'Lorem Ipsum');
        assert.equal(result[0].complimentary_plan, false);
        assert.equal(result[0].created_at, '2022-10-28T22:18:42.000Z');
        assert.equal(result[0].subscribed_to_emails, true);
        assert.equal(result[0].labels.length, 1);
        assert.equal(result[0].labels[0], 'tinynews');

        for (const key of expectedKeys) {
            assert.ok(key in result[1]);
        }
        assert.equal(result[1].email, 'dolor@example.com');
        assert.equal(result[1].name, 'Dolor Simet');
        assert.equal(result[1].complimentary_plan, false);
        assert.equal(result[1].created_at, '2022-10-26T18:56:45.000Z');
        assert.equal(result[1].subscribed_to_emails, false);
        assert.equal(result[1].labels.length, 4);
        assert.equal(result[1].labels[0], 'tinynews');
        assert.equal(result[1].labels[1], 'Multiple Tags');
        assert.equal(result[1].labels[2], 'Example');
        assert.equal(result[1].labels[3], 'More tags');

        for (const key of expectedKeys) {
            assert.ok(key in result[2]);
        }
        assert.equal(result[2].email, 'nosub@example.com');
        assert.equal(result[2].name, 'Not Subscribed');
        assert.equal(result[2].complimentary_plan, false);
        assert.equal(result[2].created_at, '2022-10-26T18:56:45.000Z');
        assert.equal(result[2].subscribed_to_emails, false);
        assert.equal(result[2].labels.length, 4);
        assert.equal(result[2].labels[0], 'tinynews');
        assert.equal(result[2].labels[1], 'Lorem');
        assert.equal(result[2].labels[2], 'Ipsum Dolor');
        assert.equal(result[2].labels[3], 'Simet');
    });

    it('Can create a correctly formatted object (format 2)', async function () {
        const result = await process({
            options: {
                pathToFile: join(__dirname, '/fixtures/subs-v2.csv')
            }
        });

        assert.equal(result.length, 2);

        for (const key of expectedKeys) {
            assert.ok(key in result[0]);
        }
        assert.equal(result[0].email, 'lorem@example.com');
        assert.equal(result[0].name, 'NoSub Ipsum');
        assert.equal(result[0].complimentary_plan, false);
        assert.equal(result[0].created_at, '2022-09-07T02:17:47.000Z');
        assert.equal(result[0].subscribed_to_emails, false);
        assert.equal(result[0].labels.length, 1);
        assert.equal(result[0].labels[0], 'tinynews');

        for (const key of expectedKeys) {
            assert.ok(key in result[1]);
        }
        assert.equal(result[1].email, 'dolor@example.com');
        assert.equal(result[1].name, 'Dolor Simet');
        assert.equal(result[1].complimentary_plan, false);
        assert.equal(result[1].created_at, '2022-08-04T14:26:20.000Z');
        assert.equal(result[1].subscribed_to_emails, true);
        assert.equal(result[1].labels.length, 1);
        assert.equal(result[1].labels[0], 'tinynews');
    });
});
