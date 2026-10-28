import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {writeFile, unlink, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ensureArray, getText, parseXml} from '../lib/xml-utils.js';

describe('parseXml', function () {
    it('parses XML from a string', async function () {
        const result = await parseXml('<root><item>hello</item></root>');
        assert.deepEqual(result, {root: {item: 'hello'}});
    });

    it('parses XML string with leading whitespace', async function () {
        const result = await parseXml('  \n<root><item>hello</item></root>');
        assert.deepEqual(result, {root: {item: 'hello'}});
    });

    it('preserves attributes with default prefix', async function () {
        const result = await parseXml('<root><item id="1">text</item></root>');
        assert.deepEqual(result, {root: {item: {'@_id': '1', '#text': 'text'}}});
    });

    it('parses XML from a file path', async function () {
        const dir = join(tmpdir(), 'mg-utils-test-' + Date.now());
        await mkdir(dir, {recursive: true});
        const filePath = join(dir, 'test.xml');
        await writeFile(filePath, '<root><title>from file</title></root>', 'utf-8');

        try {
            const result = await parseXml(filePath);
            assert.deepEqual(result, {root: {title: 'from file'}});
        } finally {
            await unlink(filePath);
        }
    });

    it('allows overriding parser options', async function () {
        const result = await parseXml('<root><item id="1">text</item></root>', {
            attributeNamePrefix: '',
            ignoreAttributes: false
        });
        assert.deepEqual(result, {root: {item: {id: '1', '#text': 'text'}}});
    });

    it('throws on invalid XML file path', async function () {
        await assert.rejects(
            () => parseXml('/nonexistent/path/to/file.xml'),
            (err: NodeJS.ErrnoException) => {
                assert.equal(err.code, 'ENOENT');
                return true;
            }
        );
    });
});

describe('getText', function () {
    it('Reads strings and numbers as given', function () {
        assert.equal(getText('text'), 'text');
        assert.equal(getText('  spaced  '), '  spaced  ');
        assert.equal(getText(42), '42');
    });

    it('Reads the text of an element with attributes', function () {
        assert.equal(getText({'@_domain': 'category', '#text': 'Name'}), 'Name');
        assert.equal(getText({'#text': 2024}), '2024');
    });

    it('Reads the first of a repeated element', function () {
        assert.equal(getText(['first', 'second']), 'first');
        assert.equal(getText([{'#text': 'first'}, 'second']), 'first');
    });

    it('Gives an empty string for missing values and elements without text', function () {
        for (const value of [undefined, null, [], {'@_domain': 'category'}, {}]) {
            assert.equal(getText(value), '', JSON.stringify(value));
        }
    });

    it('Reads values from parseXml', async function () {
        const {rss} = (await parseXml('<rss><category domain="tag">News</category><title>Hello</title></rss>')) as any;
        assert.equal(getText(rss.category), 'News');
        assert.equal(getText(rss.title), 'Hello');
        assert.equal(getText(rss.missing), '');
    });
});

describe('ensureArray', function () {
    it('Wraps a single value and keeps an array', function () {
        assert.deepEqual(ensureArray('one'), ['one']);
        assert.deepEqual(ensureArray({'#text': 'one'}), [{'#text': 'one'}]);
        assert.deepEqual(ensureArray(['one', 'two']), ['one', 'two']);
    });

    it('Gives an empty array for missing and empty values', function () {
        for (const value of [undefined, null, '']) {
            assert.deepEqual(ensureArray(value), [], String(value));
        }
    });
});
