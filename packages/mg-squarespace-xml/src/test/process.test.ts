import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {processContent} from '../index.js';
import {
    featureImageUrl,
    getText,
    htmlToTextTrimmed,
    postDates,
    postSlug,
    processTags,
    processUser,
    wxrDate
} from '../lib/process.js';

describe('processContent', function () {
    it('Can convert audio block to audio card', function () {
        const audioBlock = `<div class="sqs-audio-embed"
            data-url="http://example.com/auio-file.mp3"
            data-mime-type=""
            data-title="My podcast"
            data-author="TRXL"
            data-show-download="false"
            data-design-style="minimal"
            data-duration-in-ms="3817000"
            data-color-theme="dark"
        ></div>`;

        const processed = processContent(audioBlock);

        assert.ok(processed.includes('<div class="kg-card kg-audio-card">'));
        assert.ok(processed.includes('<audio src="http://example.com/auio-file.mp3"'));
        assert.ok(!processed.includes('<div class="sqs-audio-embed"'));
    });

    it('Can convert blockquotes', function () {
        const blockquote = `<p>Hello</p>
<figure class="block-animation-none">
  <blockquote data-animation-role="quote">
    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>
  </blockquote>
  <figcaption class="source">— Lipsum</figcaption>
</figure>
<p>World</p>`;

        assert.equal(
            processContent(blockquote),
            '<p>Hello</p>\n' +
                '<figure class="block-animation-none">\n' +
                '  <blockquote data-animation-role="quote"><p>\n' +
                '    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>\n' +
                '  <br><br>— Lipsum</p></blockquote>\n' +
                '  \n' +
                '</figure>\n' +
                '<p>World</p>'
        );
    });

    it('Can convert blockquotes without a caption', function () {
        assert.equal(
            processContent('<figure><blockquote>Quote</blockquote></figure>'),
            '<figure><blockquote><p>Quote</p></blockquote></figure>'
        );
    });

    it('Can remove elements', function () {
        const html = `<p>Hello</p><div class="custom-subscribe-form"></div><p>World</p>`;

        assert.equal(processContent(html, {removeSelectors: '.custom-subscribe-form'}), '<p>Hello</p><p>World</p>');
    });

    it('Can handle YouTube embeds', function () {
        const video = `<div class="sqs-html-content" data-sqsp-text-block-content><p>Hello world</p></div>
            <div class="intrinsic" style="max-width:100%">
                <div class="embed-block-wrapper" style="padding-bottom:56.5%;">
                    <div class="sqs-video-wrapper" data-provider-name="YouTube" data-html="&lt;iframe width=&quot;200&quot; height=&quot;113&quot; src=&quot;https://www.youtube.com/embed/lqCmETMKzA8?feature=oembed&quot; frameborder=&quot;0&quot; allow=&quot;accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share&quot; referrerpolicy=&quot;strict-origin-when-cross-origin&quot; allowfullscreen title=&quot;The Video Title&quot;&gt;&lt;/iframe&gt;">
                    </div>
                </div>
            </div>`;

        assert.equal(
            processContent(video, {removeSelectors: '.custom-subscribe-form'}),
            '<div class="sqs-html-content" data-sqsp-text-block-content><p>Hello world</p></div>\n' +
                '            <figure class="kg-card kg-embed-card"><iframe width="200" height="113" src="https://www.youtube.com/embed/lqCmETMKzA8?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="The Video Title"></iframe></figure>'
        );
    });

    it('Can handle video wrapper without expected parent structure', function () {
        const html =
            '<div class="sqs-video-wrapper" data-html="&lt;iframe src=&quot;https://example.com&quot;&gt;&lt;/iframe&gt;"></div>';

        // Video wrapper without .embed-block-wrapper parent is left as-is
        assert.ok(processContent(html).includes('sqs-video-wrapper'));
    });

    it('Can set src from data-src on non-thumb images', function () {
        assert.ok(
            processContent('<img data-src="https://example.com/photo.jpg">').includes(
                'src="https://example.com/photo.jpg"'
            )
        );
    });

    it('Can handle thumb-image with non-adjacent noscript', function () {
        const html =
            '<div><noscript><img src="https://example.com/photo.jpg"></noscript><span>spacer</span><img class="thumb-image" data-src="https://example.com/photo.jpg"></div>';

        const processed = processContent(html);

        // The noscript is not the immediate previous sibling, but we still walk back to find it
        assert.ok(processed.includes('<noscript>'));
        // The thumb-image should be removed since it matches the noscript img
        assert.ok(!processed.includes('thumb-image'));
    });

    it('Keeps a thumb-image whose noscript holds a different image, or that has no noscript', function () {
        const different =
            '<div><noscript><img src="https://example.com/other.jpg"></noscript><img class="thumb-image" data-src="https://example.com/photo.jpg"></div>';
        assert.ok(processContent(different).includes('thumb-image'));
        const empty =
            '<div><noscript></noscript><img class="thumb-image" data-src="https://example.com/photo.jpg"></div>';
        assert.ok(processContent(empty).includes('thumb-image'));
        assert.ok(processContent('<img class="thumb-image" data-src="x.jpg">').includes('thumb-image'));
    });

    it('Can remove newsletter form wrapper', function () {
        assert.equal(
            processContent('<p>Hello</p><div class="newsletter-form-wrapper"><input></div><p>World</p>'),
            '<p>Hello</p><p>World</p>'
        );
    });

    it('Can wrap nested lists in HTML card comments', function () {
        assert.equal(
            processContent('<ul><li>Item 1<ul><li>Sub item</li></ul></li></ul>'),
            '<!--kg-card-begin: html--><ul><li>Item 1<ul><li>Sub item</li></ul></li></ul><!--kg-card-end: html-->'
        );
    });

    it('Can return empty string for empty content', function () {
        assert.equal(processContent(''), '');
        assert.equal(processContent(null), '');
        assert.equal(processContent(undefined), '');
    });
});

