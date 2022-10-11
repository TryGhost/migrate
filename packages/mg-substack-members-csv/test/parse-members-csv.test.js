/* eslint no-undef: 0 */
import path from 'node:path';
import parseMembers from '../lib/parse-members-csv.js';

describe('Parses Substack members files', function () {
    test('only signups', async function () {
        const ctx = {
            options: {
                pathToFile: path.resolve('./test/fixtures/fixtures_signup_emails.csv')
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
                pathToFile: path.resolve('./test/fixtures/fixtures_signup_emails.csv'),
                subs: path.resolve('./test/fixtures/fixtures_subscriber_emails.csv'),
                hasSubscribers: true
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

