import {URL} from 'node:url';
import {join} from 'node:path';
import parseMembers from '../lib/parse-members-csv.js';

const __dirname = new URL('.', import.meta.url).pathname;

describe('Parses Substack members files', function () {
    test('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: join(__dirname, '/fixtures/fixtures_signup_emails.csv')
            }
        };

        const result = await parseMembers(ctx);

        expect(result.length).toEqual(21);

        const free = result.filter(i => i.type === 'free');

        expect(free.length).toEqual(21);
    });

    test('signups and subscribers', async function () {
        const ctx = {
            options: {
                pathToFile: join(__dirname, '/fixtures/fixtures_signup_emails.csv'),
                subs: join(__dirname, '/fixtures/fixtures_subscriber_emails.csv')
            }
        };

        const result = await parseMembers(ctx);

        expect(result).toBeArrayOfSize(21);

        const free = result.filter(i => i.type === 'free');
        const comp = result.filter(i => i.type === 'comp');
        const gift = result.filter(i => i.type === 'gift');
        const paid = result.filter(i => i.type === 'paid');

        expect(free).toBeArrayOfSize(5);
        expect(comp).toBeArrayOfSize(3);
        expect(gift).toBeArrayOfSize(4);
        expect(paid).toBeArrayOfSize(9);
    });
});

