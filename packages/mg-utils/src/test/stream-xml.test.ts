import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {streamXmlRecords} from '../lib/stream-xml.js';
import {parseXml} from '../lib/xml-utils.js';

async function collect(source: string | AsyncIterable<string | Uint8Array>, paths = ['rss/channel/item']) {
    const values = [];
    for await (const record of streamXmlRecords(source, {paths})) {
        values.push(record.value);
    }
    return values;
}

it('preserves XML values across every UTF-8 and markup chunk boundary', async () => {
    const xml =
        '<rss xmlns:wp="urn:wordpress"><channel><item a="1"><title>🌍 &amp; café</title><wp:meta>one</wp:meta><wp:meta>two</wp:meta><wp:meta>three</wp:meta><body><![CDATA[<p>a > b & c</p>]]></body><empty/><value a="2">attributes and text</value><other a="3"/><__proto__>safe</__proto__></item></channel></rss>';
    const expected = ((await parseXml(xml.replace('<__proto__>safe</__proto__>', ''))) as any).rss.channel.item;
    // fast-xml-parser deliberately drops prototype keys; retain them safely in the stream.
    delete expected.__proto__;
    for (const size of [1, 2, 7, 31, 1024]) {
        async function* chunks() {
            const bytes = Buffer.from(xml);
            for (let index = 0; index < bytes.length; index += size) {
                yield bytes.subarray(index, index + size);
            }
        }
        const [actual] = await collect(chunks());
        assert.equal(actual.__proto__, 'safe');
        delete actual.__proto__;
        assert.deepEqual(actual, expected);
    }
});

it('supports string chunks, wildcard selection, files, and nonselected documents', async () => {
    async function* chunks() {
        yield '<rss>ignore<channel>before<link>https://example.com</link><item>text</item><empty/></channel></rss>';
    }
    assert.deepEqual(await collect(chunks(), ['rss/channel/*']), ['https://example.com', 'text', '']);
    assert.deepEqual(await collect(chunks(), []), []);
    const directory = await mkdtemp(join(tmpdir(), 'xml-stream-'));
    try {
        const path = join(directory, 'input.xml');
        await writeFile(path, '<rss><channel><item>file</item></channel></rss>');
        assert.deepEqual(await collect(path), ['file']);
        await assert.rejects(collect(join(directory, 'missing')), /ENOENT/);
    } finally {
        await rm(directory, {recursive: true});
    }
});

it('applies backpressure and closes the source when its consumer stops', async () => {
    let requested = 0;
    let closed = false;
    async function* source() {
        try {
            requested++;
            yield '<rss><channel><item>first</item>';
            requested++;
            throw new Error('must not request another chunk');
        } finally {
            closed = true;
        }
    }
    for await (const item of streamXmlRecords(source(), {paths: ['rss/channel/item']})) {
        assert.equal(item.value, 'first');
        assert.equal(requested, 1);
        break;
    }
    assert.equal(closed, true);
});

it('rejects malformed, concatenated, and truncated documents with source location', async () => {
    for (const xml of [
        '<rss></bad>',
        '<rss/><rss/>',
        '<rss>',
        '<rss>&copy;</rss>',
        '<?xml version="1.0"?><rss/><?xml version="1.0"?><rss/>'
    ]) {
        async function* source() {
            yield xml;
        }
        await assert.rejects(async () => {
            for await (const unused of streamXmlRecords(source(), {paths: [], filename: 'broken.xml'})) {
                assert.fail(String(unused));
            }
        }, /broken\.xml:\d+:\d+:/);
    }
});
