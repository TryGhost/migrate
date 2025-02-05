import assert from 'node:assert/strict';
import {join} from 'node:path';
import processCsv from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('beehiiv Members', () => {
    it('Can parse CSV', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed.length, 6);
    });

    it('Finds correct number of paid members', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        const paid = processed.filter((member) => {
            return member.stripe_customer_id.length > 0;
        });

        assert.equal(paid.length, 3);
    });

    it('Finds correct number of free members', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        const paid = processed.filter((member) => {
            return member.stripe_customer_id.length === 0;
        });

        assert.equal(paid.length, 3);
    });

    it('Uses Stripe customer ID is present', async () => {
        const processed = await processCsv({csvPath: join(fixturesPath, 'members.csv')});

        assert.equal(processed[5].stripe_customer_id, 'cus_1234');
    });
});
