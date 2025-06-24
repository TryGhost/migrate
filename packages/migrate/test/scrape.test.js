import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {jest} from '@jest/globals';
import nock from 'nock';
import MgWebScraper from '@tryghost/mg-webscraper';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {scrapeConfig, postProcessor, skipScrape} from '../sources/substack.js';

// Create a mock FileCache with only the methods needed for this test
const mockFileCache = {
    hasFile: jest.fn(() => false),
    readTmpJSONFile: jest.fn(async () => ({})),
    writeTmpFile: jest.fn(async () => '/mock/tmp/file')
};

describe('Web Scrap Config & Post Processor', function () {
    test('Scrapes a text post', async function () {
        const helloWorldHTML = await readFile(new URL('./fixtures/substack-hello-world.html', import.meta.url));

        nock('https://example.substack.com')
            .get('/p/hello-world')
            .reply(200, helloWorldHTML, {
                'Content-Type': 'text/html'
            });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {},
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
        assert.equal(scrapedData.og_image, 'https://substackcdn.com/image/fetch/$s_!vQbz!,w_1200,h_600,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fcb4ecbcf-582b-46db-b72b-bcd9fa3630a0_5472x3648.jpeg');
        assert.equal(scrapedData.og_title, 'Social header');
        assert.equal(scrapedData.og_description, 'Ah, a social preview!');
        assert.equal(scrapedData.twitter_image, 'https://substackcdn.com/image/fetch/$s_!4VJW!,f_auto,q_auto:best,fl_progressive:steep/https%3A%2F%2Fexample.substack.com%2Fapi%2Fv1%2Fpost_preview%2F151282645%2Ftwitter.jpg%3Fversion%3D4');
        assert.equal(scrapedData.twitter_title, 'Social header');
        assert.equal(scrapedData.twitter_description, 'Ah, a social preview!');

        assert.equal(scrapedData.authors.length, 2);

        assert.equal(scrapedData.authors[0].url, 'https-substack-com-example');
        assert.equal(scrapedData.authors[0].data.data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.data.slug, 'author-name');
        assert.equal(scrapedData.authors[0].data.data.email, 'author-name@example.com');

        assert.equal(scrapedData.authors[1].url, 'https-substack-com-other');
        assert.equal(scrapedData.authors[1].data.data.name, 'Other Name');
        assert.equal(scrapedData.authors[1].data.data.slug, 'other-name');
        assert.equal(scrapedData.authors[1].data.data.email, 'other-name@example.com');
    });

    test('Scrapes a podcast', async function () {
        const podcastHTML = await readFile(new URL('./fixtures/substack-podcast.html', import.meta.url));

        nock('https://example.substack.com')
            .get('/p/an-audio-episode')
            .reply(200, podcastHTML, {
                'Content-Type': 'text/html'
            });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {},
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
        assert.equal(scrapedData.og_image, 'https://substackcdn.com/image/fetch/$s_!E-kr!,w_1200,h_600,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F579008c1-f5ea-441b-a712-9e954c780269_1992x1992.png');
        assert.equal(scrapedData.og_title, 'An audio episode');
        assert.equal(scrapedData.og_description, 'And a subtitle for it');
        assert.equal(scrapedData.twitter_image, 'https://substackcdn.com/image/fetch/$s_!H502!,f_auto,q_auto:best,fl_progressive:steep/https%3A%2F%2Fexample.substack.com%2Fapi%2Fv1%2Fpost_preview%2F166728633%2Ftwitter.jpg%3Fversion%3D4');
        assert.equal(scrapedData.twitter_title, 'An audio episode');
        assert.equal(scrapedData.twitter_description, 'And a subtitle for it');
        assert.equal(scrapedData.authors[0].url, 'https-substack-com-example');
        assert.equal(scrapedData.authors[0].data.data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.data.slug, 'author-name');
        assert.equal(scrapedData.authors[0].data.data.email, 'author-name@example.com');
        assert.equal(scrapedData.podcast_audio_src, 'https://api.substack.com/api/v1/audio/upload/92883946-10da-4958-93e3-0dcddb733b51/src?token=462fde6a-20c4-4eb6-af74-0c2461536ad7');
    });
});
