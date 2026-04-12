import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {stringUtils} from '../index.js';

const {unescapeHTML, startCase, kebabCase, stripHtml, cleanURL} = stringUtils;

describe('unescapeHTML', function () {
    it('Unescapes HTML entities', function () {
        assert.equal(unescapeHTML('&amp; &lt; &gt; &quot; &#39;'), '& < > " \'');
    });

    it('Leaves strings without entities unchanged', function () {
        assert.equal(unescapeHTML('hello world'), 'hello world');
    });
});

describe('startCase', function () {
    it('Converts slug to title case', function () {
        assert.equal(startCase('hello-world'), 'Hello World');
    });

    it('Handles underscores', function () {
        assert.equal(startCase('foo_bar_baz'), 'Foo Bar Baz');
    });

    it('Handles single word', function () {
        assert.equal(startCase('newsletter'), 'Newsletter');
    });
});

describe('kebabCase', function () {
    it('Converts spaced string to kebab-case', function () {
        assert.equal(kebabCase('Hello World'), 'hello-world');
    });

    it('Handles underscores', function () {
        assert.equal(kebabCase('foo_bar'), 'foo-bar');
    });
});

describe('stripHtml', function () {
    it('Strips HTML tags', function () {
        assert.equal(stripHtml('<p>Hello <b>world</b></p>'), 'Hello world');
    });

    it('Replaces newlines with spaces', function () {
        assert.equal(stripHtml('<p>Line 1</p>\n<p>Line 2</p>'), 'Line 1 Line 2');
    });

    it('Trims whitespace', function () {
        assert.equal(stripHtml('  <span>hello</span>  '), 'hello');
    });
});

describe('cleanURL', function () {
    it('Strips protocol and query params', function () {
        assert.equal(cleanURL('https://example.com/my-post/?ref=home'), 'example.com/my-post/');
    });

    it('Strips protocol only', function () {
        assert.equal(cleanURL('http://example.com/page/'), 'example.com/page/');
    });

    it('Returns original string for invalid URLs', function () {
        assert.equal(cleanURL('not-a-url'), 'not-a-url');
    });
});
