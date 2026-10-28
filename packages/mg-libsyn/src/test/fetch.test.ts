import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import nock from 'nock';
import {feedUrl, itemKey, parse, siteUrl} from '../index.js';
import {FEED, SITE, all, feedXml, fixtureChannel, fixtureItems, itemXml, serve} from './helpers.js';

describe('Fetching a Libsyn feed', function () {
    beforeEach(() => nock.disableNetConnect());
    afterEach(() => {
        nock.cleanAll();
        nock.enableNetConnect();
    });

    it('builds the feed URL from the site URL', function () {
        assert.equal(feedUrl('https://example.com'), `${SITE}/rss/?include-libsyn-metadata=true`);
        assert.equal(feedUrl(' https://example.com/show/ '), `${SITE}/show/rss/?include-libsyn-metadata=true`);
        assert.equal(siteUrl('http://example.com').protocol, 'http:');
        for (const value of ['example.com', 'ftp://example.com', '', null]) {
            assert.throws(() => siteUrl(value), /--url/);
        }
    });

    it('keys items by GUID, then link', function () {
        assert.equal(itemKey({guid: {'@_isPermaLink': 'false', '#text': ' abc '}, link: 'x'}), 'guid:abc');
        assert.equal(itemKey({link: ' https://example.com/1.mp3 '}), 'link:https://example.com/1.mp3');
        assert.equal(itemKey({guid: '', title: 'No key'}), null);
    });

    it('streams the fixture feed into the records xmlUtils.parseXml() would read', async function () {
        const requests = serve(FEED);
        const records = await all(parse(SITE));
        assert.deepEqual(requests, [`${SITE}/rss/?include-libsyn-metadata=true`]);

        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format]),
            [
                ['item', 'guid:abcd1234-f43c-407f-b3d7-01245e0e890f', 'json'],
                ['item', 'guid:abcd1234-07cb-40fb-8726-8e48d8368d94', 'json'],
                ['channel', 'channel', 'json']
            ]
        );
        assert.deepEqual(
            records.slice(0, 2).map(record => JSON.parse(record.content)),
            fixtureItems()
        );
        assert.deepEqual(records[0].metadata, {line: 46, column: 14});
        assert.deepEqual(JSON.parse(records[2].content), fixtureChannel());
        assert.deepEqual(records[2].metadata, {feed: `${SITE}/rss/?include-libsyn-metadata=true`});
    });

    it('collects repeated channel elements in order', async function () {
        serve(
            feedXml([itemXml('1')], '<itunes:category text="A"/><itunes:category text="B"/><itunes:category text="C"/>')
        );
        const records = await all(parse(SITE));
        assert.deepEqual(JSON.parse(records[1].content), {
            'itunes:category': [{'@_text': 'A'}, {'@_text': 'B'}, {'@_text': 'C'}]
        });
    });

    it('fails when the feed cannot be fetched or read', async function () {
        serve('Not found', 404);
        await assert.rejects(all(parse(SITE)), /Could not fetch the Libsyn feed .+: 404/);

        nock(SITE).get('/rss/').query(true).replyWithError('socket hang up');
        await assert.rejects(all(parse(SITE)), /Could not fetch the Libsyn feed https:\/\/example\.com\/rss\//);

        serve('<html><body>Not a feed</body></html>');
        await assert.rejects(all(parse(SITE)), /is not an RSS feed with a channel/);

        serve('', 204);
        await assert.rejects(all(parse(SITE)), /must contain a root element/);

        serve('<rss><channel><item><title>Broken</item></channel></rss>');
        await assert.rejects(all(parse(SITE)), /include-libsyn-metadata=true:1:\d+:/);

        await assert.rejects(all(parse('example.com')), /--url/);
    });
});
