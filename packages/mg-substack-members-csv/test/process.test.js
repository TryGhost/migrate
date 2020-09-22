const processMembers = require('../lib/process');
const parsedMembers = require('./fixtures/parsed');

// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

const DEFAULT_OPTIONS = {
    comp: {tresholdYears: 10, beforeTreshold: 'free'},
    gift: {tresholdYears: 10, beforeTreshold: 'free'},
    compLabel: 'substack-comp',
    giftLabel: 'substack-gift',
    freeLabel: 'substack-free',
    paidLabel: 'substack-paid'
};

describe('Normalizes and processes Substack members', function () {
    it('only free with default options', async function () {
        const input = parsedMembers.free;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        result.should.be.an.object;
        result.free.should.have.length(21);
    });

    it('subscribers with default options', async function () {
        const input = parsedMembers.subscribed;

        const result = await processMembers(input, DEFAULT_OPTIONS);

        result.should.be.an.object;
        result.free.should.have.length(11);
        result.comp.should.have.length(1);
        result.paid.should.have.length(9);
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

        result.should.be.an.object;
        result.free.should.have.length(2);

        const [m1, m2] = result.free;

        m1.subscribed_to_emails.should.be.false();
        m2.subscribed_to_emails.should.be.true();
    });
    // it('with date treshold for comp and gift');
    // it('converts comp and gift members to free when chosen as before treshold option');
    // it('skips members when `none` chosen as before treshold option');
    it('removes delete requests', async function () {
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

        result.should.be.an.object;
        result.free.should.have.length(1);
        result.skip.should.have.length(1);
    });

    it('detects and logs possible group memberships', async function () {
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

        result.should.be.an.object;
        result.free.should.have.length(2);

        const [m1, m2] = result.free;

        m1.reason.should.be.match(/possible group membership: harry_potter@gmail.com/);
        m2.reason.should.be.match(/possible group membership: dumbledore@gmail.com/);
    });
});