describe('processUser', function () {
    it('Can read a user, slugging the login and defaulting the email', function () {
        assert.deepEqual(
            processUser({
                'wp:author_login': 'HarrySquatter',
                'wp:author_email': '',
                'wp:author_display_name': 'Harry Squatter'
            }),
            {
                login: 'HarrySquatter',
                data: {slug: 'harrysquatter', name: 'Harry Squatter', email: 'harrysquatter@example.com'}
            }
        );
    });

    it('Can handle user with missing fields', function () {
        assert.deepEqual(processUser({'wp:author_display_name': 'Jane Doe'}), {
            login: '',
            data: {slug: 'jane-doe', name: 'Jane Doe', email: 'jane-doe@example.com'}
        });
        assert.deepEqual(processUser({}), {
            login: '',
            data: {slug: 'author', name: 'Author', email: 'author@example.com'}
        });
    });
});

describe('processTags', function () {
    const categories = [
        {'@_domain': 'post_tag', '@_nicename': 'programming', '#text': 'Programming'},
        {'@_domain': 'category', '@_nicename': 'company-news', '#text': 'Company News'},
        {'@_domain': 'author', '@_nicename': 'someone', '#text': 'Someone'}
    ];

    it('Lists categories before tags', function () {
        assert.deepEqual(processTags(categories, true), [
            {url: '/tag/company-news', data: {slug: 'company-news', name: 'Company News'}},
            {url: '/tag/programming', data: {slug: 'programming', name: 'Programming'}}
        ]);
    });

    it('Leaves tags out unless asked', function () {
        assert.deepEqual(
            processTags(categories, false).map(tag => tag.data.slug),
            ['company-news']
        );
    });
});

describe('featureImageUrl', function () {
    it('Accepts image attachments and Unsplash images', function () {
        assert.equal(
            featureImageUrl({'wp:attachment_url': 'https://example.com/photo.webp'}),
            'https://example.com/photo.webp'
        );
        assert.equal(
            featureImageUrl({'wp:attachment_url': 'https://images.unsplash.com/photo-1?w=1268'}),
            'https://images.unsplash.com/photo-1?w=1268'
        );
    });

    it('Ignores other attachments, invalid URLs and items without one', function () {
        assert.equal(featureImageUrl({'wp:attachment_url': 'https://example.com/file.pdf'}), undefined);
        assert.equal(featureImageUrl({'wp:attachment_url': 'not-a-valid-url'}), undefined);
        assert.equal(featureImageUrl({}), undefined);
        assert.equal(featureImageUrl(undefined), undefined);
    });
});

describe('Field helpers', function () {
    it('getText reads strings, element text and missing values', function () {
        assert.equal(getText('text'), 'text');
        assert.equal(getText({'@_domain': 'category', '#text': 'Name'}), 'Name');
        assert.equal(getText({'@_domain': 'category'}), '');
        assert.equal(getText(undefined), '');
        assert.equal(getText(null), '');
    });

    it('wxrDate reads zoneless timestamps as UTC and rejects zeroed ones', function () {
        assert.equal(wxrDate('2013-11-02 23:02:32')!.toISOString(), '2013-11-02T23:02:32.000Z');
        assert.equal(wxrDate('2013-11-02T23:02:32+01:00')!.toISOString(), '2013-11-02T22:02:32.000Z');
        assert.equal(wxrDate('0000-00-00 00:00:00'), undefined);
        assert.equal(wxrDate(''), undefined);
    });

    it('postDates prefers post_date_gmt, then pubDate, then post_date, and uses the modified date', function () {
        const gmt = postDates({
            'wp:post_date_gmt': '2020-01-02 03:04:05',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
            'wp:post_modified_gmt': '2021-01-01 00:00:00'
        });
        assert.equal(gmt.published!.toISOString(), '2020-01-02T03:04:05.000Z');
        assert.equal(gmt.modified!.toISOString(), '2021-01-01T00:00:00.000Z');

        const pubDate = postDates({
            'wp:post_date_gmt': '0000-00-00 00:00:00',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000'
        });
        assert.equal(pubDate.published!.toISOString(), '2013-11-02T23:02:32.000Z');
        assert.equal(pubDate.modified, pubDate.published);

        const local = postDates({
            'wp:post_date_gmt': '0000-00-00 00:00:00',
            pubDate: '',
            'wp:post_date': '2019-03-11 17:15:07'
        });
        assert.equal(local.published!.toISOString(), '2019-03-11T17:15:07.000Z');

        assert.deepEqual(postDates({pubDate: 'never'}), {published: undefined, modified: undefined});
    });

    it('postSlug takes the last path segment without .html', function () {
        assert.equal(postSlug('/blog/basic-post.html'), 'basic-post');
        assert.equal(postSlug('/blog2023/04/05/my-dated-post.html'), 'my-dated-post');
        assert.equal(postSlug('/null'), 'untitled');
        assert.equal(postSlug(''), 'untitled');
    });

    it('htmlToTextTrimmed cuts long text back to whole words', function () {
        assert.equal(htmlToTextTrimmed('<h2>Our  Services</h2><p>Short</p>', 50), 'Our Services  Short');
        assert.equal(htmlToTextTrimmed('<p>one two three four</p>', 10), 'one two');
        assert.equal(htmlToTextTrimmed('', 10), '');
    });
});
