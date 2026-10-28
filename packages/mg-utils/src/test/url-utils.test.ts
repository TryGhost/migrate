import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {urlUtils} from '../index.js';

const {httpUrl, canonicalSite} = urlUtils;

describe('httpUrl', function () {
    it('Parses trimmed HTTP and HTTPS URLs', function () {
        assert.equal(httpUrl('https://example.com/a?b=c')?.href, 'https://example.com/a?b=c');
        assert.equal(httpUrl('  http://Example.com  ')?.href, 'http://example.com/');
    });

    it('Resolves relative URLs against a base', function () {
        assert.equal(httpUrl('/2024/01/post/', 'https://example.com/blog')?.href, 'https://example.com/2024/01/post/');
        assert.equal(httpUrl('post', 'https://example.com/blog/')?.href, 'https://example.com/blog/post');
    });

    it('Ignores a blank base', function () {
        assert.equal(httpUrl('https://example.com/post', '')?.href, 'https://example.com/post');
        assert.equal(httpUrl('/post', ''), undefined);
    });

    it('Returns undefined for other protocols, invalid URLs, blank strings and non-strings', function () {
        for (const value of [
            'mailto:hello@example.com',
            'javascript:alert(1)',
            'ftp://example.com',
            'not a url',
            '',
            '   ',
            undefined,
            null,
            42,
            new URL('https://example.com')
        ]) {
            assert.equal(httpUrl(value), undefined, String(value));
        }
    });

    it('Does not resolve a blank value to the base', function () {
        assert.equal(httpUrl('', 'https://example.com'), undefined);
    });
});

describe('canonicalSite', function () {
    it('Keeps the lowercased host and path without trailing slashes', function () {
        assert.equal(canonicalSite('https://Example.com/'), 'example.com');
        assert.equal(canonicalSite('http://example.com:8080/blog//?page=2#top'), 'example.com:8080/blog');
        assert.equal(canonicalSite(new URL('https://www.example.com/Blog/')), 'www.example.com/Blog');
    });

    it('Throws when a string is not a URL', function () {
        assert.throws(() => canonicalSite('example.com'), TypeError);
    });
});
