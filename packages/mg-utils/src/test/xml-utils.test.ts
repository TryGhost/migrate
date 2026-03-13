import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {writeFile, unlink, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {parseXml} from '../lib/xml-utils.js';

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
        const result = await parseXml(
            '<root><item id="1">text</item></root>',
            {attributeNamePrefix: '', ignoreAttributes: false}
        );
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
