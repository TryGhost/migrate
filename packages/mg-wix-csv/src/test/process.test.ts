import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    WIX_TAG,
    authorName,
    buildPostUrl,
    createSlug,
    parse,
    parseBoolean,
    parseDate,
    parseIdArray,
    processRow,
    rowTags,
    uniqueIds
} from '../index.js';
import {FIXTURE, SITE, all} from './helpers.js';

const pairs = (tags: {name: string; slug: string}[]) => tags.map(tag => ({slug: tag.slug, name: tag.name}));

describe('Wix CSV row processing', () => {
    it('converts the fixture rows to post fields', async () => {
        const rows = (await all(parse(FIXTURE))).map(record => JSON.parse(record.content));
        assert.equal(rows.length, 2);
        const [first, second] = rows.map(row => processRow(row, {url: SITE}));

        assert.equal(first.url, 'https://example.com/post/hello-wix');
        assert.equal(first.fields.slug, 'hello-wix');
        assert.equal(first.fields.comment_id, 'internal-1');
        assert.equal(first.published?.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(first.lastPublished?.toISOString(), '2025-10-02T10:00:00.000Z');
        assert.equal(first.fields.title, 'Hello Wix');
        assert.equal(first.fields.type, 'post');
        assert.equal(first.fields.status, 'published');
        assert.equal(first.fields.visibility, 'public');
        assert.equal(first.fields.custom_excerpt, 'Custom excerpt');
        assert.equal(first.fields.plaintext, 'Plain text fallback');
        assert.equal(first.fields.featured, true);
        assert.equal(first.fields.feature_image, 'https://static.wixstatic.com/media/example_media_image~mv2.jpg');
        assert.equal(first.author, 'Jane Writer');
        assert.deepEqual(pairs(first.tags), [
            {slug: 'market-news', name: 'Market News'},
            {slug: 'tax-planning', name: 'Tax Planning'},
            {slug: 'tag-id', name: 'tag-id'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.equal(first.fields.html, '<p>Hello <strong>world</strong></p>');

        assert.equal(second.url, 'https://example.com/post/draft-wix');
        assert.equal(second.fields.slug, 'draft-wix');
        assert.equal(second.fields.status, 'draft');
        assert.equal(second.published, null);
        assert.equal(second.lastPublished, null);
        assert.equal(second.author, 'Author');
        assert.equal(second.fields.feature_image, null);
        assert.match(second.fields.html, /Draft plain/);
    });

    it('reads Wix dates, treating zoneless timestamps as UTC', () => {
        assert.equal(parseDate('2025-10-01T10:00:00Z')?.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(parseDate('2025-10-01T10:00:00')?.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(parseDate(' 2025-10-01 10:00:00.5 ')?.toISOString(), '2025-10-01T10:00:00.500Z');
        assert.equal(parseDate('2025-10-01T10:00')?.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(parseDate('2025-10-01T10:00:00+02:00')?.toISOString(), '2025-10-01T08:00:00.000Z');
        assert.equal(parseDate('2025-10-01')?.toISOString(), '2025-10-01T00:00:00.000Z');
        assert.equal(parseDate('nope'), null);
        assert.equal(parseDate('  '), null);
        assert.equal(parseDate(null), null);
        assert.equal(parseDate(), null);
    });

    it('maps helper edge cases', () => {
        assert.equal(parseBoolean('TRUE'), true);
        assert.equal(parseBoolean('false'), false);
        assert.equal(parseBoolean(), false);
        assert.deepEqual(parseIdArray('["a",1,"b"]'), ['a', 'b']);
        assert.deepEqual(parseIdArray('{"x":1}'), []);
        assert.deepEqual(parseIdArray('bad'), ['bad']);
        assert.deepEqual(parseIdArray('  Plain Category  '), ['Plain Category']);
        assert.deepEqual(parseIdArray(), []);
        assert.deepEqual(parseIdArray('  '), []);
        assert.deepEqual(uniqueIds(['a', 'a', '', 'b']), ['a', 'b']);
        assert.equal(buildPostUrl({path: '/post/one'}), '/post/one');
        assert.equal(buildPostUrl({url: SITE}), '');
        assert.equal(buildPostUrl({url: 'https://example.com', path: 'post/one'}), 'https://example.com/post/one');
        assert.equal(
            buildPostUrl({url: 'https://example.com', path: 'https://other.com/post'}),
            'https://other.com/post'
        );
        assert.equal(createSlug({title: 'Hello World'}), 'hello-world');
        assert.equal(createSlug({slug: 'Custom Slug'}), 'custom-slug');
        assert.equal(createSlug({slug: '🎉', title: 'Party'}), 'party');
        assert.equal(createSlug({title: '🎉'}), 'untitled');
        assert.equal(createSlug({}), 'untitled');
        assert.equal(authorName({}, {defaultAuthorName: ' Default Person '}), 'Default Person');
        assert.equal(authorName({Author: ' '}, {}), 'Author');
        assert.equal(authorName({Author: 'Jane'}), 'Jane');
        assert.deepEqual(rowTags({}), [WIX_TAG]);
        assert.deepEqual(
            pairs(
                rowTags({
                    'Main Category': 'Tax Planning',
                    Categories: '["68504d7f15587afbbe9179de","id"]',
                    Tags: '["id"]'
                })
            ),
            [
                {slug: 'tax-planning', name: 'Tax Planning'},
                {slug: 'id', name: 'id'},
                {slug: 'hash-wix', name: '#wix'}
            ]
        );
        assert.deepEqual(
            pairs(rowTags({'Main Category': 'Tax Planning', Categories: 'Another Category', Tags: 'Tag Name'})),
            [
                {slug: 'tax-planning', name: 'Tax Planning'},
                {slug: 'another-category', name: 'Another Category'},
                {slug: 'tag-name', name: 'Tag Name'},
                {slug: 'hash-wix', name: '#wix'}
            ]
        );
        assert.deepEqual(
            pairs(
                rowTags({
                    'Main Category': '68504d7f15587afbbe9179de',
                    Categories: '["68504d7f15587afbbe9179de","id"]',
                    Tags: '[]'
                })
            ),
            [
                {slug: '68504d7f15587afbbe9179de', name: '68504d7f15587afbbe9179de'},
                {slug: 'id', name: 'id'},
                {slug: 'hash-wix', name: '#wix'}
            ]
        );
        assert.deepEqual(
            pairs(
                rowTags(
                    {'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'},
                    {includeMainCategory: false}
                )
            ),
            [
                {slug: 'category-name', name: 'Category Name'},
                {slug: 'tag-name', name: 'Tag Name'},
                {slug: 'hash-wix', name: '#wix'}
            ]
        );
        assert.deepEqual(
            pairs(
                rowTags(
                    {'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'},
                    {includeCategories: false, includeTags: false}
                )
            ),
            [
                {slug: 'tax-planning', name: 'Tax Planning'},
                {slug: 'hash-wix', name: '#wix'}
            ]
        );
        assert.deepEqual(
            pairs(
                rowTags(
                    {'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'},
                    {includeMainCategory: false, includeCategories: false, includeTags: false}
                )
            ),
            [{slug: 'hash-wix', name: '#wix'}]
        );
    });

    it('maps a minimal draft row', () => {
        const processed = processRow(
            {
                Title: '',
                Slug: '',
                'Post Page URL': '',
                'Internal ID': '',
                'Rich Content': '{"nodes":[]}'
            },
            {defaultAuthorName: 'Fallback Author'}
        );

        assert.equal(processed.url, '');
        assert.equal(processed.fields.slug, 'untitled');
        assert.equal(processed.fields.title, 'untitled');
        assert.equal(processed.fields.comment_id, null);
        assert.equal(processed.published, null);
        assert.equal(processed.lastPublished, null);
        assert.equal(processed.fields.status, 'draft');
        assert.equal(processed.fields.custom_excerpt, null);
        assert.equal(processed.fields.plaintext, null);
        assert.equal(processed.author, 'Fallback Author');
        assert.equal(processRow({}).author, 'Author');

        // A Published Date that cannot be read still marks the row as published.
        const unreadable = processRow({'Published Date': 'yesterday'});
        assert.equal(unreadable.fields.status, 'published');
        assert.equal(unreadable.published, null);
    });
});
