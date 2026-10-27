import assert from 'node:assert/strict';
import {describe, it, mock} from 'node:test';
import nock from 'nock';
import {
    wpCDNToLocal,
    processCoAuthors,
    processExcerpt,
    processShortcodes,
    processUnknownEmbedShortcodes,
    processContent,
    processPost
} from '../index.js';
import {matchEmbedUrl, buildEmbedHtml} from '../lib/embed-utils.js';

const cachedScrape = (responseData: Record<string, string>) => ({
    hasFile: () => true,
    readTmpJSONFile: async () => ({responseData})
});

const wpPost = (overrides: Record<string, any> = {}) => ({
    id: 1,
    slug: 'post',
    title: {rendered: 'Post'},
    content: {rendered: '<p>Body</p>'},
    excerpt: {rendered: '<p>Excerpt</p>'},
    type: 'post',
    status: 'publish',
    link: 'https://example.com/post/',
    date_gmt: '2024-01-01T00:00:00',
    modified_gmt: '2024-01-02T00:00:00',
    author: 1,
    ...overrides
});

describe('Processor edge cases', function () {
    it('leaves empty and non-CDN image URLs alone', function () {
        assert.equal(wpCDNToLocal(null), null);
        assert.equal(wpCDNToLocal(''), '');
        assert.equal(wpCDNToLocal('https://example.com/a.jpg'), 'https://example.com/a.jpg');
    });

    it('ignores co-author data that is not a list of taxonomies', function () {
        assert.deepEqual(processCoAuthors(null, []), []);
        assert.deepEqual(processCoAuthors({}, []), []);
        assert.deepEqual(processCoAuthors([{taxonomy: 'author'}, 'term'], []), []);
    });

    it('returns empty excerpts for empty, truncated, and unmatched content', function () {
        assert.equal(processExcerpt(''), '');
        assert.equal(processExcerpt('<p>Read more [&hellip;]</p>'), '');
        assert.equal(processExcerpt('<p> </p>'), null);
        assert.equal(processExcerpt('<p>Body</p>', '.missing'), null);
        assert.equal(processExcerpt('<h2 class="lead">Lead</h2><p>Body</p>', '.lead'), 'Lead');
    });
});

