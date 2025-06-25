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
    test('only free with default options', async function () {
        const input = parsedMembers.free;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(21);
    });

    it('subscribers with default options', async function () {
        const input = parsedMembers.subscribed;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(11);
        expect(result.comp).toBeArrayOfSize(1);
        expect(result.paid).toBeArrayOfSize(9);
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

        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(2);

        const [m1, m2] = result.free;

        expect(m1.subscribed_to_emails).toBeFalsy();
        expect(m2.subscribed_to_emails).toBeTruthy();
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
        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(5);
        expect(result.paid).toBeArrayOfSize(9);
        expect(result.comp).toBeArrayOfSize(3);
        expect(result.skip).toBeArrayOfSize(4);
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
        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(11);
        expect(result.paid).toBeArrayOfSize(9);
        expect(result.comp).toBeArrayOfSize(1);
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
        expect(result).toBeObject();
        expect(result.comp[0].email).toEqual('maguirec086@comm.ca');
        expect(result.comp[0].labels).toEqual('exp-2025-06, substack-comp');
        expect(result.comp[3].email).toEqual('ömil@gmail.com');
        expect(result.comp[3].labels).toEqual('exp-2020-10, substack-gift');
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

        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(1);
        expect(result.skip).toBeArrayOfSize(1);
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

        expect(result).toBeObject();
        expect(result.free).toBeArrayOfSize(2);

        const [m1, m2] = result.free;

        expect(m1.info).toMatch(/possible group membership: harry_potter@gmail.com/);
        expect(m2.info).toMatch(/possible group membership: dumbledore@gmail.com/);
    });
});

