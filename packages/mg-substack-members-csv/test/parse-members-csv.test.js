import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import {join} from 'node:path';
import parseMembers from '../lib/parse-members-csv.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Parses Substack members files', function () {
    it('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: join(__dirname, '/fixtures/fixtures_signup_emails.csv')
            }
        };

        const result = await parseMembers(ctx);

        assert.equal(result.length, 21);

        const free = result.filter(i => i.type === 'free');

        assert.equal(free.length, 21);
    });

    it('signups and subscribers', async function () {
        const ctx = {
            options: {
                pathToFile: join(__dirname, '/fixtures/fixtures_signup_emails.csv'),
                subs: join(__dirname, '/fixtures/fixtures_subscriber_emails.csv')
            }
        };

        const result = await parseMembers(ctx);

        assert.equal(result.length, 21);

        const free = result.filter(i => i.type === 'free');
        const comp = result.filter(i => i.type === 'comp');
        const gift = result.filter(i => i.type === 'gift');
        const paid = result.filter(i => i.type === 'paid');

        assert.equal(free.length, 5);
        assert.equal(comp.length, 3);
        assert.equal(gift.length, 4);
        assert.equal(paid.length, 9);
    });
});
