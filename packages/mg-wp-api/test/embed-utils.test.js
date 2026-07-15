import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {matchEmbedUrl, buildEmbedHtml} from '../lib/embed-utils.js';

describe('matchEmbedUrl', function () {
    describe('YouTube', function () {
        it('Matches youtube.com/watch URL', function () {
            const result = matchEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtu.be short URL', function () {
            const result = matchEmbedUrl('https://youtu.be/dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtube.com/embed URL', function () {
            const result = matchEmbedUrl('https://www.youtube.com/embed/dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtube.com/shorts URL', function () {
            const result = matchEmbedUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtube.com/live URL', function () {
            const result = matchEmbedUrl('https://www.youtube.com/live/dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtube-nocookie.com/embed URL', function () {
            const result = matchEmbedUrl('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches URL with extra params', function () {
            const result = matchEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'dQw4w9WgXcQ');
        });

        it('Matches youtu.be with tracking param', function () {
            const result = matchEmbedUrl('https://youtu.be/abcd1234?si=bcde2345');
            assert.equal(result.service, 'youtube');
            assert.equal(result.id, 'abcd1234');
        });
    });

    describe('Vimeo', function () {
        it('Matches vimeo.com/{id}', function () {
            const result = matchEmbedUrl('https://vimeo.com/123456789');
            assert.equal(result.service, 'vimeo');
            assert.equal(result.id, '123456789');
        });

        it('Matches player.vimeo.com/video/{id}', function () {
            const result = matchEmbedUrl('https://player.vimeo.com/video/123456789');
            assert.equal(result.service, 'vimeo');
            assert.equal(result.id, '123456789');
        });

        it('Matches without https', function () {
            const result = matchEmbedUrl('http://vimeo.com/987654321');
            assert.equal(result.service, 'vimeo');
            assert.equal(result.id, '987654321');
        });
    });

    describe('Spotify', function () {
        it('Matches open.spotify.com/track/{id}', function () {
            const result = matchEmbedUrl('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, '4PTG3Z6ehGkBFwjybzWkR8');
        });

        it('Matches open.spotify.com/album/{id}', function () {
            const result = matchEmbedUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, '1DFixLWuPkv3KT3TnV35m3');
        });

        it('Matches open.spotify.com/playlist/{id}', function () {
            const result = matchEmbedUrl('https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, '37i9dQZF1DXcBWIGoYBM5M');
        });

        it('Matches open.spotify.com/episode/{id}', function () {
            const result = matchEmbedUrl('https://open.spotify.com/episode/abc123def456');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, 'abc123def456');
        });

        it('Matches open.spotify.com/show/{id}', function () {
            const result = matchEmbedUrl('https://open.spotify.com/show/abc123def456');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, 'abc123def456');
        });

        it('Matches embed URL', function () {
            const result = matchEmbedUrl('https://open.spotify.com/embed/track/4PTG3Z6ehGkBFwjybzWkR8');
            assert.equal(result.service, 'spotify');
            assert.equal(result.id, '4PTG3Z6ehGkBFwjybzWkR8');
        });
    });

    describe('Dailymotion', function () {
        it('Matches dailymotion.com/video/{id}', function () {
            const result = matchEmbedUrl('https://www.dailymotion.com/video/x7tgad');
            assert.equal(result.service, 'dailymotion');
            assert.equal(result.id, 'x7tgad');
        });

        it('Matches dailymotion.com/embed/video/{id}', function () {
            const result = matchEmbedUrl('https://www.dailymotion.com/embed/video/x7tgad');
            assert.equal(result.service, 'dailymotion');
            assert.equal(result.id, 'x7tgad');
        });

        it('Matches dai.ly/{id}', function () {
            const result = matchEmbedUrl('https://dai.ly/x7tgad');
            assert.equal(result.service, 'dailymotion');
            assert.equal(result.id, 'x7tgad');
        });
    });

    describe('SoundCloud', function () {
        it('Matches soundcloud.com/{user}/{track}', function () {
            const result = matchEmbedUrl('https://soundcloud.com/artist-name/track-name');
            assert.equal(result.service, 'soundcloud');
        });

        it('Matches w.soundcloud.com/player URL', function () {
            const result = matchEmbedUrl(
                'https://w.soundcloud.com/player/?url=https%3A//api.soundcloud.com/tracks/123'
            );
            assert.equal(result.service, 'soundcloud');
        });
    });

    describe('Twitter/X', function () {
        it('Matches twitter.com status URL', function () {
            const result = matchEmbedUrl('https://twitter.com/user/status/1234567890');
            assert.equal(result.service, 'twitter');
            assert.equal(result.id, '1234567890');
        });

        it('Matches x.com status URL', function () {
            const result = matchEmbedUrl('https://x.com/user/status/1234567890');
            assert.equal(result.service, 'twitter');
            assert.equal(result.id, '1234567890');
        });

        it('Matches without www', function () {
            const result = matchEmbedUrl('https://twitter.com/someuser/status/9876543210');
            assert.equal(result.service, 'twitter');
            assert.equal(result.id, '9876543210');
        });
    });

    describe('Instagram', function () {
        it('Matches instagram.com/p/{id}', function () {
            const result = matchEmbedUrl('https://www.instagram.com/p/CxYz123AbC/');
            assert.equal(result.service, 'instagram');
            assert.equal(result.id, 'CxYz123AbC');
        });

        it('Matches instagram.com/reel/{id}', function () {
            const result = matchEmbedUrl('https://www.instagram.com/reel/CxYz123AbC/');
            assert.equal(result.service, 'instagram');
            assert.equal(result.id, 'CxYz123AbC');
        });
    });

    describe('Bluesky', function () {
        it('Matches bsky.app/profile/{user}/post/{id}', function () {
            const result = matchEmbedUrl('https://bsky.app/profile/user.bsky.social/post/3abc123def');
            assert.equal(result.service, 'bluesky');
            assert.equal(result.id, '3abc123def');
        });
    });

    describe('TikTok', function () {
        it('Matches tiktok.com/@{user}/video/{id}', function () {
            const result = matchEmbedUrl('https://www.tiktok.com/@username/video/7123456789012345678');
            assert.equal(result.service, 'tiktok');
            assert.equal(result.id, '7123456789012345678');
        });
    });

    describe('Non-matching URLs', function () {
        it('Returns null for non-embed URL', function () {
            const result = matchEmbedUrl('https://example.com/some-page');
            assert.equal(result, null);
        });

        it('Returns null for empty string', function () {
            const result = matchEmbedUrl('');
            assert.equal(result, null);
        });

        it('Returns null for null', function () {
            const result = matchEmbedUrl(null);
            assert.equal(result, null);
        });

        it('Returns null for undefined', function () {
            const result = matchEmbedUrl(undefined);
            assert.equal(result, null);
        });

        it('Returns null for non-URL text', function () {
            const result = matchEmbedUrl('This is just some text about youtube');
            assert.equal(result, null);
        });
    });
});

describe('buildEmbedHtml', function () {
    it('Returns null for null match', function () {
        const result = buildEmbedHtml(null);
        assert.equal(result, null);
    });

    it('Builds YouTube embed HTML', function () {
        const match = matchEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed"'));
        assert.ok(html.includes('</figure>'));
    });

    it('Builds Vimeo embed HTML', function () {
        const match = matchEmbedUrl('https://vimeo.com/123456789');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('src="https://player.vimeo.com/video/123456789"'));
        assert.ok(html.includes('</figure>'));
    });

    it('Builds Spotify embed HTML with correct type', function () {
        const match = matchEmbedUrl('https://open.spotify.com/track/4PTG3Z6ehGkBFwjybzWkR8');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('src="https://open.spotify.com/embed/track/4PTG3Z6ehGkBFwjybzWkR8"'));
        assert.ok(html.includes('</figure>'));
    });

    it('Builds Spotify album embed HTML', function () {
        const match = matchEmbedUrl('https://open.spotify.com/album/1DFixLWuPkv3KT3TnV35m3');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('src="https://open.spotify.com/embed/album/1DFixLWuPkv3KT3TnV35m3"'));
    });

    it('Builds Dailymotion embed HTML', function () {
        const match = matchEmbedUrl('https://www.dailymotion.com/video/x7tgad');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('src="https://www.dailymotion.com/embed/video/x7tgad"'));
        assert.ok(html.includes('</figure>'));
    });

    it('Builds Twitter embed HTML with comment markers', function () {
        const match = matchEmbedUrl('https://twitter.com/user/status/1234567890');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<!--kg-card-begin: embed-->'));
        assert.ok(html.includes('<blockquote class="twitter-tweet">'));
        assert.ok(html.includes('href="https://twitter.com/user/status/1234567890"'));
        assert.ok(html.includes('platform.twitter.com/widgets.js'));
        assert.ok(html.includes('<!--kg-card-end: embed-->'));
    });

    it('Builds X.com embed HTML with comment markers', function () {
        const match = matchEmbedUrl('https://x.com/user/status/1234567890');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<!--kg-card-begin: embed-->'));
        assert.ok(html.includes('<blockquote class="twitter-tweet">'));
        assert.ok(html.includes('href="https://x.com/user/status/1234567890"'));
    });

    it('Builds SoundCloud embed HTML as iframe', function () {
        const match = matchEmbedUrl('https://soundcloud.com/artist/track-name');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('<iframe'));
        assert.ok(html.includes('src="https://soundcloud.com/artist/track-name"'));
        assert.ok(html.includes('</figure>'));
    });

    it('Builds Instagram embed HTML as figure with blockquote', function () {
        const match = matchEmbedUrl('https://www.instagram.com/p/CxYz123AbC/');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('<blockquote'));
        assert.ok(html.includes('href="https://www.instagram.com/p/CxYz123AbC/"'));
        assert.ok(html.includes('instagram.com/embed.js'));
    });

    it('Builds Bluesky embed HTML as figure with blockquote', function () {
        const match = matchEmbedUrl('https://bsky.app/profile/user.bsky.social/post/3abc123def');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('<blockquote>'));
        assert.ok(html.includes('href="https://bsky.app/profile/user.bsky.social/post/3abc123def"'));
    });

    it('Builds TikTok embed HTML as figure with blockquote', function () {
        const match = matchEmbedUrl('https://www.tiktok.com/@username/video/7123456789012345678');
        const html = buildEmbedHtml(match);
        assert.ok(html.includes('<figure class="kg-card kg-embed-card">'));
        assert.ok(html.includes('<blockquote>'));
        assert.ok(html.includes('href="https://www.tiktok.com/@username/video/7123456789012345678"'));
    });
});

