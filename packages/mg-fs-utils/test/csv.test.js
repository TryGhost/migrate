const path = require('path');
const {parseISO} = require('date-fns');

// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

// Require the csv module
const csv = require('../lib/csv');

describe('Parse CSV', function () {
    it('Reads a simple comma separated file list with default options', async function () {
        const pathToFile = path.resolve('./test/fixtures/example.csv');

        const result = await csv.parse(pathToFile);

        result.should.have.length(5);

        const [row] = result;
        row.should.be.an.object;
        row.should.deepEqual({
            Username: 'booker12',
            Identifier: '9012',
            'One-time password': '12se74',
            'Recovery code': 'rb9012',
            'First name': 'Rachel',
            'Last name': 'Booker',
            Department: 'Sales',
            Location: 'Manchester'
        });
    });

    it('Reads a simple comma separated file list with options', async function () {
        const pathToFile = path.resolve('./test/fixtures/example.csv');

        const result = await csv.parse(pathToFile, {skip_lines_with_error: true, columns: false, skip_empty_lines: false});

        result.should.have.length(6);

        const [row] = result;
        row.should.be.an.array;
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
            }
        ];
        const fields = ['email', 'subscribed_to_emails', 'complimentary_plan', 'stripe_customer_id', 'created_at', 'labels', 'note'];

        const result = await csv.jsonToCSV(jsonInput, fields);

        result.should.be.a.String;
        result.should.match(/email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,labels,note\r\npatrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,substack-free,\r\nelpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,substack-free,\r\n/);

        const resultArray = result.split(',');
        resultArray.should.have.length(19);
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

        result.should.be.a.String;
        result.should.match(/email,subscribed_to_emails,complimentary_plan,stripe_customer_id,created_at,expiry,type,labels\r\npatrickstarfish@gmail.com,true,false,,2018-12-25T20:43:22.178Z,,free,substack-free\r\nelpaper@gmail.com,true,false,,2019-08-18T13:36:31.230Z,,free,substack-free\r\n/);

        const resultArray = result.split(',');
        resultArray.should.have.length(22);
    });
});
