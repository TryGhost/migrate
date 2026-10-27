import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeInlinerUrls} from '../lib/utils.js';

describe('Inliner domain list generator', function () {
    it('does the thing', () => {
        const domains = makeInlinerUrls({domain: 'https://hello.example.com'});

        assert.equal(domains.length, 4);

        assert.deepEqual(domains, [
            'http://example.com',
            'https://example.com',
            'http://hello.example.com',
            'https://hello.example.com'
        ]);
    });
});