describe('URL sanitization', function () {
    it('Escapes double quotes in URL attributes', function () {
        const match = matchEmbedUrl('https://twitter.com/user/status/123');
        assert.ok(match);
        // Manually craft a match with an injected URL to test the builder
        const malicious = {...match, url: 'https://twitter.com/user/status/123"onmouseover="alert(1)'};
        const html = malicious.buildEmbedHtml(malicious.id, malicious.groups, malicious.url);
        assert.ok(!html.includes('"onmouseover="alert(1)'));
    });

    it('Escapes angle brackets in URL attributes', function () {
        const match = matchEmbedUrl('https://soundcloud.com/artist/track');
        assert.ok(match);
        const malicious = {...match, url: 'https://soundcloud.com/artist/track<script>alert(1)</script>'};
        const html = malicious.buildEmbedHtml(malicious.id, malicious.groups, malicious.url);
        assert.ok(!html.includes('<script>alert(1)</script>'));
    });

    it('Rejects javascript: protocol URLs', function () {
        const match = matchEmbedUrl('https://twitter.com/user/status/456');
        assert.ok(match);
        const malicious = {...match, url: 'javascript:alert(1)'};
        const html = malicious.buildEmbedHtml(malicious.id, malicious.groups, malicious.url);
        assert.equal(html, '');
    });

    it('Rejects data: protocol URLs', function () {
        const match = matchEmbedUrl('https://soundcloud.com/artist/track');
        assert.ok(match);
        const malicious = {...match, url: 'data:text/html,<script>alert(1)</script>'};
        const html = malicious.buildEmbedHtml(malicious.id, malicious.groups, malicious.url);
        assert.equal(html, '');
    });

    it('Rejects invalid URLs that fail URL constructor', function () {
        const match = matchEmbedUrl('https://bsky.app/profile/user.bsky.social/post/abc123');
        assert.ok(match);
        const malicious = {...match, url: 'not-a-valid-url'};
        const html = malicious.buildEmbedHtml(malicious.id, malicious.groups, malicious.url);
        assert.equal(html, '');
    });

    it('URL with injection payload is sanitized in output', function () {
        const result = matchEmbedUrl('https://twitter.com/user/status/123" onclick="alert(1)" data-x="');
        // The regex matches (captures ID "123"), but output must be safe
        assert.ok(result);
        const html = buildEmbedHtml(result);
        // The quotes are percent-encoded by URL constructor, so no attribute breakout
        assert.ok(!html.includes('href="https://twitter.com/user/status/123"'));
        assert.ok(html.includes('%22'));
    });
});
