const path = require('path');
const parseMembers = require('../lib/parse-members-csv');

// Switch these lines once there are useful utils
// const testUtils = require('./utils');
require('./utils');

describe('Parses Substack members files', function () {
    it('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: path.resolve('./test/fixtures/fixtures_signup_emails.csv')
            }
        };

        const result = await parseMembers(ctx);

        result.length.should.equal(21);

        const free = result.filter(i => i.type === 'free');

        free.length.should.equal(21);
    });

    it('signups and subscribers', async function () {
        const ctx = {
            options: {
                pathToFile: path.resolve('./test/fixtures/fixtures_signup_emails.csv'),
                subs: path.resolve('./test/fixtures/fixtures_subscriber_emails.csv'),
                hasSubscribers: true
            }
        };

        const result = await parseMembers(ctx);

        result.length.should.equal(21);

        const free = result.filter(i => i.type === 'free');
        const comp = result.filter(i => i.type === 'comp');
        const gift = result.filter(i => i.type === 'gift');
        const paid = result.filter(i => i.type === 'paid');

        free.length.should.equal(5);
        comp.length.should.equal(3);
        gift.length.should.equal(4);
        paid.length.should.equal(9);
    });
});

