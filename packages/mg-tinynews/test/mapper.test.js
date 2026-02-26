import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import {createRequire} from 'node:module';
import {mapPostPageConfig} from '../lib/mapper.js';

const require = createRequire(import.meta.url);
const articlesFixture = require('./fixtures/articles.json');
const authorSingleFixture = require('./fixtures/author-single.json');
const authorMultipleFixture = require('./fixtures/author-multiple.json');

const MockLogger = {
    warn: mock.fn()
};

describe('mapPostPageConfig', function () {
    it('Can process posts', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[0],
            authorsData: {},
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        assert.ok('url' in mapped);
        assert.ok('data' in mapped);
        assert.equal(mapped.url, 'https://demo-site.example.com/articles/testing/all-embeds-and-formatting');

        // The minimum required keys for a successful migration
        for (const key of ['slug', 'published_at', 'updated_at', 'created_at', 'title', 'type', 'html', 'status', 'og_title', 'og_description', 'twitter_title', 'twitter_description', 'meta_title', 'meta_description', 'custom_excerpt', 'visibility', 'feature_image', 'feature_image_alt', 'feature_image_caption', 'tags', 'author']) {
            assert.ok(key in mapped.data);
        }

        assert.equal(mapped.data.slug, 'all-embeds-and-formatting');
        assert.equal(mapped.data.published_at, '2023-03-24T19:45:24.257025+00:00');
        assert.equal(mapped.data.updated_at, '2023-03-24T19:55:47.250157+00:00');
        assert.equal(mapped.data.created_at, '2023-03-24T19:45:24.257025+00:00');
        assert.equal(mapped.data.title, 'All embeds and Formatting');
        assert.equal(mapped.data.type, 'post');
        assert.equal(mapped.data.html, '<p>Example text </p>');
        assert.equal(mapped.data.status, 'published');
        assert.equal(mapped.data.og_title, 'FB Title - All Embeds and Formatting');
        assert.equal(mapped.data.og_description, 'FB desc - An article that shows Google Docs integration elements');
        assert.equal(mapped.data.twitter_title, 'TW Title - All Embeds and Formatting');
        assert.equal(mapped.data.twitter_description, 'TW desc - An article that shows Google Docs integration elements');
        assert.equal(mapped.data.meta_title, 'All embeds and Formatting');
        assert.equal(mapped.data.meta_description, 'An article that shows Google Docs integration elements');
        assert.equal(mapped.data.custom_excerpt, 'An article that shows Google Docs integration elements');
        assert.equal(mapped.data.visibility, 'public');
        assert.equal(mapped.data.feature_image, 'https://assets.example.com/demo-site/all-embeds-and-formatting/imagekix.mpef3nc309qu.jpg');
        assert.equal(mapped.data.feature_image_alt, 'Featured image. Alt text is also the caption');
        assert.equal(mapped.data.feature_image_caption, 'Featured image. Alt text is also the caption');

        assert.equal(mapped.data.tags.length, 5);
        assert.ok('url' in mapped.data.tags[0]);
        assert.ok('data' in mapped.data.tags[0]);
        assert.ok('slug' in mapped.data.tags[0].data);
        assert.ok('name' in mapped.data.tags[0].data);

        assert.equal(mapped.data.tags[0].url, '/tag/test');
        assert.equal(mapped.data.tags[0].data.slug, 'test');
        assert.equal(mapped.data.tags[0].data.name, 'test');

        assert.equal(mapped.data.tags[1].url, '/tag/embeds');
        assert.equal(mapped.data.tags[1].data.slug, 'embeds');
        assert.equal(mapped.data.tags[1].data.name, 'embeds');

        assert.equal(mapped.data.tags[2].url, '/tag/images');
        assert.equal(mapped.data.tags[2].data.slug, 'images');
        assert.equal(mapped.data.tags[2].data.name, 'Images');

        assert.equal(mapped.data.tags[3].url, '/tag/testing');
        assert.equal(mapped.data.tags[3].data.slug, 'testing');
        assert.equal(mapped.data.tags[3].data.name, 'Testing');

        assert.equal(mapped.data.tags[4].url, 'migrator-added-tag');
        assert.equal(mapped.data.tags[4].data.slug, 'hash-tinynews');
        assert.equal(mapped.data.tags[4].data.name, '#tinynews');

        assert.ok('url' in mapped.data.author);
        assert.ok('data' in mapped.data.author);
        assert.equal(mapped.data.author.url, '/author/dolor-simet');
        assert.equal(mapped.data.author.data.slug, 'dolor-simet');
        assert.equal(mapped.data.author.data.name, 'Dolor Simet');
        assert.equal(mapped.data.author.data.email, 'dolor-simet@example.com');
    });

    it('Uses author in authors JSON file is only one present & post has no authors array', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[1],
            authorsData: authorSingleFixture,
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        assert.ok('url' in mapped.data.author);
        assert.ok('data' in mapped.data.author);
        assert.equal(mapped.data.author.url, '/author/lorem-ipsum');
        assert.equal(mapped.data.author.data.slug, 'lorem-ipsum');
        assert.equal(mapped.data.author.data.name, 'Lorem Ipsum');
        assert.equal(mapped.data.author.data.email, 'lorem@ipsum.com');
        assert.equal(mapped.data.author.data.profile_image, 'https://example.com/lorem.jpg');
        assert.equal(mapped.data.author.data.bio, 'Lorem ipsum dolor simet');
    });

    it('Enriches author data is more is available in authorsData', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[2],
            authorsData: authorMultipleFixture,
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        assert.ok('url' in mapped.data.author);
        assert.ok('data' in mapped.data.author);
        assert.equal(mapped.data.author.url, '/author/dolor-simet');
        assert.equal(mapped.data.author.data.slug, 'dolor-simet');
        assert.equal(mapped.data.author.data.name, 'Dolor Simet');
        assert.equal(mapped.data.author.data.email, 'dolor@simet.com');
        assert.equal(mapped.data.author.data.profile_image, 'https://example.com/dolor.jpg');
        assert.equal(mapped.data.author.data.bio, 'Lorem ipsum dolor simet');
    });

    it('Falls back to default author is none supplied', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[1],
            authorsData: {},
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        assert.ok('url' in mapped.data.author);
        assert.ok('data' in mapped.data.author);
        assert.equal(mapped.data.author.url, '/author/author');
        assert.equal(mapped.data.author.data.slug, 'author');
        assert.equal(mapped.data.author.data.name, 'Author');
        assert.equal(mapped.data.author.data.email, 'author@example.com');
    });

    it('Can process pages', function () {});

    it('Can process newsletters', function () {});

    it('Can read author info', function () {});
});
