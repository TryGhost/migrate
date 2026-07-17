import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describe, it, mock} from 'node:test';
import nock from 'nock';
import MgWebScraper from '@tryghost/mg-webscraper';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {scrapeConfig, postProcessor, skipScrape} from '../sources/substack.js';

// Create a mock FileCache with only the methods needed for this test
const mockFileCache = {
    hasFile: mock.fn(() => false),
    readTmpJSONFile: mock.fn(async () => ({})),
    writeTmpFile: mock.fn(async () => '/mock/tmp/file')
};

// These vars are only here so the assertions look cleaner
const personProfileImage =
    'https://substackcdn.com/image/fetch/$s_!kPbC!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F6fd93f54-1d00-4731-a251-4d6c8e8eac87_500x500.jpeg';
const organizationProfileImage =
    'https://substackcdn.com/image/fetch/$s_!qgp7!,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F1234abcd-a32f-4340-acf4-832d26f11a78_220x220.png';

describe('Web Scrap Config & Post Processor', function () {
    it('Scrapes a text post', async function () {
        const helloWorldHTML = await readFile(new URL('./fixtures/substack-hello-world.html', import.meta.url));

        nock('https://example.substack.com').get('/p/hello-world').reply(200, helloWorldHTML, {
            'Content-Type': 'text/html'
        });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {
                useMetaAuthor: true
            },
            result: {
                posts: [
                    {
                        url: 'https://example.substack.com/p/hello-world',
                        data: {}
                    }
                ]
            }
        };

        const webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);

        const tasks = webScraper.hydrate(ctx);
        const runner = makeTaskRunner(tasks, {
            concurrent: 1,
            renderer: 'silent'
        });
        await runner.run(ctx);

        const scrapedData = ctx.result.posts[0].data;

        assert.equal(scrapedData.meta_title, 'Social title - Author Name');
        assert.equal(scrapedData.meta_description, 'Social description');
        assert.equal(
            scrapedData.og_image,
            'https://substackcdn.com/image/fetch/$s_!vQbz!,w_1200,h_600,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fcb4ecbcf-582b-46db-b72b-bcd9fa3630a0_5472x3648.jpeg'
        );
        assert.equal(scrapedData.og_title, 'Social header');
        assert.equal(scrapedData.og_description, 'Ah, a social preview!');
        assert.equal(
            scrapedData.twitter_image,
            'https://substackcdn.com/image/fetch/$s_!4VJW!,f_auto,q_auto:best,fl_progressive:steep/https%3A%2F%2Fexample.substack.com%2Fapi%2Fv1%2Fpost_preview%2F151282645%2Ftwitter.jpg%3Fversion%3D4'
        );
        assert.equal(scrapedData.twitter_title, 'Social header');
        assert.equal(scrapedData.twitter_description, 'Ah, a social preview!');

        assert.equal(scrapedData.authors.length, 2);

        assert.equal(scrapedData.authors[0].url, 'https://substack.com/@example');
        assert.equal(scrapedData.authors[0].data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.slug, 'example');
        assert.equal(scrapedData.authors[0].data.email, 'example@example.com');
        assert.equal(scrapedData.authors[0].data.profile_image, personProfileImage);

        assert.equal(scrapedData.authors[1].url, 'https://substack.com/@other');
        assert.equal(scrapedData.authors[1].data.name, 'Other Name');
        assert.equal(scrapedData.authors[1].data.slug, 'other');
        assert.equal(scrapedData.authors[1].data.email, 'other@example.com');
        assert.equal(scrapedData.authors[1].data.profile_image, personProfileImage);

        assert.equal(scrapedData.tags.length, 3);
        assert.equal(scrapedData.tags[0].url, '/substack-section/world-sports-cricket');
        assert.equal(scrapedData.tags[0].data.name, 'World Sports: Cricket');
        assert.equal(scrapedData.tags[0].data.slug, 'world-sports-cricket');
        assert.equal(scrapedData.tags[1].url, '/substack-tag/blogging');
        assert.equal(scrapedData.tags[1].data.name, 'Blogging');
        assert.equal(scrapedData.tags[1].data.slug, 'blogging');
        assert.equal(scrapedData.tags[2].url, '/substack-tag/news');
        assert.equal(scrapedData.tags[2].data.name, 'News');
        assert.equal(scrapedData.tags[2].data.slug, 'news');
    });

    it('Scrapes a text post with a single author', async function () {
        const singleAuthordHTML = await readFile(new URL('./fixtures/substack-single-author.html', import.meta.url));

        nock('https://example.substack.com').get('/p/hello-world').reply(200, singleAuthordHTML, {
            'Content-Type': 'text/html'
        });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {
                useMetaAuthor: true
            },
            result: {
                posts: [
                    {
                        url: 'https://example.substack.com/p/hello-world',
                        data: {}
                    }
                ]
            }
        };

        const webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);

        const tasks = webScraper.hydrate(ctx);
        const runner = makeTaskRunner(tasks, {
            concurrent: 1,
            renderer: 'silent'
        });
        await runner.run(ctx);

        const scrapedData = ctx.result.posts[0].data;

        assert.equal(scrapedData.authors.length, 1);

        assert.equal(scrapedData.authors[0].url, 'https://exaple.org');
        assert.equal(scrapedData.authors[0].data.name, 'Example Org');
        assert.equal(scrapedData.authors[0].data.slug, 'https-exaple-org');
        assert.equal(scrapedData.authors[0].data.email, 'https-exaple-org@example.com');
        assert.equal(scrapedData.authors[0].data.profile_image, organizationProfileImage);
    });

    it('Processes scraped ld+json with a single author object', function () {
        const scrapedData = {
            scripts: [
                {
                    content: JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'NewsArticle',
                        author: {
                            '@type': 'Person',
                            name: 'Solo Author',
                            url: 'https://substack.com/@solo',
                            identifier: 'user:654321',
                            image: {
                                contentUrl: 'https://example.com/solo.jpg'
                            }
                        }
                    })
                }
            ]
        };

        const processed = postProcessor(scrapedData, null, {
            useMetaAuthor: true
        });

        assert.equal(processed.authors.length, 1);
        assert.equal(processed.authors[0].url, 'https://substack.com/@solo');
        assert.equal(processed.authors[0].data.name, 'Solo Author');
        assert.equal(processed.authors[0].data.slug, 'solo');
        assert.equal(processed.authors[0].data.email, 'solo@example.com');
        assert.equal(processed.authors[0].data.profile_image, 'https://example.com/solo.jpg');
    });

    it('Scrapes a podcast', async function () {
        const podcastHTML = await readFile(new URL('./fixtures/substack-podcast.html', import.meta.url));

        nock('https://example.substack.com').get('/p/an-audio-episode').reply(200, podcastHTML, {
            'Content-Type': 'text/html'
        });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {
                useMetaAuthor: true
            },
            result: {
                posts: [
                    {
                        url: 'https://example.substack.com/p/an-audio-episode',
                        data: {}
                    }
                ]
            }
        };

        const webScraper = new MgWebScraper(ctx.fileCache, scrapeConfig, postProcessor, skipScrape);

        const tasks = webScraper.hydrate(ctx);
        const runner = makeTaskRunner(tasks, {
            concurrent: 1,
            renderer: 'silent'
        });
        await runner.run(ctx);

        const scrapedData = ctx.result.posts[0].data;

        assert.equal(scrapedData.meta_title, 'An audio episode - Author Name');
        assert.equal(scrapedData.meta_description, 'And a subtitle for it');
        assert.equal(
            scrapedData.og_image,
            'https://substackcdn.com/image/fetch/$s_!E-kr!,w_1200,h_600,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F579008c1-f5ea-441b-a712-9e954c780269_1992x1992.png'
        );
        assert.equal(scrapedData.og_title, 'An audio episode');
        assert.equal(scrapedData.og_description, 'And a subtitle for it');
        assert.equal(
            scrapedData.twitter_image,
            'https://substackcdn.com/image/fetch/$s_!H502!,f_auto,q_auto:best,fl_progressive:steep/https%3A%2F%2Fexample.substack.com%2Fapi%2Fv1%2Fpost_preview%2F166728633%2Ftwitter.jpg%3Fversion%3D4'
        );
        assert.equal(scrapedData.twitter_title, 'An audio episode');
        assert.equal(scrapedData.twitter_description, 'And a subtitle for it');
        assert.equal(scrapedData.authors[0].url, 'https://substack.com/@example');
        assert.equal(scrapedData.authors[0].data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.slug, 'example');
        assert.equal(scrapedData.authors[0].data.email, 'example@example.com');
        assert.equal(scrapedData.authors[0].data.profile_image, personProfileImage);
        assert.equal(
            scrapedData.podcast_audio_src,
            'https://api.substack.com/api/v1/audio/upload/92883946-10da-4958-93e3-0dcddb733b51/src?token=462fde6a-20c4-4eb6-af74-0c2461536ad7'
        );
    });
});
