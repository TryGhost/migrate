import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {describe, it, mock} from 'node:test';
import nock from 'nock';
import MgWebScraper from '@tryghost/mg-webscraper';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import {scrapeConfig, postProcessor, skipScrape, downloadVideoPodcast, buildCookieHeader, parseM3u8} from '../sources/substack.js';

// Create a mock FileCache with only the methods needed for this test
const mockFileCache = {
    hasFile: mock.fn(() => false),
    readTmpJSONFile: mock.fn(async () => ({})),
    writeTmpFile: mock.fn(async () => '/mock/tmp/file')
};

describe('Web Scrap Config & Post Processor', function () {
    it('Scrapes a text post', async function () {
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
        assert.equal(scrapedData.authors[0].data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.slug, 'author-name');
        assert.equal(scrapedData.authors[0].data.email, 'author-name@example.com');

        assert.equal(scrapedData.authors[1].url, 'https-substack-com-other');
        assert.equal(scrapedData.authors[1].data.name, 'Other Name');
        assert.equal(scrapedData.authors[1].data.slug, 'other-name');
        assert.equal(scrapedData.authors[1].data.email, 'other-name@example.com');

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

        nock('https://example.substack.com')
            .get('/p/hello-world')
            .reply(200, singleAuthordHTML, {
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

        assert.equal(scrapedData.authors.length, 1);

        assert.equal(scrapedData.authors[0].url, 'https-exaple-org');
        assert.equal(scrapedData.authors[0].data.name, 'Example Org');
        assert.equal(scrapedData.authors[0].data.slug, 'example-org');
        assert.equal(scrapedData.authors[0].data.email, 'example-org@example.com');
    });

    it('Scrapes a podcast', async function () {
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
        assert.equal(scrapedData.authors[0].data.name, 'Author Name');
        assert.equal(scrapedData.authors[0].data.slug, 'author-name');
        assert.equal(scrapedData.authors[0].data.email, 'author-name@example.com');
        assert.equal(scrapedData.podcast_audio_src, 'https://api.substack.com/api/v1/audio/upload/92883946-10da-4958-93e3-0dcddb733b51/src?token=462fde6a-20c4-4eb6-af74-0c2461536ad7');
    });

    it('Scrapes a video podcast', async function () {
        const videoPodcastHTML = await readFile(new URL('./fixtures/substack-video-podcast.html', import.meta.url));

        nock('https://example.substack.com')
            .get('/p/a-video-episode')
            .reply(200, videoPodcastHTML, {
                'Content-Type': 'text/html'
            });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {},
            result: {
                posts: [
                    {
                        url: 'https://example.substack.com/p/a-video-episode',
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

        assert.equal(scrapedData.meta_title, 'A video episode - Author Name');
        assert.equal(scrapedData.meta_description, 'Video podcast subtitle');
        assert.equal(scrapedData.og_title, 'A video episode');
        assert.equal(scrapedData.video_upload_src, 'https://example.substack.com/api/v1/video/upload/a1b2c3d4-e5f6-7890-abcd-ef1234567890/src?type=mp4');
        assert.equal(scrapedData.mux_playback_id, 'mux-playback-test-id');

        assert.equal(scrapedData.tags.length, 2);
        assert.equal(scrapedData.tags[0].url, '/substack-section/tech');
        assert.equal(scrapedData.tags[0].data.name, 'Tech');
        assert.equal(scrapedData.tags[1].url, '/substack-tag/video');
        assert.equal(scrapedData.tags[1].data.name, 'Video');
    });

    it('Uses substack.com domain for video API when site has custom domain', async function () {
        const videoPodcastHTML = await readFile(new URL('./fixtures/substack-video-podcast-custom-domain.html', import.meta.url));

        nock('https://www.customdomain.com')
            .get('/p/a-video-episode')
            .reply(200, videoPodcastHTML, {
                'Content-Type': 'text/html'
            });

        const ctx = {
            fileCache: mockFileCache,
            errors: [],
            options: {},
            result: {
                posts: [
                    {
                        url: 'https://www.customdomain.com/p/a-video-episode',
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

        assert.equal(
            scrapedData.video_upload_src,
            'https://www.customdomain.com/api/v1/video/upload/a1b2c3d4-e5f6-7890-abcd-ef1234567890/src?type=mp4',
            'Should use canonical_url origin for API calls'
        );
        assert.equal(scrapedData.mux_playback_id, 'mux-playback-test-id');
    });
});

describe('downloadVideoPodcast', function () {
    it('Throws when mux_playback_id is missing', async function () {
        await assert.rejects(
            () => downloadVideoPodcast(
                'https://example.substack.com/api/v1/video/upload/abc/src?type=mp4',
                null,
                'test-slug',
                mockFileCache,
                null,
                10
            ),
            {message: /mux_playback_id/}
        );
    });

    it('Throws when mux_playback_id is undefined', async function () {
        await assert.rejects(
            () => downloadVideoPodcast(
                'https://example.substack.com/api/v1/video/upload/abc/src?type=mp4',
                undefined,
                'test-slug',
                mockFileCache,
                'some-cookie',
                10
            ),
            {message: /mux_playback_id/}
        );
    });
});

describe('buildCookieHeader', function () {
    it('Returns undefined when no cookie is provided', function () {
        assert.equal(buildCookieHeader(null), undefined);
        assert.equal(buildCookieHeader(undefined), undefined);
        assert.equal(buildCookieHeader(''), undefined);
    });

    it('Sends both cookie names for a bare session value', function () {
        assert.equal(buildCookieHeader('abc123'), 'substack.sid=abc123; connect.sid=abc123');
    });

    it('Passes through a full cookie string containing =', function () {
        assert.equal(buildCookieHeader('substack.sid=abc123'), 'substack.sid=abc123');
    });

    it('Passes through any cookie string with = as-is', function () {
        assert.equal(buildCookieHeader('other_cookie=value'), 'other_cookie=value');
    });
});

describe('parseM3u8', function () {
    it('Parses a master playlist and selects highest bandwidth', function () {
        const m3u8 = [
            '#EXTM3U',
            '#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720',
            'medium.m3u8?token=abc',
            '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080',
            'high.m3u8?token=abc',
            '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360',
            'low.m3u8?token=abc'
        ].join('\n');

        const result = parseM3u8(m3u8, 'https://stream.mux.com/abc123.m3u8?token=xyz');

        assert.equal(result.type, 'master');
        assert.ok(result.bestRenditionUrl.includes('high.m3u8'));
        assert.ok(result.bestRenditionUrl.startsWith('https://stream.mux.com/'));
    });

    it('Parses a media playlist and extracts segment URLs', function () {
        const m3u8 = [
            '#EXTM3U',
            '#EXT-X-VERSION:3',
            '#EXT-X-TARGETDURATION:6',
            '#EXT-X-MEDIA-SEQUENCE:0',
            '#EXTINF:6.000,',
            'segment-0.ts?token=abc',
            '#EXTINF:6.000,',
            'segment-1.ts?token=abc',
            '#EXTINF:4.500,',
            'segment-2.ts?token=abc',
            '#EXT-X-ENDLIST'
        ].join('\n');

        const result = parseM3u8(m3u8, 'https://stream.mux.com/abc123/rendition.m3u8?token=xyz');

        assert.equal(result.type, 'media');
        assert.equal(result.segments.length, 3);
        assert.ok(result.segments[0].startsWith('https://stream.mux.com/abc123/'));
        assert.ok(result.segments[0].includes('segment-0.ts'));
        assert.ok(result.segments[2].includes('segment-2.ts'));
    });

    it('Handles absolute segment URLs', function () {
        const m3u8 = [
            '#EXTM3U',
            '#EXT-X-TARGETDURATION:6',
            '#EXTINF:6.000,',
            'https://cdn.example.com/seg-0.ts',
            '#EXTINF:6.000,',
            'https://cdn.example.com/seg-1.ts',
            '#EXT-X-ENDLIST'
        ].join('\n');

        const result = parseM3u8(m3u8, 'https://stream.mux.com/abc.m3u8');

        assert.equal(result.type, 'media');
        assert.equal(result.segments.length, 2);
        assert.equal(result.segments[0], 'https://cdn.example.com/seg-0.ts');
        assert.equal(result.segments[1], 'https://cdn.example.com/seg-1.ts');
    });

    it('Returns empty segments for playlist with no EXTINF entries', function () {
        const m3u8 = [
            '#EXTM3U',
            '#EXT-X-VERSION:3',
            '#EXT-X-ENDLIST'
        ].join('\n');

        const result = parseM3u8(m3u8, 'https://stream.mux.com/abc.m3u8');

        assert.equal(result.type, 'media');
        assert.equal(result.segments.length, 0);
    });

    it('Resolves relative rendition URLs in master playlist', function () {
        const m3u8 = [
            '#EXTM3U',
            '#EXT-X-STREAM-INF:BANDWIDTH=3000000,RESOLUTION=1920x1080',
            'rendition/high.m3u8?token=abc'
        ].join('\n');

        const result = parseM3u8(m3u8, 'https://stream.mux.com/playback-id.m3u8?token=xyz');

        assert.equal(result.type, 'master');
        assert.ok(result.bestRenditionUrl.includes('rendition/high.m3u8'));
        assert.ok(result.bestRenditionUrl.startsWith('https://stream.mux.com/'));
    });
});
