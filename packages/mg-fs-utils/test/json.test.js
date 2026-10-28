import assert from 'node:assert/strict';
import {describe, it, after} from 'node:test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import json from '../lib/json.js';

const directory = await mkdtemp(join(tmpdir(), 'mg-fs-utils-json-'));

after(async function () {
    await rm(directory, {recursive: true, force: true});
});

async function collect(input, options) {
    const items = [];
    for await (const item of json.streamArray(input, options)) {
        items.push(item);
    }
    return items;
}

/** A stream of `text` as one-byte chunks, so every token and character is split across chunks. */
const byteStream = text => Readable.from([...Buffer.from(text)].map(byte => Buffer.from([byte])));

const items = [
    {
        id: 1,
        title: 'Brackets ] } and "quotes" in strings',
        content: [{type: 'text', children: [{content: 'Café “curly” — dash', style: {bold: true}}]}],
        escapes: 'back\\slash \\" and \n newline',
        empty: {},
        list: []
    },
    {id: 2, values: [1, -2.5e3, true, false, null, 'two'], nested: {deep: [[{a: [1]}]]}},
    'a string item',
    42,
    null
];

const wrapped = {
    version: 3,
    meta: {skipped: ['a', {b: ']'}], text: 'has "data" in it', count: 3, ok: true, none: null},
    data: {before: [1, {x: '}'}], authors: items, after: 'ignored'},
    trailing: [false]
};

describe('Stream JSON array items', function () {
    it('Reads the items of a top-level array in a file', async function () {
        const file = join(directory, 'items.json');
        await writeFile(file, JSON.stringify(items, null, 4));

        assert.deepEqual(await collect(file), items);
    });

    it('Reads the array at a path, skipping every other value', async function () {
        assert.deepEqual(
            await collect(Readable.from([JSON.stringify(wrapped, null, 2)]), {path: ['data', 'authors']}),
            items
        );
    });

    it('Reads values and characters split across chunks', async function () {
        assert.deepEqual(await collect(byteStream(JSON.stringify(items))), items);
        assert.deepEqual(await collect(byteStream(JSON.stringify(wrapped)), {path: ['data', 'authors']}), items);
    });

    it('Reads string chunks, a byte order mark and empty arrays', async function () {
        assert.deepEqual(await collect(Readable.from(['﻿[1, ', '{"a"', ': 2}]\n'])), [1, {a: 2}]);
        assert.deepEqual(await collect(Readable.from([' [ ] '])), []);
        assert.deepEqual(await collect(Readable.from(['{"data": {"authors": []}}']), {path: ['data', 'authors']}), []);
    });

    it('Uses the first of repeated keys', async function () {
        assert.deepEqual(await collect(Readable.from(['{"data": [1], "data": [2]}']), {path: ['data']}), [1]);
    });

    it('Destroys the input when the caller stops early', async function () {
        const file = join(directory, 'early.json');
        await writeFile(file, JSON.stringify(items));
        const source = createReadStream(file);
        for await (const item of json.streamArray(source)) {
            assert.equal(item.id, 1);
            break;
        }
        assert.equal(source.destroyed, true);
    });

    it('Rejects when the file does not exist', async function () {
        await assert.rejects(collect('/nonexistent/path/file.json'), {code: 'ENOENT'});
    });

    it('Rejects input without an array at the path', async function () {
        const read = (text, path) => collect(Readable.from([text]), {path});

        await assert.rejects(read('{"a": 1}'), /^SyntaxError: Expected an array at the top level at position 0$/);
        await assert.rejects(read(''), /Expected an array at the top level at position 0/);
        await assert.rejects(read('[]', ['data']), /Expected an object at the top level/);
        await assert.rejects(read('{"data": 1}', ['data', 'authors']), /Expected an object at "data" at position 9/);
        await assert.rejects(
            read('{"data": {"authors": {}}}', ['data', 'authors']),
            /Expected an array at "data.authors"/
        );
        await assert.rejects(read('{}', ['data']), /No "data" key in the object at the top level/);
        await assert.rejects(
            read('{"data": {"x": []}}', ['data', 'authors']),
            /No "authors" key in the object at "data"/
        );
    });

    it('Rejects malformed JSON with its position', async function () {
        const read = (text, path = ['data']) => collect(Readable.from([text]), {path});

        await assert.rejects(read('[1 2]', []), /Unexpected '2' at position 3/);
        await assert.rejects(read('[1,]', []), /Unexpected '\]' at position 3/);
        await assert.rejects(read('[1', []), /Unexpected end of JSON at position 2/);
        await assert.rejects(read('["abc', []), /Unexpected end of JSON at position 5/);
        await assert.rejects(read('[{"a": [1}]', []), /Unexpected '\}' at position 9/);
        await assert.rejects(read('[tru]', []), /Invalid JSON value 'tru' at position 1/);
        await assert.rejects(read('[] x', []), /Unexpected 'x' at position 3/);
        await assert.rejects(read('{data: []}'), /Unexpected 'd' at position 1/);
        await assert.rejects(read('{"data" []}'), /Unexpected '\[' at position 8/);
        await assert.rejects(read('{"data": [] "x": 1}'), /Unexpected '"' at position 12/);
        await assert.rejects(read('{"data": [], }'), /Unexpected '\}' at position 13/);
        await assert.rejects(read('{"x": , "data": []}'), /Unexpected ',' at position 6/);
        await assert.rejects(read('{"x": }'), /Unexpected '\}' at position 6/);
        await assert.rejects(read('{"x":'), /Unexpected end of JSON at position 5/);
        await assert.rejects(read('{"x": [1}, "data": []}'), /Unexpected '\}' at position 8/);
        await assert.rejects(read('{"x": nul, "data": []}'), /Invalid JSON value 'nul' at position 6/);
    });

    it('Rejects an item that is not valid JSON, after yielding the items before it', async function () {
        const read = [];
        await assert.rejects(async () => {
            for await (const item of json.streamArray(Readable.from(['[{"a": 1}, {"a": tru}]']))) {
                read.push(item);
            }
        }, /^SyntaxError: Invalid JSON in item 1 of the array at the top level: /);
        assert.deepEqual(read, [{a: 1}]);
        await assert.rejects(
            collect(Readable.from(['{"data": [{"a": "\\x"}]}']), {path: ['data']}),
            /Invalid JSON in item 0 of the array at "data"/
        );
    });
});
