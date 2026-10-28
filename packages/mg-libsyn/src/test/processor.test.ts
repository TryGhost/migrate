import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    durationToSeconds,
    getAttribute,
    getChild,
    getText,
    parseDate,
    processChannel,
    processContent,
    processPost
} from '../index.js';
import type {LibsynItem} from '../index.js';
import {fixtureChannel, fixtureItems} from './helpers.js';

const EMBED =
    '<!--kg-card-begin: html--><iframe id="embed_12345678" title="Lorem Ipsum" style="border: none" src="//html5-player.libsyn.com/embed/episode/id/12345678/custom-color/000000/" height="90" width="100%" scrolling="no" allowfullscreen webkitallowfullscreen mozallowfullscreen oallowfullscreen msallowfullscreen></iframe><!--kg-card-end: html-->';

const fixtureItem = (values: Partial<LibsynItem> = {}): LibsynItem => ({...fixtureItems()[0], ...values});

const tagNames = (item: LibsynItem, options: Parameters<typeof processPost>[1]) =>
    processPost(item, options).tags.map(tag => [tag.name, tag.slug]);

describe('durationToSeconds', function () {
    it('Minutes with no seconds', function () {
        assert.equal(durationToSeconds('1'), 60);
    });

    it('Minutes with seconds', function () {
        assert.equal(durationToSeconds('1:00'), 60);
    });

    it('Minutes with seconds & leading zero', function () {
        assert.equal(durationToSeconds('01:00'), 60);
    });

    it('2 character minutes with seconds', function () {
        assert.equal(durationToSeconds('10:00'), 600);
    });

    it('1 character minutes with seconds', function () {
        assert.equal(durationToSeconds('1:23'), 83);
    });

    it('2 character minutes with odd seconds', function () {
        assert.equal(durationToSeconds('12:34'), 754);
    });

    it('Hours, minutes and seconds', function () {
        assert.equal(durationToSeconds('01:02:03'), 3723);
        assert.equal(durationToSeconds('00:24:51'), 1491);
    });

    it('Missing or invalid durations', function () {
        for (const value of ['', ' ', 'abc', '1:2:3:4', '1:-2', '1.5']) {
            assert.equal(durationToSeconds(value), 0, value);
        }
    });
});

describe('parseDate', function () {
    const iso = (value: string) => parseDate(value)?.toISOString() ?? null;

    it('reads RFC 2822 dates with numeric zones', function () {
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 +0000'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 -0500'), '2020-08-10T12:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 +0530'), '2020-08-10T01:30:00.000Z');
        assert.equal(iso(' 1 aug 2020 7:05 +0000 '), '2020-08-01T07:05:00.000Z');
    });

    it('reads named and military zones, and dates without a zone as UTC', function () {
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 GMT'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 UT'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 EST'), '2020-08-10T12:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 pdt'), '2020-08-10T14:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 Z'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00 A'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('Mon, 10 Aug 2020 07:00:00'), '2020-08-10T07:00:00.000Z');
    });

    it('reads two-digit years as 1950 to 2049', function () {
        assert.equal(iso('10 Aug 20 07:00:00 +0000'), '2020-08-10T07:00:00.000Z');
        assert.equal(iso('10 Aug 99 07:00:00 +0000'), '1999-08-10T07:00:00.000Z');
    });

    it('rejects anything else', function () {
        for (const value of [
            '',
            'never',
            '2020-08-10T07:00:00Z',
            'Mon, 10 Foo 2020 07:00:00 +0000',
            'Mon, 31 Feb 2020 07:00:00 +0000',
            'Mon, 10 Aug 2020 24:00:00 +0000',
            'Mon, 10 Aug 2020 07:60:00 +0000',
            'Mon, 10 Aug 2020 07:00:61 +0000',
            'Mon, 10 Aug 2020 07:00:00 +0060',
            'Mon, 10 Aug 2020 07:00:00 XYZ'
        ]) {
            assert.equal(parseDate(value), null, value);
        }
    });
});

describe('XML values', function () {
    it('reads text, children and attributes from strings, elements and repeated elements', function () {
        assert.equal(getText('text'), 'text');
        assert.equal(getText({'#text': 'text', '@_a': 'b'}), 'text');
        assert.equal(getText({'@_a': 'b'}), '');
        assert.equal(getText(['first', 'second']), 'first');
        assert.equal(getText(undefined), '');
        assert.equal(getChild([{name: 'first'}, {name: 'second'}], 'name'), 'first');
        assert.equal(getChild('text', 'name'), undefined);
        assert.equal(getAttribute({'@_href': 'https://example.com/'}, 'href'), 'https://example.com/');
        assert.equal(getAttribute(undefined, 'href'), '');
    });
});

