/* eslint no-undef: 0 */
import path from 'node:path';
import {parseISO} from 'date-fns';
import csv from '../lib/csv.js';

describe('Parse CSV', function () {
    test('Reads a simple comma separated file list with default options', async function () {
        const pathToFile = path.resolve('./test/fixtures/example.csv');

        const result = await csv.parseCSV(pathToFile);

        expect(result).toBeArrayOfSize(5);

        const [row] = result;
        expect(row).toBeObject();

        expect(row).toContainEntries([
            ['Username', 'booker12'],
            ['Identifier', '9012'],
            ['One-time password', '12se74'],
            ['Recovery code', 'rb9012'],
            ['First name', 'Rachel'],
            ['Last name', 'Booker'],
            ['Department', 'Sales'],
            ['Location', 'Manchester']
        ]);
    });

    it('Reads a simple comma separated file list with options', async function () {
        const pathToFile = path.resolve('./test/fixtures/example.csv');

        const result = await csv.parseCSV(pathToFile, {skip_lines_with_error: true, columns: false, skip_empty_lines: true});

        expect(result).toBeArrayOfSize(6);

        const [row] = result;
        expect(row).toBeArray();
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
                created_at: parseISO('2018-12-25T20:43:22.178Z'),
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            },
            {
                email: 'elpaper@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: parseISO('2019-08-18T13:36:31.230Z'),
                expiry: null,
                type: 'free',
                labels: 'substack-free'
            },
            {
                email: 'example@gmail.com',
                subscribed_to_emails: true,
                complimentary_plan: false,
                stripe_customer_id: null,
                created_at: parseISO('2022-03-13T13:36:31.230Z'),
                expiry: null,
                type: 'comp',
                labels: 'substack-comp, 2023-02'
            }
        ];
        const fields = ['email', 'subscribed_to_emails', 'complimentary_plan', 'stripe_customer_id', 'created_at', 'labels', 'note'];

        const result = await csv.jsonToCSV(jsonInput, fields);

        expect(result).toBeString();
        expect(result).toInclude('email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,labels,note');
        expect(result).toInclude('patrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,substack-free,');
        expect(result).toInclude('elpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,substack-free,');
        expect(result).toInclude('example@gmail.com,true,false,,2022-03-13T13:36:31.230Z,"substack-comp, 2023-02');
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

        expect(result).toBeString();
        expect(result).toInclude('email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,expiry,type,labels');
        expect(result).toInclude('patrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,,free,substack-free');
        expect(result).toInclude('elpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,,free,substack-free');

        const resultArray = result.split(',');
        expect(resultArray).toBeArrayOfSize(22);
    });
});
