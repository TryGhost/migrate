/* eslint no-undef: 0 */
import path from 'node:path';
import parseMembers from '../index.js';

describe('Parses Curated subscribers file', function () {
    test('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: path.resolve('./test/fixtures/subscribers.csv')
            }
        };

        const result = await parseMembers(ctx);
        const subs = result.free;

        expect(subs).toBeArrayOfSize(20);

        expect(subs[0].email).toEqual('herroooo@curated.com');
        expect(subs[0].subscribed_to_emails).toEqual(true);
        expect(subs[0].complimentary_plan).toEqual(false);
        expect(subs[0].stripe_customer_id).toBeNull();
        expect(subs[0].created_at.toISOString()).toEqual('2021-02-04T07:55:20.000Z');
        expect(subs[0].expiry).toBeNull();
        expect(subs[0].type).toEqual('free');

        expect(subs[19].email).toEqual('maïbes@gmail.com');
        expect(subs[19].subscribed_to_emails).toEqual(true);
        expect(subs[19].complimentary_plan).toEqual(false);
        expect(subs[19].stripe_customer_id).toBeNull();
        expect(subs[19].created_at.toISOString()).toEqual('2021-01-30T13:54:19.000Z');
        expect(subs[19].expiry).toBeNull();
        expect(subs[19].type).toEqual('free');
    });
});
