import assert from 'node:assert/strict';
import {describe, it, afterEach} from 'node:test';
import {URL} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
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

    it('Rejects when file does not exist', async function () {
        await assert.rejects(
            csv.parseCSV('/nonexistent/path/file.csv'),
            (err) => {
                assert.equal(err.code, 'ENOENT');
                return true;
            }
        );
    });

    it('Rejects when CSV has parse errors and skip_lines_with_error is false', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/malformed.csv');

        await assert.rejects(
            csv.parseCSV(pathToFile, {columns: true, skip_lines_with_error: false}),
            (err) => {
                assert.ok(err.message);
                return true;
            }
        );
    });
});

describe('Parse CSV string', function () {
    it('Parses a CSV string with default options', function () {
        const csvString = 'name,email\nAlice,alice@example.com\nBob,bob@example.com';

        const result = csv.parseString(csvString);

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 2);
        assert.equal(result[0].name, 'Alice');
        assert.equal(result[0].email, 'alice@example.com');
        assert.equal(result[1].name, 'Bob');
        assert.equal(result[1].email, 'bob@example.com');
    });

    it('Parses a CSV string with custom options', function () {
        const csvString = 'name,email\nAlice,alice@example.com\nBob,bob@example.com';

        const result = csv.parseString(csvString, {columns: false, skip_empty_lines: true});

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 3);
        assert.ok(Array.isArray(result[0]));
        assert.deepEqual(result[0], ['name', 'email']);
    });

    it('Handles empty lines', function () {
        const csvString = 'name,email\nAlice,alice@example.com\n\nBob,bob@example.com';

        const result = csv.parseString(csvString);

        assert.ok(Array.isArray(result));
        assert.equal(result.length, 2);
    });

    it('Trims whitespace from values', function () {
        const csvString = 'name,email\n  Alice  ,  alice@example.com  ';

        const result = csv.parseString(csvString);

        assert.equal(result[0].name, 'Alice');
        assert.equal(result[0].email, 'alice@example.com');
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

    it('returns empty string for null data', function () {
        const result = csv.jsonToCSV(null);
        assert.equal(result, '');
    });

    it('returns empty string for undefined data', function () {
        const result = csv.jsonToCSV(undefined);
        assert.equal(result, '');
    });

    it('returns header-only CSV for empty array', function () {
        const result = csv.jsonToCSV([]);
        assert.equal(result, '');
    });

    it('returns header-only CSV for empty array with explicit fields', function () {
        const result = csv.jsonToCSV([], ['email', 'name']);
        assert.equal(result, 'email,name\r\n');
    });

    it('returns empty string for non-array data', function () {
        const result = csv.jsonToCSV('not an array');
        assert.equal(result, '');
    });

    it('handles fields with undefined values', function () {
        const jsonInput = [
            {email: 'test@example.com', name: undefined}
        ];

        const result = csv.jsonToCSV(jsonInput, ['email', 'name']);

        assert.ok(result.includes('email,name'));
        assert.ok(result.includes('test@example.com,'));
    });

    it('handles field not present on entry', function () {
        const jsonInput = [
            {email: 'test@example.com'}
        ];

        const result = csv.jsonToCSV(jsonInput, ['email', 'name']);

        assert.ok(result.includes('email,name'));
        assert.ok(result.includes('test@example.com,'));
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

describe('writeCSV', function () {
    let tmpDir;

    afterEach(function () {
        if (tmpDir && fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, {recursive: true, force: true});
        }
    });

    it('Writes CSV data to a file with a given filename', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
        const data = 'email,name\r\ntest@example.com,Test\r\n';

        const outputPath = await csv.writeCSV(data, tmpDir, 'output.csv');

        assert.equal(outputPath, path.join(tmpDir, 'output.csv'));
        const written = fs.readFileSync(outputPath, 'utf8');
        assert.equal(written, data);
    });

    it('Generates a filename when none is provided', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
        const data = 'email,name\r\ntest@example.com,Test\r\n';

        const outputPath = await csv.writeCSV(data, tmpDir);

        assert.ok(outputPath.endsWith('.csv'));
        assert.ok(fs.existsSync(outputPath));
    });

    it('Creates nested directories if they do not exist', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
        const nestedDir = path.join(tmpDir, 'a', 'b', 'c');
        const data = 'col1\r\nval1\r\n';

        const outputPath = await csv.writeCSV(data, nestedDir, 'nested.csv');

        assert.ok(fs.existsSync(outputPath));
        const written = fs.readFileSync(outputPath, 'utf8');
        assert.equal(written, data);
    });

    it('Throws InternalServerError when outputFile fails', async function () {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'csv-test-'));
        // Create a directory where the file should be written, so outputFile fails
        const conflictDir = path.join(tmpDir, 'output.csv');
        fs.mkdirSync(conflictDir);

        await assert.rejects(
            csv.writeCSV('data', tmpDir, 'output.csv'),
            (err) => {
                assert.ok(err.message.includes('Could not create CSV file'));
                return true;
            }
        );
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

    it('Returns true when no blocked keys are present', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');
        const csvIsValid = await csv.hasKeys({
            filePath: pathToFile,
            required: ['Username'],
            blocked: ['nonexistent_column']
        });

        assert.equal(csvIsValid, true);
    });

    it('Returns true when no required or blocked keys are specified', async function () {
        const pathToFile = path.join(__dirname, '/fixtures/example.csv');
        const csvIsValid = await csv.hasKeys({
            filePath: pathToFile
        });

        assert.equal(csvIsValid, true);
    });
});
