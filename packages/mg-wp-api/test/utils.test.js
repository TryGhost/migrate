import {makeInlinerUrls} from '../lib/utils.js';

describe('Inliner domain list generator', function () {
    test('does the thing', () => {
        const domains = makeInlinerUrls({domain: 'https://hello.example.com'});

        expect(domains).toBeArrayOfSize(4);

        expect(domains).toEqual([
            'http://example.com',
            'https://example.com',
            'http://hello.example.com',
            'https://hello.example.com'
        ]);
    });
});
