import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {SourceRecordInput} from '@tryghost/mg-context';
import {ingest, parse, sourceSite, sourceUrl} from '../index.js';
import {SAMPLE, cleanUp, events, exportXml, ingested, item, memoryContext, writeXml} from './helpers.js';

async function records(path: string): Promise<SourceRecordInput[]> {
    const result = [];
    for await (const record of parse(path)) {
        result.push(record);
    }
    return result;
}

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const value of items) {
        result.push(value);
    }
    return result;
}

describe('Reading a Squarespace export', function () {
    after(cleanUp);

    it('yields items keyed by ID, authors keyed by ID, and channel elements', async function () {
        const result = await records(SAMPLE);

        assert.deepEqual(
            result.filter(record => record.kind === 'item').map(record => [record.key, record.metadata!.index]),
            [
                ['id:204', 0],
                ['id:4', 1],
                ['id:5', 2],
                ['id:135', 3],
                ['id:136', 4],
                ['id:146', 5]
            ]
        );
        assert.deepEqual(
            result.filter(record => record.kind === 'author').map(record => record.key),
            ['id:-19091979', 'id:-31071980']
        );
        assert.deepEqual(
            result.filter(record => record.kind === 'channel').map(record => record.key),
            ['title:0', 'link:1', 'pubDate:2', 'description:3', 'language:4', 'wp:wxr_version:5', 'wp:category:6']
        );

        const [draft] = result.filter(record => record.kind === 'item');
        assert.equal(draft.format, 'json');
        assert.deepEqual(draft.metadata, {file: 'sample.xml', name: 'item', line: 32, column: 10, index: 0});
        const value = JSON.parse(draft.content);
        assert.equal(value.title, 'Draft & Post &amp; More&mdash;More');
        assert.deepEqual(value.category[0], {
            '@_domain': 'post_tag',
            '@_nicename': 'programming',
            '#text': 'Programming'
        });
    });

    it('keys items without an ID by URL, and authors without an ID by login', async function () {
        const path = await writeXml(
            exportXml(
                '<wp:author><wp:author_login>jane</wp:author_login></wp:author><wp:author></wp:author>' +
                    item(null) +
                    item(null, '<link></link><wp:attachment_url>https://cdn.example.com/a.jpg</wp:attachment_url>') +
                    item(null, '<link>mailto:someone@example.com</link>')
            )
        );
        const result = await records(path);
        assert.deepEqual(
            result.filter(record => record.kind !== 'channel').map(record => [record.kind, record.key]),
            [
                ['author', 'login:jane'],
                ['author', undefined],
                ['item', `url:http://example.com/blog/post-null`],
                ['item', 'url:https://cdn.example.com/a.jpg'],
                ['item', undefined]
            ]
        );
    });

    it('rejects exports without an HTTP(S) site URL', async function () {
        await assert.rejects(
            records(await writeXml(exportXml(item('1')).replace(/<link>[^<]*<\/link>/, ''))),
            /export\.xml: Missing Squarespace channel site URL/
        );
        await assert.rejects(
            records(await writeXml(exportXml(item('1'), 'ftp://example.com'))),
            /Squarespace site URLs must use HTTP or HTTPS: ftp:\/\/example\.com/
        );
    });

    it('rejects malformed XML with its location', async function () {
        await assert.rejects(
            records(await writeXml(exportXml('<item><title>A & B</title></item>'))),
            /export\.xml:3:\d+: .*unclosed tag: title/
        );
    });

    it('resolves item URLs against the site', function () {
        assert.equal(sourceUrl('/blog/post', 'https://example.com'), 'https://example.com/blog/post');
        assert.equal(sourceUrl('https://other.example.com/x', ''), 'https://other.example.com/x');
        assert.equal(sourceUrl('/blog/post', ''), undefined);
        assert.equal(sourceUrl('  ', 'https://example.com'), undefined);
        assert.equal(sourceUrl('mailto:a@example.com', 'https://example.com'), undefined);
    });
});

describe('Ingesting a Squarespace export', function () {
    after(cleanUp);

    it('stores the export and finds its site', async function () {
        const context = await ingested();
        try {
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {
                adapter: 'squarespace-xml',
                file: 'sample.xml'
            });
            assert.equal((await all(context.sources.records({kind: 'item'}))).length, 6);
            assert.deepEqual(await sourceSite(context), {url: 'http://example.com', site: 'example.com'});
            assert.deepEqual(events(context, 'source:conflict'), []);
        } finally {
            await context.close();
        }
    });

    it('keeps the newest revision of a repeated item, or else the first, and reports each conflict', async function () {
        const path = await writeXml(
            exportXml(
                item('1', '<title>Old</title><wp:post_modified_gmt>2020-01-01 00:00:00</wp:post_modified_gmt>') +
                    item('1', '<title>New</title><wp:post_modified_gmt>2021-01-01 00:00:00</wp:post_modified_gmt>') +
                    item('1', '<title>Older</title><wp:post_modified>2019-01-01 00:00:00</wp:post_modified>') +
                    item('2', '<title>First</title>') +
                    item('2', '<title>First</title>') +
                    item('2', '<title>Dated</title><wp:post_modified_gmt>2022-01-01 00:00:00</wp:post_modified_gmt>') +
                    '<wp:author><wp:author_id>9</wp:author_id><wp:author_login>a</wp:author_login></wp:author>' +
                    '<wp:author><wp:author_id>9</wp:author_id><wp:author_login>b</wp:author_login></wp:author>' +
                    '<wp:author><wp:author_id>9</wp:author_id><wp:author_login>a</wp:author_login></wp:author>'
            )
        );
        const context = await memoryContext();
        try {
            await ingest(path, context);
            const titles = (await all(context.sources.records({kind: 'item'}))).map(
                record => JSON.parse(record.content).title
            );
            assert.deepEqual(titles, ['New', 'First']);
            assert.equal(JSON.parse(context.sources.get('author', 'id:9')!.content)['wp:author_login'], 'a');
            assert.deepEqual(
                events(context, 'source:conflict').map(event => [event.details.key, event.details.reason]),
                [
                    ['id:1', 'Later record replaced the earlier one'],
                    ['id:1', 'Earlier record retained'],
                    ['id:2', 'Earlier record retained'],
                    ['id:2', 'Earlier record retained'],
                    ['id:9', 'Earlier record retained']
                ]
            );
        } finally {
            await context.close();
        }
    });

    it('requires replace to read again, and keeps the previous data when a read fails', async function () {
        const context = await ingested();
        try {
            await assert.rejects(ingest(SAMPLE, context), /replace/);
            await assert.rejects(ingest(await writeXml('<rss><channel>'), context, {replace: true}));
            assert.equal((await all(context.sources.records({kind: 'item'}))).length, 6);
            await ingest(await writeXml(exportXml(item('1'))), context, {replace: true});
            assert.equal((await all(context.sources.records({kind: 'item'}))).length, 1);
        } finally {
            await context.close();
        }
    });

    it('reports completed data without a site URL', async function () {
        const context = await memoryContext();
        try {
            await context.sources.ingest({}, async stage => {
                stage.put({
                    kind: 'channel',
                    key: 'title:0',
                    content: '"Test"',
                    format: 'json',
                    metadata: {name: 'title'}
                });
            });
            await assert.rejects(sourceSite(context), /Completed Squarespace source data has no site URL/);
        } finally {
            await context.close();
        }
    });
});
