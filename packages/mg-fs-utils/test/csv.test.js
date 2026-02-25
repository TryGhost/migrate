import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import path from 'node:path';
import csv from '../lib/csv.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Parse CSV', function () {
    it('Reads a simple comma separated file list with default options', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');

        const result = await csv.parseCSV(pathToFile);

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 5);

        const [row] = result;
        assert.equal(typeof row, 'object');

        for (const [k, v] of [
            ['Username', 'booker12'],
            ['Identifier', '9012'],
            ['One-time password', '12se74'],
            ['Recovery code', 'rb9012'],
            ['First name', 'Rachel'],
            ['Last name', 'Booker'],
            ['Department', 'Sales'],
            ['Location', 'Manchester']
        ]) {
            assert.equal(row[k], v);
        }
    });

    it('Reads a simple comma separated file list with options', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');

        const result = await csv.parseCSV(pathToFile, {skip_lines_with_error: true, columns: false, skip_empty_lines: true});

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 6);

        const [row] = result;
        assert.ok(Array.isArray(row));
    });
});

describe('Format JSON to CSV', function () {
    it('formats a JSON file into CSV', async function () {
        const jsonInput = [
            {
                email: 'patrickstarfish@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: new Date('2018-12-25T20:43:22.178Z'),
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            },
            {
                email: 'elpaper@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: new Date('2019-08-18T13:36:31.230Z'),
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            },
            {
                email: 'example@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: new Date('2022-03-13T13:36:31.230Z'),
                expiry: null,
                type: 'comp',
                labels: 'substack-comp, 2023-02'
            }
        ];
        const fields = ['email', 'subscribed_to_emails', 'complimentary_plan', 'stripe_customer_id', 'created_at', 'labels', 'note'];

        const result = await csv.jsonToCSV(jsonInput, fields);

        assert.equal(typeof result, 'string');
        assert.ok(result.includes('email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,labels,note'));
        assert.ok(result.includes('patrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,substack-free,'));
        assert.ok(result.includes('elpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,substack-free,'));
        assert.ok(result.includes('example@gmail.com,true,false,,2022-03-13T13:36:31.230Z,"substack-comp, 2023-02'));
    });

    it('can read column headers from data when fields not passed', async function () {
        const jsonInput = [
            {
                email: 'patrickstarfish@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: '2018-12-25T20:43:22.178Z',
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            },
            {
                email: 'elpaper@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: '2019-08-18T13:36:31.230Z',
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            }
        ];

        const result = await csv.jsonToCSV(jsonInput);

        assert.equal(typeof result, 'string');
        assert.ok(result.includes('email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,expiry,type,labels'));
        assert.ok(result.includes('patrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,,free,substack-free'));
        assert.ok(result.includes('elpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,,free,substack-free'));

        const resultArray = result.split(',');
        assert.ok(Array.isArray(resultArray));
        assert.equal(resultArray.length, 22);
    });
});

describe('hasKeys', function () {
    it('Returns true when CSV contains required columns', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');
        const csvIsValid = await csv.hasKeys({
            filePath: pathToFile,
            required: ['Username', 'Identifier', 'One-time password', 'Recovery code', 'First name', 'Last name', 'Department', 'Location']
        });

        assert.equal(csvIsValid, true);
    });

    it('Returns false when CSV is missing a required column', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');
        const csvIsValid = await csv.hasKeys({
            filePath: pathToFile,
            required: ['stripe_key']
        });

        assert.equal(csvIsValid, false);
    });

    it('Returns false when CSV is contains a specific column', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');
        const csvIsValid = await csv.hasKeys({
            filePath: pathToFile,
            blocked: ['Username']
        });

        assert.equal(csvIsValid, false);
    });
});
