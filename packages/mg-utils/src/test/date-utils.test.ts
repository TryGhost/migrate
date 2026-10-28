import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {dateUtils} from '../index.js';

const {parseDate} = dateUtils;

const iso = (value: unknown) => parseDate(value)?.toISOString();

describe('parseDate', function () {
    it('Reads timestamps without a zone as UTC, with a space or T separator', function () {
        assert.equal(iso('2025-07-27 03:37:40'), '2025-07-27T03:37:40.000Z');
        assert.equal(iso('2025-07-27T03:37:40'), '2025-07-27T03:37:40.000Z');
        assert.equal(iso(' 2025-07-27 03:37 '), '2025-07-27T03:37:00.000Z');
        assert.equal(iso('2023-03-24T19:45:24.257025'), '2023-03-24T19:45:24.257Z');
    });

    it('Respects zone designators and offsets', function () {
        assert.equal(iso('2024-01-01T00:00:00Z'), '2024-01-01T00:00:00.000Z');
        assert.equal(iso('2024-01-01T00:00:00+02:00'), '2023-12-31T22:00:00.000Z');
        assert.equal(iso('2023-01-02 16:55:00+00:00'), '2023-01-02T16:55:00.000Z');
        assert.equal(iso('2020-01-01T00:00:00.000-08:00'), '2020-01-01T08:00:00.000Z');
    });

    it('Parses RFC 2822 dates, including GMT', function () {
        assert.equal(iso('Sun, 27 Jul 2025 03:37:40 +0000'), '2025-07-27T03:37:40.000Z');
        assert.equal(iso('Mon, 30 Nov 2020 10:00:00 GMT'), '2020-11-30T10:00:00.000Z');
    });

    it('Reads a date on its own as UTC midnight', function () {
        assert.equal(iso('2025-07-27'), '2025-07-27T00:00:00.000Z');
    });

    it('Returns undefined for blank, invalid, zeroed and non-string values', function () {
        for (const value of [
            '',
            '   ',
            'not a date',
            '0000-00-00 00:00:00',
            'Mon, 30 Nov -0001 00:00:00 +0000',
            undefined,
            null,
            1700000000000,
            new Date()
        ]) {
            assert.equal(parseDate(value), undefined, String(value));
        }
    });
});