describe('Shortcode edge cases', function () {
    const shortcode = (html: string, options: Record<string, any> = {}) => processShortcodes({html, options});

    it('handles Visual Composer buttons, headings, and spacing', async function () {
        assert.equal(await shortcode('[vc_btn title="Go"]'), '');
        assert.equal(await shortcode('[vc_cta btn_title="Go"]'), '');
        assert.ok(
            (await shortcode('[vc_cta btn_title="Go" btn_link="url:https%3A%2F%2Fexample.com%2F"]')).includes(
                'href="https://example.com/">Go</a>'
            )
        );
        assert.ok((await shortcode('[vc_cta btn_title="Go" btn_link="https://example.com/"]')).includes('>Go</a>'));
        assert.equal(await shortcode('[vc_custom_heading text="One" font_container="tag:h1"]'), '<h1>One</h1>');
        assert.equal(await shortcode('[vc_custom_heading text="Two" font_container="tag:h2"]'), '<h2>Two</h2>');
        assert.equal(await shortcode('[vc_custom_heading text="Three" font_container="tag:h3"]'), '<h3>Three</h3>');
        assert.equal(await shortcode('[vc_custom_heading text="Four" font_container="tag:h4"]'), '');
        assert.equal(await shortcode('[vc_custom_heading text="None"]'), '');
        assert.equal(await shortcode('[vc_empty_space]'), '<br></br>');
    });

    it('fills missing caption image attributes with empty values', async function () {
        const html = await shortcode('[caption]<img src="https://example.com/a.jpg">A caption[/caption]');
        assert.ok(html.includes('src="https://example.com/a.jpg"'));
        assert.ok(html.includes('A caption'));
        assert.equal(await shortcode('[caption]<img alt="No source">A caption[/caption]'), '');
    });

    it('handles captions without content or images', async function () {
        assert.equal(await shortcode('[caption][/caption]'), '');
        // An image card without an image renders nothing.
        assert.equal(await shortcode('[caption]Just a caption[/caption]'), '');
    });

    it('builds galleries only from known attachments', async function () {
        const attachments = [
            {id: 5, url: 'https://example.com/a.jpg', alt: 'A', width: 10, height: 20},
            {id: '6', url: 'https://example.com/b.jpg', alt: 'B', width: 10, height: 20}
        ];
        const gallery = await shortcode('[gallery ids="5"]', {attachments});
        assert.ok(gallery.includes('kg-gallery-card'));
        assert.ok(gallery.includes('https://example.com/a.jpg'));
        const both = await shortcode('[gallery ids="5, 6, 7"]', {attachments});
        assert.ok(both.includes('https://example.com/b.jpg'));
        assert.equal(await shortcode('[gallery]', {attachments}), '');
    });

    it('picks the first available audio source and renders code without captions', async function () {
        assert.ok(
            (await shortcode('[audio mp3="https://example.com/a.mp3"]')).includes('src="https://example.com/a.mp3"')
        );
        assert.ok(
            (await shortcode('[audio wma="https://example.com/a.wma"]')).includes('src="https://example.com/a.wma"')
        );
        assert.equal(await shortcode('[audio]'), '');
        assert.equal(
            await shortcode('[code]let a = 1;[/code]'),
            '<figure><pre class=""><code>let a = 1;</code></pre></figure>'
        );
        assert.equal(
            await shortcode('[code title="Example" language="js"]let a = 1;[/code]'),
            '<figure><pre class="language-js"><code>let a = 1;</code></pre><figcaption>Example</figcaption></figure>'
        );
    });

    it('renders buttons, YouTube, and empty embeds', async function () {
        assert.equal(await shortcode('[button]Text[/button]'), 'Text');
        assert.equal(await shortcode('[button]'), '');
        assert.ok(
            (await shortcode('[button href="https://example.com" centered=true]Go[/button]')).includes(
                'kg-align-center'
            )
        );
        assert.ok((await shortcode('[button href="https://example.com"]')).includes('kg-align-left'));
        assert.equal(await shortcode('[youtube]'), '');
        assert.equal(await shortcode('[embed][/embed]'), '');
    });

    it('finds embeds in single-quoted attributes and passes empty HTML through', async function () {
        assert.ok(
            processUnknownEmbedShortcodes("[player src='https://youtu.be/dQw4w9WgXcQ']").includes('youtube.com/embed')
        );
        assert.equal(processUnknownEmbedShortcodes(''), '');
        assert.equal(await shortcode(''), '');
    });
});

