const path = require('path');
const parseMembers = require('../');

// Switch these lines once there are useful utils
require('./utils');

describe('Parses Curated subscribers file', function () {
    it('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: path.resolve('./test/fixtures/subscribers.csv')
            }
        };

        const result = await parseMembers(ctx);
        const subs = result.free;

        subs.length.should.equal(20);

        subs[0].email.should.eql('herroooo@curated.com');
        subs[0].subscribed_to_emails.should.eql(true);
        subs[0].complimentary_plan.should.eql(false);
        should.not.exist(subs[0].stripe_customer_id);
        subs[0].created_at.toISOString().should.eql('2021-02-04T07:55:20.000Z');
        should.not.exist(subs[0].expiry);
        subs[0].type.should.eql('free');

        subs[19].email.should.eql('maïbes@gmail.com');
        subs[19].subscribed_to_emails.should.eql(true);
        subs[19].complimentary_plan.should.eql(false);
        should.not.exist(subs[19].stripe_customer_id);
        subs[19].created_at.toISOString().should.eql('2021-01-30T13:54:19.000Z');
        should.not.exist(subs[19].expiry);
        subs[19].type.should.eql('free');
    });
});
