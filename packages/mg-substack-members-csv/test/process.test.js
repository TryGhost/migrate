import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import processMembers from '../lib/process.js';
import parsedMembers from './fixtures/parsed.js';

const DEFAULT_OPTIONS = {
    options: {
        comp: {thresholdYearOrDate: 10, beforeThreshold: 'free'},
        gift: {thresholdYearOrDate: 10, beforeThreshold: 'free'},
        compLabel: 'substack-comp',
        giftLabel: 'substack-gift',
        freeLabel: 'substack-free',
        paidLabel: 'substack-paid'
    }
};

describe('Normalizes and processes Substack members', function () {
    it('only free with default options', async function () {
        const input = parsedMembers.free;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 21);
    });

    it('subscribers with default options', async function () {
        const input = parsedMembers.subscribed;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 11);
        assert.equal(result.comp.length, 1);
        assert.equal(result.paid.length, 9);
    });

    it('correctly switches the email subscription preferences', async function () {
        const input = [
            {
                email: 'edwinjeans@gmail.com',
                email_disabled: 'true',
                created_at: '2018-08-27T15: 22: 11.139Z',
                type: 'free'
            },
            {
                email: 'someNews@gmail.com',
                email_disabled: 'false',
                created_at: '2018-12-11T02: 25: 36.560Z',
                type: 'free'
            }
        ];

        const result = await processMembers(input, DEFAULT_OPTIONS);

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 2);

        const [m1, m2] = result.free;

        assert.ok(!m1.subscribed_to_emails);
        assert.ok(m2.subscribed_to_emails);
    });

    it('with date or year threshold for comp and gift', async function () {
        const input = parsedMembers.subscribed;
        const options = {
            options: {
                comp: {thresholdYearOrDate: new Date('2020-12-31T00:00:00.000Z'), beforeThreshold: 'free'},
                gift: {thresholdYearOrDate: 1, beforeThreshold: 'none'},
                compLabel: 'substack-comp',
                giftLabel: 'substack-gift',
                freeLabel: 'substack-free',
                paidLabel: 'substack-paid'
            }
        };

        const result = await processMembers(input, options);
        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 5);
        assert.equal(result.paid.length, 9);
        assert.equal(result.comp.length, 3);
        assert.equal(result.skip.length, 4);
    });

    it('uses string values for comp and gift', async function () {
        const input = parsedMembers.subscribed;
        const options = {
            options: {
                comp: '0:free',
                gift: '0:free'
            }
        };

        const result = await processMembers(input, options);
        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 11);
        assert.equal(result.paid.length, 9);
        assert.equal(result.comp.length, 1);
    });

    it('includes expiry label comp and gift members', async function () {
        const input = parsedMembers.subscribed;
        const options = {
            options: {
                comp: {thresholdYearOrDate: new Date('2020-12-31T00:00:00.000Z'), beforeThreshold: 'free'},
                gift: {thresholdYearOrDate: new Date('2010-12-31T00:00:00.000Z'), beforeThreshold: 'free'},
                compLabel: 'substack-comp',
                giftLabel: 'substack-gift',
                freeLabel: 'substack-free',
                paidLabel: 'substack-paid'
            }
        };

        const result = await processMembers(input, options);
        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.comp[0].email, 'maguirec086@comm.ca');
        assert.equal(result.comp[0].labels, 'exp-2025-06, substack-comp');
        assert.equal(result.comp[3].email, 'ömil@gmail.com');
        assert.equal(result.comp[3].labels, 'exp-2020-10, substack-gift');
    });

    it('skips delete requests', async function () {
        const input = [
            {
                email: '@deletion-request.substack.com',
                created_at: '2018-08-27T15:22:11.139Z',
                type: 'free'
            },
            {
                email: 'dumbledore@gmail.com',
                active_subscription: 'true',
                created_at: '2018-12-11T02:25:36.560Z',
                type: 'free'
            }
        ];

        const result = await processMembers(input, DEFAULT_OPTIONS);

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 1);
        assert.equal(result.skip.length, 1);
    });

    it('detects and logs possible group memberships and imports as `free`', async function () {
        const input = [
            {
                email: 'harry_potter@gmail.com',
                active_subscription: 'true',
                created_at: '2018-08-27T15:22:11.139Z',
                type: 'paid'
            },
            {
                email: 'dumbledore@gmail.com',
                active_subscription: 'true',
                created_at: '2018-12-11T02:25:36.560Z',
                type: 'paid'
            }
        ];

        const result = await processMembers(input, DEFAULT_OPTIONS);

        assert.ok(typeof result === 'object' && result !== null);
        assert.equal(result.free.length, 2);

        const [m1, m2] = result.free;

        assert.match(m1.info, /possible group membership: harry_potter@gmail.com/);
        assert.match(m2.info, /possible group membership: dumbledore@gmail.com/);
    });
});
