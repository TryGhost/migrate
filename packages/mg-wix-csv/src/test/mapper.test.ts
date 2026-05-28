import {URL} from 'node:url';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {join} from 'node:path';
import {
    buildPostUrl,
    createAuthor,
    createSlug,
    mapContent,
    mapPost,
    mapTags,
    parseBoolean,
    parseDate,
    parseIdArray,
    parsePostsCSV,
    uniqueIds
} from '../lib/mapper.js';
import wixCSVIngest from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('Wix CSV mapper', () => {
    it('parses CSV files and maps posts', async () => {
        const parsed = await parsePostsCSV({pathToFile: join(fixturesPath, 'posts.csv')});
        assert.equal(parsed.length, 2);

        const result = await mapContent({
            options: {
                posts: join(fixturesPath, 'posts.csv'),
                url: 'https://example.com'
            }
        });

        if (!('posts' in result)) {
            throw result;
        }

        assert.equal(result.posts.length, 2);
        assert.equal(result.posts[0].url, 'https://example.com/post/hello-wix');
        assert.equal(result.posts[0].data.slug, 'hello-wix');
        assert.equal(result.posts[0].data.comment_id, 'internal-1');
        assert.equal(result.posts[0].data.published_at?.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(result.posts[0].data.updated_at?.toISOString(), '2025-10-02T10:00:00.000Z');
        assert.equal(result.posts[0].data.created_at.toISOString(), '2025-10-01T10:00:00.000Z');
        assert.equal(result.posts[0].data.title, 'Hello Wix');
        assert.equal(result.posts[0].data.status, 'published');
        assert.equal(result.posts[0].data.custom_excerpt, 'Custom excerpt');
        assert.equal(result.posts[0].data.plaintext, 'Plain text fallback');
        assert.equal(result.posts[0].data.featured, true);
        assert.match(result.posts[0].data.feature_image || '', /static\.wixstatic\.com/);
        assert.equal(result.posts[0].data.author.data.email, 'jane-writer@example.com');
        assert.deepEqual(result.posts[0].data.tags.map((tag: tagsObject) => tag.data), [
            {slug: 'market-news', name: 'Market News'},
            {slug: 'tax-planning', name: 'Tax Planning'},
            {slug: 'tag-id', name: 'tag-id'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.equal(result.posts[0].data.html, '<p>Hello <strong>world</strong></p>');

        assert.equal(result.posts[1].url, 'https://example.com/post/draft-wix');
        assert.equal(result.posts[1].data.slug, 'draft-wix');
        assert.equal(result.posts[1].data.status, 'draft');
        assert.equal(result.posts[1].data.author.data.name, 'Author');
        assert.equal(result.posts[1].data.feature_image, undefined);
        assert.match(result.posts[1].data.html, /Draft plain/);

        const indexResult = await wixCSVIngest({
            options: {
                posts: join(fixturesPath, 'posts.csv'),
                url: 'https://example.com'
            }
        });
        assert.equal('posts' in indexResult, true);
    });

    it('maps helper edge cases', () => {
        assert.equal(parseDate('nope'), null);
        assert.equal(parseDate(), null);
        assert.equal(parseBoolean('TRUE'), true);
        assert.equal(parseBoolean('false'), false);
        assert.deepEqual(parseIdArray('["a",1,"b"]'), ['a', 'b']);
        assert.deepEqual(parseIdArray('{"x":1}'), []);
        assert.deepEqual(parseIdArray('bad'), ['bad']);
        assert.deepEqual(parseIdArray('  Plain Category  '), ['Plain Category']);
        assert.deepEqual(parseIdArray(), []);
        assert.deepEqual(parseIdArray('  '), []);
        assert.deepEqual(uniqueIds(['a', 'a', '', 'b']), ['a', 'b']);
        assert.equal(buildPostUrl({path: '/post/one'}), '/post/one');
        assert.equal(buildPostUrl({url: 'https://example.com', path: 'post/one'}), 'https://example.com/post/one');
        assert.equal(buildPostUrl({url: 'https://example.com', path: 'https://other.com/post'}), 'https://other.com/post');
        assert.equal(createSlug({title: 'Hello World'}), 'hello-world');
        assert.equal(createSlug({slug: 'Custom Slug'}), 'custom-slug');
        assert.equal(createAuthor({defaultAuthorName: 'Default Person'}).data.email, 'default-person@example.com');
        assert.deepEqual(mapTags({'Main Category': 'Tax Planning', Categories: '["68504d7f15587afbbe9179de","id"]', Tags: '["id"]'}).map((tag: tagsObject) => tag.data), [
            {slug: 'tax-planning', name: 'Tax Planning'},
            {slug: 'id', name: 'id'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.deepEqual(mapTags({'Main Category': 'Tax Planning', Categories: 'Another Category', Tags: 'Tag Name'}).map((tag: tagsObject) => tag.data), [
            {slug: 'tax-planning', name: 'Tax Planning'},
            {slug: 'another-category', name: 'Another Category'},
            {slug: 'tag-name', name: 'Tag Name'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.deepEqual(mapTags({'Main Category': '68504d7f15587afbbe9179de', Categories: '["68504d7f15587afbbe9179de","id"]', Tags: '[]'}).map((tag: tagsObject) => tag.data), [
            {slug: '68504d7f15587afbbe9179de', name: '68504d7f15587afbbe9179de'},
            {slug: 'id', name: 'id'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.deepEqual(mapTags({'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'}, {
            includeMainCategory: false
        }).map((tag: tagsObject) => tag.data), [
            {slug: 'category-name', name: 'Category Name'},
            {slug: 'tag-name', name: 'Tag Name'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.deepEqual(mapTags({'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'}, {
            includeCategories: false,
            includeTags: false
        }).map((tag: tagsObject) => tag.data), [
            {slug: 'tax-planning', name: 'Tax Planning'},
            {slug: 'hash-wix', name: '#wix'}
        ]);
        assert.deepEqual(mapTags({'Main Category': 'Tax Planning', Categories: 'Category Name', Tags: 'Tag Name'}, {
            includeMainCategory: false,
            includeCategories: false,
            includeTags: false
        }).map((tag: tagsObject) => tag.data), [
            {slug: 'hash-wix', name: '#wix'}
        ]);
    });

    it('maps a minimal draft post', () => {
        const mapped = mapPost({
            postData: {
                Title: '',
                Slug: '',
                'Post Page URL': '',
                'Internal ID': '',
                'Rich Content': '{"nodes":[]}'
            },
            options: {
                defaultAuthorName: 'Fallback Author'
            }
        });

        assert.equal(mapped.url, '');
        assert.equal(mapped.data.slug, 'untitled');
        assert.equal(mapped.data.title, 'untitled');
        assert.equal(mapped.data.comment_id, null);
        assert.equal(mapped.data.published_at, null);
        assert.equal(mapped.data.updated_at, null);
        assert.equal(mapped.data.status, 'draft');
        assert.equal(mapped.data.custom_excerpt, null);
        assert.equal(mapped.data.plaintext, null);
        assert.equal(mapped.data.author.data.name, 'Fallback Author');
    });

    it('throws a NoContentError for empty CSV files', async () => {
        await assert.rejects(mapContent({
            options: {
                posts: join(fixturesPath, 'empty.csv')
            }
        }), {
            message: 'Input file is empty'
        });
    });
});