describe('Content edge cases', function () {
    it('returns empty content for empty bodies', async function () {
        assert.equal(await processContent({html: ''}), '');
    });

    it('removes a leading feature image even when it is the first element', async function () {
        const html = await processContent({
            html: '<img src="https://example.com/image-300x200.jpg"><p>Body</p>',
            featureImageSrc: 'http://example.com/image.jpg'
        });
        assert.equal(html, '<p>Body</p>');
        const kept = await processContent({
            html: '<p><img alt="no source"></p><p>Body</p>',
            featureImageSrc: 'https://example.com/image.jpg'
        });
        assert.ok(kept.includes('alt="no source"'));
    });

    it('removes unwanted embeds, tables of contents, styles and inline weights', async function () {
        const html = await processContent({
            html: '<p>Tweet<script src="https://platform.twitter.com/widgets.js"></script></p><div id="toc_container">TOC</div><style>p{}</style><p style="font-weight: 400;">Text</p><script src="//platform.instagram.com/en_US/embeds.js"></script><script>a</script><div id="fb-root"></div><script>b</script>'
        });
        assert.equal(html, '<p>Tweet</p><p>Text</p>');
    });

    it('unwraps tiled galleries and cleans image attributes', async function () {
        const html = await processContent({
            html: '<div class="wp-block-jetpack-tiled-gallery"><div class="tiled-gallery__gallery"><div class="tiled-gallery__row"><div class="tiled-gallery__col"><figure class="tiled-gallery__item"><img src="https://i0.wp.com/example.com/a.jpg?resize=10" data-width="100" data-height="50"></figure></div></div></div></div>'
        });
        assert.equal(html, '<figure><img height="50" width="100" src="https://example.com/a.jpg"></figure>');
    });

    it('dedupes noscript images and handles images without sources', async function () {
        const html = await processContent({
            html: '<p><img><noscript><img></noscript></p><p><img src="https://example.com/a.jpg"><noscript>No image</noscript></p>'
        });
        assert.equal(
            html,
            '<p><img src="null"></p><p><img src="https://example.com/a.jpg"><noscript>No image</noscript></p>'
        );
    });

    it('converts captions without a caption element and skips caption blocks without images', async function () {
        const html = await processContent({
            html: '<div class="wp-caption">Only text</div><div class="wp-caption"><img src="https://example.com/a.jpg" alt="A"></div>'
        });
        assert.ok(html.startsWith('<div class="wp-caption">Only text</div>'));
        assert.ok(html.includes('kg-image-card'));
    });

    it('converts Libsyn embeds from cached scrapes unless remote scraping is disabled', async function () {
        const embed = '<iframe src="https://html5-player.libsyn.com/embed/episode/id/12345/"></iframe>';
        const html = await processContent({
            html: embed,
            fileCache: cachedScrape({
                title: 'Episode',
                duration: '1:05',
                durationSeconds: '65',
                image: 'https://example.com/cover.jpg',
                audioSrc: 'https://example.com/audio.mp3'
            }),
            options: {convertLibsynEmbed: true}
        });
        assert.ok(html.includes('kg-audio-card'));
        assert.ok(html.includes('src="https://example.com/audio.mp3"'));
        const skipped = await processContent({html: embed, options: {convertLibsynEmbed: true, scrape: ['none']}});
        assert.ok(skipped.includes('libsyn.com/embed'));
    });

    it('formats a freshly scraped Libsyn duration', async function () {
        nock.disableNetConnect();
        const episode = (seconds: number) =>
            `<html><head><meta property="og:title" content="Episode"><meta property="music:duration" content="${seconds}"><meta name="twitter:player:stream" content="https://example.com/audio.mp3"></head></html>`;
        const scope = nock('https://oembed.libsyn.com')
            .get('/embed')
            .query({item_id: '12345'})
            .reply(200, episode(125))
            .get('/embed')
            .query({item_id: '67890'})
            .reply(200, episode(130));
        try {
            const html = await processContent({
                html: '<iframe src="https://html5-player.libsyn.com/embed/episode/id/12345/"></iframe><iframe src="https://html5-player.libsyn.com/embed/episode/id/67890/"></iframe>',
                fileCache: {hasFile: () => false, writeTmpFile: async () => {}},
                options: {convertLibsynEmbed: true}
            });
            assert.ok(scope.isDone());
            assert.ok(html.includes('<span class="kg-audio-duration">2:05</span>'));
            assert.ok(html.includes('<span class="kg-audio-duration">2:10</span>'));
        } finally {
            nock.cleanAll();
            nock.enableNetConnect();
        }
    });

    it('converts Podigee players that have a configuration URL', async function () {
        const html = await processContent({
            html: '<script class="podigee-podcast-player" data-configuration="https://example.com/config.json"></script><script class="podigee-podcast-player"></script>'
        });
        assert.ok(html.includes('<iframe src="https://example.com/config.json"'));
        assert.ok(html.endsWith('<script class="podigee-podcast-player"></script>'));
    });

    it('converts WordPress post embeds to links or bookmarks', async function () {
        const embed =
            '<figure class="wp-block-embed is-type-wp-embed"><blockquote><a href="https://example.org/post/">Post</a></blockquote></figure>';
        assert.equal(
            await processContent({html: embed, options: {scrape: ['none']}}),
            '<p><a href="https://example.org/post/">Post</a></p>'
        );
        const bookmark = await processContent({
            html: embed,
            fileCache: cachedScrape({description: '<p>Summary</p>'})
        });
        assert.ok(bookmark.includes('kg-bookmark-card'));
        assert.ok(bookmark.includes('Summary'));
        const incomplete = '<figure class="wp-block-embed is-type-wp-embed"><blockquote>No link</blockquote></figure>';
        assert.equal(await processContent({html: incomplete}), incomplete);
    });

    it('wraps Twitter videos and normalises Instagram embeds', async function () {
        const video = await processContent({
            html: '<blockquote class="twitter-video"><a href="https://twitter.com/a/status/1"></a></blockquote>'
        });
        assert.ok(
            video.startsWith(
                '<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card"><blockquote class="twitter-video">'
            )
        );
        const linked = await processContent({
            html: '<blockquote class="instagram-media"><p><a href="https://instagram.com/p/xyz/">View</a></p></blockquote>'
        });
        assert.ok(linked.includes('src="https://instagram.com/p/xyz/embed/captioned/"'));
        const permalink = await processContent({
            html: '<blockquote class="instagram-media" data-instgrm-permalink="https://www.instagram.com/p/abc/?x=1"></blockquote>'
        });
        assert.ok(permalink.includes('src="https://www.instagram.com/p/abc/embed/captioned/"'));
        for (const html of [
            '<blockquote class="instagram-media"></blockquote>',
            '<blockquote class="instagram-media" data-instgrm-permalink="not a url"></blockquote>'
        ]) {
            assert.equal(await processContent({html}), html);
        }
    });

    it('wraps styled headings, media, and full-size images', async function () {
        assert.equal(
            await processContent({html: '<h2><span style="color: red">Red</span></h2>'}),
            '<!--kg-card-begin: html--><h2><!--kg-card-begin: html--><span style="color: red">Red</span><!--kg-card-end: html--></h2><!--kg-card-end: html-->'
        );
        assert.equal(
            await processContent({
                html: '<figure><video src="a.mp4"></video></figure><video src="b.mp4"></video><audio src="c.mp3"></audio>'
            }),
            '<!--kg-card-begin: html--><figure><video style="width:100%" src="a.mp4"></video></figure><!--kg-card-end: html--><!--kg-card-begin: html--><video style="width:100%" src="b.mp4"></video><!--kg-card-end: html--><!--kg-card-begin: html--><audio style="width:100%" src="c.mp3"></audio><!--kg-card-end: html-->'
        );
        assert.equal(
            await processContent({
                html: '<img class="full size-full" src="https://example.com/a.jpg" srcset="x" width="1" height="2"><figure><img class="full size-full" src="https://example.com/b.jpg"></figure>'
            }),
            '<figure class="kg-card kg-image-card kg-width-wide"><img class="full size-full kg-image" src="https://example.com/a.jpg" width="1" height="2"></figure><figure><img class="full size-full" src="https://example.com/b.jpg"></figure>'
        );
    });
});

