import assert from 'node:assert/strict';
import {join} from 'node:path';
import processCsv from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('beehiiv Members', () => {
    it('Can parse CSV', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed.free.length, 5);
        assert.equal(processed.paid.length, 1);
    });

    it('Uses Stripe customer ID if present', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed.paid[0].stripe_customer_id, 'cus_1234');
    });

    it('Uses names is present', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed.free[0].name, 'Lorem Name');
        assert.equal(processed.free[1].name, 'Ipsum Name');
        assert.equal(processed.free[2].name, null);
        assert.equal(processed.free[3].name, 'Last Only');
        assert.equal(processed.paid[0].name, null);
    });

    it('Uses Substack subscription date if present', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed.free[4].email, 'fromsubstack@example.com');
        assert.equal(processed.free[4].created_at.toISOString(), new Date('2022-03-12T11:43:23.000Z').toISOString());
    });
});
