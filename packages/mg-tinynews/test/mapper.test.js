import {jest} from '@jest/globals';
import {mapPostPageConfig} from '../lib/mapper.js';
import articlesFixture from './fixtures/articles.json';
import authorSingleFixture from './fixtures/author-single.json';
import authorMultipleFixture from './fixtures/author-multiple.json';

const MockLogger = {
    warn: jest.fn()
};

describe('mapPostPageConfig', function () {
    test('Can process posts', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[0],
            authorsData: {},
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        expect(mapped).toContainAllKeys(['url', 'data']);
        expect(mapped.url).toEqual('https://demo-site.example.com/articles/testing/all-embeds-and-formatting');

        // The minimum required keys for a successful migration
        expect(mapped.data).toContainKeys(['slug', 'published_at', 'updated_at', 'created_at', 'title', 'type', 'html', 'status', 'og_title', 'og_description', 'twitter_title', 'twitter_description', 'meta_title', 'meta_description', 'custom_excerpt', 'visibility', 'feature_image', 'feature_image_alt', 'feature_image_caption', 'tags', 'author']);

        expect(mapped.data.slug).toEqual('all-embeds-and-formatting');
        expect(mapped.data.published_at).toEqual('2023-03-24T19:45:24.257025+00:00');
        expect(mapped.data.updated_at).toEqual('2023-03-24T19:55:47.250157+00:00');
        expect(mapped.data.created_at).toEqual('2023-03-24T19:45:24.257025+00:00');
        expect(mapped.data.title).toEqual('All embeds and Formatting');
        expect(mapped.data.type).toEqual('post');
        expect(mapped.data.html).toEqual('<p>Example text </p>');
        expect(mapped.data.status).toEqual('published');
        expect(mapped.data.og_title).toEqual('FB Title - All Embeds and Formatting');
        expect(mapped.data.og_description).toEqual('FB desc - An article that shows Google Docs integration elements');
        expect(mapped.data.twitter_title).toEqual('TW Title - All Embeds and Formatting');
        expect(mapped.data.twitter_description).toEqual('TW desc - An article that shows Google Docs integration elements');
        expect(mapped.data.meta_title).toEqual('All embeds and Formatting');
        expect(mapped.data.meta_description).toEqual('An article that shows Google Docs integration elements');
        expect(mapped.data.custom_excerpt).toEqual('An article that shows Google Docs integration elements');
        expect(mapped.data.visibility).toEqual('public');
        expect(mapped.data.feature_image).toEqual('https://assets.example.com/demo-site/all-embeds-and-formatting/imagekix.mpef3nc309qu.jpg');
        expect(mapped.data.feature_image_alt).toEqual('Featured image. Alt text is also the caption');
        expect(mapped.data.feature_image_caption).toEqual('Featured image. Alt text is also the caption');

        expect(mapped.data.tags).toBeArrayOfSize(5);
        expect(mapped.data.tags[0]).toContainAllKeys(['url', 'data']);
        expect(mapped.data.tags[0].data).toContainAllKeys(['slug', 'name']);

        expect(mapped.data.tags[0].url).toEqual('/tag/test');
        expect(mapped.data.tags[0].data.slug).toEqual('test');
        expect(mapped.data.tags[0].data.name).toEqual('test');

        expect(mapped.data.tags[1].url).toEqual('/tag/embeds');
        expect(mapped.data.tags[1].data.slug).toEqual('embeds');
        expect(mapped.data.tags[1].data.name).toEqual('embeds');

        expect(mapped.data.tags[2].url).toEqual('/tag/images');
        expect(mapped.data.tags[2].data.slug).toEqual('images');
        expect(mapped.data.tags[2].data.name).toEqual('Images');

        expect(mapped.data.tags[3].url).toEqual('/tag/testing');
        expect(mapped.data.tags[3].data.slug).toEqual('testing');
        expect(mapped.data.tags[3].data.name).toEqual('Testing');

        expect(mapped.data.tags[4].url).toEqual('migrator-added-tag');
        expect(mapped.data.tags[4].data.slug).toEqual('hash-tinynews');
        expect(mapped.data.tags[4].data.name).toEqual('#tinynews');

        expect(mapped.data.author).toContainAllKeys(['url', 'data']);
        expect(mapped.data.author.url).toEqual('/author/dolor-simet');
        expect(mapped.data.author.data.slug).toEqual('dolor-simet');
        expect(mapped.data.author.data.name).toEqual('Dolor Simet');
        expect(mapped.data.author.data.email).toEqual('dolor-simet@example.com');
    });

    test('Uses author in authors JSON file is only one present & post has no authors array', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[1],
            authorsData: authorSingleFixture,
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        expect(mapped.data.author).toContainAllKeys(['url', 'data']);
        expect(mapped.data.author.url).toEqual('/author/lorem-ipsum');
        expect(mapped.data.author.data.slug).toEqual('lorem-ipsum');
        expect(mapped.data.author.data.name).toEqual('Lorem Ipsum');
        expect(mapped.data.author.data.email).toEqual('lorem@ipsum.com');
        expect(mapped.data.author.data.profile_image).toEqual('https://example.com/lorem.jpg');
        expect(mapped.data.author.data.bio).toEqual('Lorem ipsum dolor simet');
    });

    test('Enriches author data is more is available in authorsData', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[2],
            authorsData: authorMultipleFixture,
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        expect(mapped.data.author).toContainAllKeys(['url', 'data']);
        expect(mapped.data.author.url).toEqual('/author/dolor-simet');
        expect(mapped.data.author.data.slug).toEqual('dolor-simet');
        expect(mapped.data.author.data.name).toEqual('Dolor Simet');
        expect(mapped.data.author.data.email).toEqual('dolor@simet.com');
        expect(mapped.data.author.data.profile_image).toEqual('https://example.com/dolor.jpg');
        expect(mapped.data.author.data.bio).toEqual('Lorem ipsum dolor simet');
    });

    test('Falls back to default author is none supplied', function () {
        const mapped = mapPostPageConfig({
            postData: articlesFixture[1],
            authorsData: {},
            postType: 'post',
            options: {
                url: 'https://demo-site.example.com'
            }
        }, MockLogger);

        expect(mapped.data.author).toContainAllKeys(['url', 'data']);
        expect(mapped.data.author.url).toEqual('/author/author');
        expect(mapped.data.author.data.slug).toEqual('author');
        expect(mapped.data.author.data.name).toEqual('Author');
        expect(mapped.data.author.data.email).toEqual('author@example.com');
    });

    test('Can process pages', function () {});

    test('Can process newsletters', function () {});

    test('Can read author info', function () {});
});