describe('Post edge cases', function () {
    it('maps drafts, Parse.ly authors, and feature images without captions', async function () {
        const post = await processPost(
            wpPost({
                status: 'draft',
                parsely: {meta: {author: [{name: 'First'}, {name: 'Parsely Author'}]}},
                featured_media: 9,
                _embedded: {'wp:featuredmedia': [{source_url: 'https://example.com/feature.jpg'}]}
            }),
            [],
            {featureImage: 'featuredmedia', featureImageCaption: false}
        );
        assert.equal(post.data.status, 'draft');
        assert.equal(post.data.author.data.name, 'Parsely Author');
        assert.equal(post.data.feature_image, 'https://example.com/feature.jpg');
        assert.equal(post.data.feature_image_alt, null);
        assert.equal(post.data.feature_image_caption, null);
    });

    it('logs and skips a feature image that cannot be read', async function () {
        const log = mock.method(console, 'log', () => {});
        try {
            const post = await processPost(wpPost({featured_media: 9, _embedded: {'wp:featuredmedia': []}}), [], {
                featureImage: 'featuredmedia'
            });
            assert.equal(post.data.feature_image, undefined);
            assert.equal(log.mock.callCount(), 1);
        } finally {
            log.mock.restore();
        }
    });
});

describe('Embed edge cases', function () {
    it('falls back to a generic SoundCloud ID for player URLs', function () {
        const match: any = matchEmbedUrl(
            'https://w.soundcloud.com/player/?url=https%3A%2F%2Fapi.soundcloud.com%2Ftracks%2F1'
        );
        assert.equal(match.service, 'soundcloud');
        assert.equal(match.id, 'soundcloud');
    });

    it('drops Instagram, Bluesky, and TikTok embeds whose URLs cannot be sanitised', function () {
        for (const url of [
            'instagram.com/p/abc',
            'bsky.app/profile/someone.bsky.social/post/abc',
            'tiktok.com/@someone/video/123'
        ]) {
            assert.equal(buildEmbedHtml(matchEmbedUrl(url)), '');
        }
    });

    it('ignores blank URLs', function () {
        assert.equal(matchEmbedUrl('   '), null);
    });
});
