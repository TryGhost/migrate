import {URL} from 'node:url';
import {join} from 'node:path';
import process from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Normalizes and processes Tiny News members', function () {
    test('Can create a correctly formatted object (format 1)', async function () {
        const result = await process({
            options: {
                pathToFile: join(__dirname, '/fixtures/subs-v1.csv')
            }
        });

        expect(result).toBeArrayOfSize(3);

        expect(result[0]).toContainAllKeys(['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails']);
        expect(result[0].email).toEqual('lorem@example.com');
        expect(result[0].name).toEqual('Lorem Ipsum');
        expect(result[0].complimentary_plan).toEqual(false);
        expect(result[0].created_at).toEqual(new Date('2022-10-28T21:18:42.000Z'));
        expect(result[0].subscribed_to_emails).toEqual(true);
        expect(result[0].labels).toBeArrayOfSize(1);
        expect(result[0].labels[0]).toEqual('tinynews');

        expect(result[1]).toContainAllKeys(['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails']);
        expect(result[1].email).toEqual('dolor@example.com');
        expect(result[1].name).toEqual('Dolor Simet');
        expect(result[1].complimentary_plan).toEqual(false);
        expect(result[1].created_at).toEqual(new Date('2022-10-26T17:56:45.000Z'));
        expect(result[1].subscribed_to_emails).toEqual(false);
        expect(result[1].labels).toBeArrayOfSize(4);
        expect(result[1].labels[0]).toEqual('tinynews');
        expect(result[1].labels[1]).toEqual('Multiple Tags');
        expect(result[1].labels[2]).toEqual('Example');
        expect(result[1].labels[3]).toEqual('More tags');

        expect(result[2]).toContainAllKeys(['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails']);
        expect(result[2].email).toEqual('nosub@example.com');
        expect(result[2].name).toEqual('Not Subscribed');
        expect(result[2].complimentary_plan).toEqual(false);
        expect(result[2].created_at).toEqual(new Date('2022-10-26T17:56:45.000Z'));
        expect(result[2].subscribed_to_emails).toEqual(false);
        expect(result[2].labels).toBeArrayOfSize(4);
        expect(result[2].labels[0]).toEqual('tinynews');
        expect(result[2].labels[1]).toEqual('Lorem');
        expect(result[2].labels[2]).toEqual('Ipsum Dolor');
        expect(result[2].labels[3]).toEqual('Simet');
    });

    test('Can create a correctly formatted object (format 2)', async function () {
        const result = await process({
            options: {
                pathToFile: join(__dirname, '/fixtures/subs-v2.csv')
            }
        });

        expect(result).toBeArrayOfSize(2);

        expect(result[0]).toContainAllKeys(['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails']);
        expect(result[0].email).toEqual('lorem@example.com');
        expect(result[0].name).toEqual('NoSub Ipsum');
        expect(result[0].complimentary_plan).toEqual(false);
        expect(result[0].created_at).toEqual(new Date('2022-09-07T02:17:47.000Z'));
        expect(result[0].subscribed_to_emails).toEqual(false);
        expect(result[0].labels).toBeArrayOfSize(1);
        expect(result[0].labels[0]).toEqual('tinynews');

        expect(result[1]).toContainAllKeys(['email', 'name', 'complimentary_plan', 'created_at', 'labels', 'subscribed_to_emails']);
        expect(result[1].email).toEqual('dolor@example.com');
        expect(result[1].name).toEqual('Dolor Simet');
        expect(result[1].complimentary_plan).toEqual(false);
        expect(result[1].created_at).toEqual(new Date('2022-08-04T14:26:20.000Z'));
        expect(result[1].subscribed_to_emails).toEqual(true);
        expect(result[1].labels).toBeArrayOfSize(1);
        expect(result[1].labels[0]).toEqual('tinynews');
    });
});