describe('Process posts', function () {
    it('Post has required fields', function () {
        const post = processPost(fixtureItem());
        assert.equal(post.title, 'Lorem Ipsum');
        assert.equal(post.slug, 'lorem-ipsum');
        assert.equal(post.html, `${EMBED}<p>Description</p>`);
        assert.deepEqual(post.tags, [
            {name: 'exmaple', slug: 'exmaple'},
            {name: 'keywords', slug: 'keywords'},
            {name: '#libsyn', slug: 'hash-libsyn'}
        ]);
    });

    it('Falls back to the iTunes title', function () {
        const post = processPost(fixtureItem({title: ' ', 'itunes:title': 'iTunes title'}));
        assert.equal(post.title, 'iTunes title');
        assert.equal(post.slug, 'itunes-title');
        assert.equal(processPost(fixtureItem({title: undefined, 'itunes:title': undefined})).slug, '');
    });

    it('Can add a tag', function () {
        assert.deepEqual(tagNames(fixtureItem(), {useItemKeywords: false, addTag: 'My Podcast'}), [
            ['My Podcast', 'my-podcast'],
            ['#libsyn', 'hash-libsyn']
        ]);
    });

    it('Can use feed categories', function () {
        assert.deepEqual(
            tagNames(fixtureItem(), {
                useItemKeywords: false,
                addTag: 'My Podcast',
                categories: ['Lorem', 'Ipsum', 'dolor']
            }),
            [
                ['My Podcast', 'my-podcast'],
                ['Lorem', 'lorem'],
                ['Ipsum', 'ipsum'],
                ['dolor', 'dolor'],
                ['#libsyn', 'hash-libsyn']
            ]
        );
    });

    it('Can use item keywords', function () {
        assert.deepEqual(tagNames(fixtureItem(), {useItemKeywords: true, addTag: 'My Podcast'}), [
            ['My Podcast', 'my-podcast'],
            ['exmaple', 'exmaple'],
            ['keywords', 'keywords'],
            ['#libsyn', 'hash-libsyn']
        ]);
    });

    it('Keeps one tag per slug, drops empty names and puts internal tags last', function () {
        const item = fixtureItem({'itunes:keywords': ' Business , #Internal,,business, !!, #libsyn'});
        assert.deepEqual(tagNames(item, {addTag: 'Business', categories: ['Careers', '']}), [
            ['Business', 'business'],
            ['Careers', 'careers'],
            ['#Internal', 'hash-internal'],
            ['#libsyn', 'hash-libsyn']
        ]);
        assert.deepEqual(tagNames(fixtureItem({'itunes:keywords': undefined}), {}), [['#libsyn', 'hash-libsyn']]);
    });
});

describe('Process content', function () {
    it('Remove empty p tags', function () {
        assert.equal(processContent(fixtureItem()), `${EMBED}<p>Description</p>`);
        assert.equal(
            processContent(fixtureItem({description: '<p>&nbsp;</p><p>​</p><p> </p><p>Kept</p>'})),
            `${EMBED}<p>Kept</p>`
        );
    });

    it('Use Libsyn embeds', function () {
        const html = processContent(fixtureItem(), {useEmbed: true});
        assert.ok(html.includes(`${EMBED}<p>Description</p>`));
        assert.ok(!html.includes('<div class="kg-card kg-audio-card">'));
    });

    it('Escapes the title in the embed', function () {
        const html = processContent(fixtureItem({title: 'Tom & "Jerry" <live>'}));
        assert.ok(html.includes('title="Tom &amp; &quot;Jerry&quot; &lt;live&gt;"'), html);
    });

    it('Use Audio cards', function () {
        const html = processContent(fixtureItem(), {useEmbed: false});

        assert.ok(html.includes('<div class="kg-card kg-audio-card">'));
        assert.ok(
            html.includes('<img src="https://ssl-static.libsyn.com/p/assets/1/9/0/c/abcd123434a5734c/cover.jpg"')
        );
        assert.ok(html.includes('<div class="kg-audio-player-container"'));
        assert.ok(html.includes('<audio src="https://traffic.libsyn.com/secure/exampleshow/lorem-ipsum.mp3"'));
        assert.ok(html.includes('<span class="kg-audio-duration">24:51</span>'));
        assert.ok(!html.includes(EMBED));
    });

    it('Uses an audio card with the enclosure and feed image when the item has no Libsyn ID, link or image', function () {
        const html = processContent(
            fixtureItem({
                'libsyn:itemId': undefined,
                link: undefined,
                'itunes:image': undefined,
                description: undefined,
                'content:encoded': '<p>Encoded</p>'
            }),
            {image: 'https://example.com/feed.jpg'}
        );
        assert.ok(html.includes('<img src="https://example.com/feed.jpg"'), html);
        assert.ok(
            html.includes('<audio src="https://traffic.libsyn.com/secure/exampleshow/lorem-ipsum.mp3?dest-id=123456"'),
            html
        );
        assert.ok(html.endsWith('<p>Encoded</p>'));
    });

    it('Unwraps regular-weight spans and keeps text with empty quotes', function () {
        const html = processContent(
            fixtureItem({description: '<p><span style="font-weight: 400;"> Text a="" </span></p>'})
        );
        assert.equal(html, `${EMBED}<p>Text a=""</p>`);
    });

    it('Wraps nested lists in one HTML card', function () {
        const html = processContent(
            fixtureItem({description: '<ul><li>One<ul><li>Two<ol><li>Three</li></ol></li></ul></li></ul>'})
        );
        assert.equal(
            html,
            `${EMBED}<!--kg-card-begin: html--><ul><li>One<ul><li>Two<ol><li>Three</li></ol></li></ul></li></ul><!--kg-card-end: html-->`
        );
    });
});

describe('Process channel', function () {
    it('reads the owner, categories and image of the fixture', function () {
        assert.deepEqual(processChannel(fixtureChannel()), {
            author: {name: 'Example User', email: 'person@example.com'},
            categories: ['Business', 'Careers', 'Education', 'Self-Improvement'],
            image: 'https://ssl-static.libsyn.com/p/assets/1/9/0/c/abcd123434a5734c/cover.jpg'
        });
    });

    it('falls back to the iTunes author and the RSS image', function () {
        assert.deepEqual(
            processChannel({
                'itunes:author': 'Host',
                'itunes:category': {'@_text': 'Arts', 'itunes:category': [{'@_text': 'Books'}, {'@_text': 'Design'}]},
                image: {url: 'https://example.com/image.jpg'}
            }),
            {
                author: {name: 'Host', email: null},
                categories: ['Arts', 'Books', 'Design'],
                image: 'https://example.com/image.jpg'
            }
        );
        assert.deepEqual(processChannel({}), {author: null, categories: [], image: ''});
    });
});
