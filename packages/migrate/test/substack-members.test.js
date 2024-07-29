import assert from 'node:assert/strict';
import {parseCompGift} from '../commands/substack-members.js';

describe('Substack Members Parse Comp & Gift', function () {
    test('18:none', async function () {
        const result = parseCompGift('18:none');

        assert.deepEqual(result, {
            thresholdYearOrDate: 18,
            beforeThreshold: 'none'
        });
    });

    test('18:free', async function () {
        const result = parseCompGift('18:free');

        assert.deepEqual(result, {
            thresholdYearOrDate: 18,
            beforeThreshold: 'free'
        });
    });

    test('20180510:none', async function () {
        const result = parseCompGift('20180510:none');

        assert.deepEqual(result, {
            thresholdYearOrDate: new Date('2018-05-10T12:00:00.000Z'),
            beforeThreshold: 'none'
        });
    });

    test('20180510:free', async function () {
        const result = parseCompGift('20180510:free');

        assert.deepEqual(result, {
            thresholdYearOrDate: new Date('2018-05-10T12:00:00.000Z'),
            beforeThreshold: 'free'
        });
    });
});
