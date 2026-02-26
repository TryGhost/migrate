import {URL} from 'node:url';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import parseMembers from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Parses Curated subscribers file', function () {
    it('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: join(__dirname, 'fixtures/subscribers.csv')
            }
        };

        const result = await parseMembers(ctx);
        const subs = result.free;

        assert.equal(subs.length, 20);

        assert.equal(subs[0].email, 'herroooo@curated.com');
        assert.equal(subs[0].subscribed_to_emails, true);
        assert.equal(subs[0].complimentary_plan, false);
        assert.equal(subs[0].stripe_customer_id, null);
        assert.equal(subs[0].created_at.toISOString(), '2021-02-04T07:55:20.000Z');
        assert.equal(subs[0].expiry, null);
        assert.equal(subs[0].type, 'free');

        assert.equal(subs[19].email, 'ma\u00efbes@gmail.com');
        assert.equal(subs[19].subscribed_to_emails, true);
        assert.equal(subs[19].complimentary_plan, false);
        assert.equal(subs[19].stripe_customer_id, null);
        assert.equal(subs[19].created_at.toISOString(), '2021-01-30T13:54:19.000Z');
        assert.equal(subs[19].expiry, null);
        assert.equal(subs[19].type, 'free');
    });
});
