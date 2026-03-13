import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import {join} from 'node:path';
import {readFileSync} from 'node:fs';
import process from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = join(__dirname, './', 'fixtures', name);
    return readFileSync(fixtureFileName, {encoding: 'utf8'});
};

describe('Process', function () {
    it('Can get site URL from XML file', async function () {
        let ctx = {
            options: {}
        };
        const input = await readSync('sample.xml');
        await process.all(input, ctx);

        assert.equal(ctx.options.url, 'http://example.com');
    });

    it('Can convert a single published post', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: true
            }
        };
        const input = readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        assert.ok(typeof post === 'object' && post !== null);
        assert.equal(post.url, 'http://example.com/blog/basic-post.html');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.equal(data.slug, 'basic-post');
        assert.equal(data.title, 'Basic Post');
        assert.equal(data.status, 'published');
        assert.deepEqual(data.published_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.deepEqual(data.created_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.deepEqual(data.updated_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.equal(data.feature_image, 'https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        assert.equal(data.type, 'post');
        assert.equal(data.html, '<div class="image-block-outer-wrapper layout-caption-below design-layout-inline" data-test="image-block-inline-outer-wrapper">\n' +
        '        <figure class="sqs-block-image-figure intrinsic" style="max-width:409.0px;">\n' +
        '          <a class="sqs-block-image-link" href="https://anothersite.co.uk" target="_blank">\n' +
        '            <div style="padding-bottom:37.4083137512207%;" lass="image-block-wrapper" data-animation-role="image" data-animation-override>\n' +
        '                <noscript><img src="https://images.unsplash.com/photo-1601275225755-f6a6c1730cb1?ixlib=rb-1.2.1&amp;ixid=eyJhcHBfaWQiOjEyMDd9&amp;auto=format&amp;fit=crop&amp;w=2765&amp;q=80"></noscript>\n' +
        '                \n' +
        '            </div>\n' +
        '          </a>\n' +
        '        </figure>\n' +
        '        </div>\n' +
        '        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris pellentesque nisi sed neque vestibulum pulvinar.</p>\n' +
        '        <p>Integer iaculis ac elit a bibendum. Suspendisse rhoncus vitae dui vitae ultrices.</p>\n' +
        '        <table>\n' +
        '            <thead>\n' +
        '                <tr>\n' +
        '                    <th>Width</th>\n' +
        '                    <th>Height</th>\n' +
        '                </tr>\n' +
        '            </thead>\n' +
        '            <tbody>\n' +
        '                <tr>\n' +
        '                    <td>20</td>\n' +
        '                    <td>15</td>\n' +
        '                </tr>\n' +
        '                <tr>\n' +
        '                    <td>40</td>\n' +
        '                    <td>30</td>\n' +
        '                </tr>\n' +
        '            </tbody>\n' +
        '        </table>\n' +
        '        <p>Aenean velit mi, <a href="https://anothersite.co.uk" target="_blank">dapibus</a> eget ex sed, viverra ultrices mi. Nunc at odio bibendum, gravida lectus sit amet, congue dui. Mauris id justo ante. Cras viverra suscipit bibendum.</p>\n' +
        '        <p><strong>Sed vulputate consectetur tortor:</strong></p>\n' +
        '        <ul>\n' +
        '            <li>Lobortis mauris dapibus in</li>\n' +
        '            <li>Donec pharetra, orci sit amet fermentum</li>\n' +
        '            <li>Pretium, nisi arcu molestie mi, nec</li>\n' +
        '            <li>Consequat turpis tortor vulputate quam, mauris vel quam turpis</li>\n' +
        '        </ul>\n' +
        '        <p></p>\n' +
        '        <p>Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Nulla aliquet neque eu lectus sollicitudin, sit amet vestibulum diam commodo.</p>\n' +
        '        <p>&nbsp;</p>\n' +
        '        <p>&nbsp;</p>\n' +
        '        <p>&nbsp;</p>');

        const tags = data.tags;

        assert.equal(tags.length, 2);
        assert.equal(tags[0].url, '/tag/company-news');
        assert.equal(tags[0].data.slug, 'company-news');
        assert.equal(tags[0].data.name, 'Company News');
        assert.equal(tags[1].url, 'migrator-added-tag-sqs');
        assert.equal(tags[1].data.name, '#sqs');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.equal(author.url, 'hermione-example-com');
        assert.equal(author.data.slug, 'hermione-example-com');
        assert.equal(author.data.name, 'Hermione Granger');
        assert.equal(author.data.email, 'hermione@example.com');
    });

    it('Can convert a single draft post', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: true
            }
        };
        const input = readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];

        assert.ok(typeof post === 'object' && post !== null);
        assert.equal(post.url, 'http://example.com/draft-post');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.equal(data.slug, 'draft-post');
        assert.equal(data.title, 'Draft & Post & More—More');
        assert.equal(data.status, 'draft');
        assert.deepEqual(data.published_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.deepEqual(data.created_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.deepEqual(data.updated_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.equal(data.feature_image, undefined);
        assert.equal(data.type, 'post');
        assert.equal(data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. </p>');

        const tags = data.tags;

        assert.equal(tags.length, 2);
        assert.equal(tags[0].url, '/tag/company-news');
        assert.equal(tags[0].data.slug, 'company-news');
        assert.equal(tags[0].data.name, 'Company News');
        assert.equal(tags[1].url, 'migrator-added-tag-sqs');
        assert.equal(tags[1].data.name, '#sqs');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.equal(author.url, 'harrysquatter');
        assert.equal(author.data.slug, 'harrysquatter');
        assert.equal(author.data.name, 'Harry Squatter');
        assert.equal(author.data.email, 'harrysquatter@example.com');
    });

    it('Can convert a published page', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const page = processed.posts[2];

        assert.ok(typeof page === 'object' && page !== null);
        assert.equal(page.url, 'http://example.com/services');

        const data = page.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.equal(data.slug, 'services');
        assert.equal(data.title, 'Services');
        assert.equal(data.status, 'published');
        assert.deepEqual(data.published_at, new Date('2017-05-27T11:33:38.000Z'));
        assert.equal(data.feature_image, undefined);
        assert.equal(data.type, 'page');
        assert.equal(data.html, '<h2>Our Services</h2><p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>');

        const tags = data.tags;

        assert.equal(tags.length, 1);
        assert.equal(tags[0].url, 'migrator-added-tag-sqs');
        assert.equal(tags[0].data.name, '#sqs');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.equal(author.url, 'migrator-added-author');
        assert.equal(author.data.slug, 'migrator-added-author');
    });

    it('Can only convert posts', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: false
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        assert.equal(processed.posts.length, 3);
        assert.equal(processed.posts[0].data.type, 'post');
        assert.equal(processed.posts[1].data.type, 'post');
        assert.equal(processed.posts[2].data.type, 'post');
    });

    it('Can only convert pages', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: false,
                pages: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        assert.equal(processed.posts.length, 2);
        assert.equal(processed.posts[0].data.type, 'page');
    });

    it('Can convert audio block to audio card', async function () {
        let audioBlock = `<div class="sqs-audio-embed"
            data-url="http://example.com/auio-file.mp3"
            data-mime-type=""
            data-title="My podcast"
            data-author="TRXL"
            data-show-download="false"
            data-design-style="minimal"
            data-duration-in-ms="3817000"
            data-color-theme="dark"
        ></div>`;

        let processed = process.processContent(audioBlock);

        assert.ok(processed.includes('<div class="kg-card kg-audio-card">'));
        assert.ok(processed.includes('<audio src="http://example.com/auio-file.mp3"'));
        assert.ok(!processed.includes('<div class="sqs-audio-embed"'));
    });

    it('Can convert blockquotes', async function () {
        let blockquote = `<p>Hello</p>
<figure class="block-animation-none">
  <blockquote data-animation-role="quote">
    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>
  </blockquote>
  <figcaption class="source">— Lipsum</figcaption>
</figure>
<p>World</p>`;

        let processed = process.processContent(blockquote);

        assert.equal(processed, '<p>Hello</p>\n' +
        '<figure class="block-animation-none">\n' +
        '  <blockquote data-animation-role="quote"><p>\n' +
        '    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>\n' +
        '  <br><br>— Lipsum</p></blockquote>\n' +
        '  \n' +
        '</figure>\n' +
        '<p>World</p>');
    });

    it('Can remove elements', async function () {
        let blockquote = `<p>Hello</p><div class="custom-subscribe-form"></div><p>World</p>`;

        let processed = process.processContent(blockquote, {
            removeSelectors: '.custom-subscribe-form'
        });

        assert.equal(processed, '<p>Hello</p><p>World</p>');
    });

    it('Can handle YouTube embeds', async function () {
        let video = `<div class="sqs-html-content" data-sqsp-text-block-content><p>Hello world</p></div>
            <div class="intrinsic" style="max-width:100%">
                <div class="embed-block-wrapper" style="padding-bottom:56.5%;">
                    <div class="sqs-video-wrapper" data-provider-name="YouTube" data-html="&lt;iframe width=&quot;200&quot; height=&quot;113&quot; src=&quot;https://www.youtube.com/embed/lqCmETMKzA8?feature=oembed&quot; frameborder=&quot;0&quot; allow=&quot;accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share&quot; referrerpolicy=&quot;strict-origin-when-cross-origin&quot; allowfullscreen title=&quot;The Video Title&quot;&gt;&lt;/iframe&gt;">
                    </div>
                </div>
            </div>`;

        let processed = process.processContent(video, {
            removeSelectors: '.custom-subscribe-form'
        });

        assert.equal(processed, '<div class="sqs-html-content" data-sqsp-text-block-content><p>Hello world</p></div>\n' +
        '            <figure class="kg-card kg-embed-card"><iframe width="200" height="113" src="https://www.youtube.com/embed/lqCmETMKzA8?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen title="The Video Title"></iframe></figure>');
    });

    it('Can handle posts with no title', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: false,
                pages: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];
        const data = post.data;

        assert.equal(data.title, 'Our Services Sed ut perspiciatis unde omnis iste');

        const tags = data.tags;

        assert.equal(tags.length, 2);
        assert.equal(tags[0].url, 'migrator-added-tag-sqs');
        assert.equal(tags[0].data.name, '#sqs');
        assert.equal(tags[1].url, 'migrator-added-tag-no-title');
        assert.equal(tags[1].data.name, '#no-title');
    });

    it('Will clean up post slugs', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: false
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[2];
        const data = post.data;

        assert.equal(data.slug, 'my-dated-post');
    });

    it('Can add a custom tag', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: false,
                addTag: 'custom-tag'
            }
        };
        const input = readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];
        const customTag = post.data.tags.find(t => t.data.slug === 'custom-tag');

        assert.ok(customTag);
        assert.equal(customTag.url, 'migrator-added-tag');
        assert.equal(customTag.data.name, 'custom-tag');
    });

    it('Returns error for empty input', async function () {
        let ctx = {
            options: {}
        };
        const result = await process.all('', ctx);

        assert.ok(result instanceof Error);
        assert.equal(result.message, 'Input file is empty');
    });

    it('Can set src from data-src on non-thumb images', function () {
        const html = '<img data-src="https://example.com/photo.jpg">';

        const processed = process.processContent(html);

        assert.ok(processed.includes('src="https://example.com/photo.jpg"'));
    });

    it('Can filter out draft posts', async function () {
        let ctx = {
            options: {
                drafts: false,
                posts: true,
                pages: true
            }
        };
        const input = readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const hasDraft = processed.posts.some(p => p.data.status === 'draft');
        assert.equal(hasDraft, false);
    });

    it('Can handle tags option to include post_tag categories', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: false,
                tags: true
            }
        };
        const input = readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];
        const programmingTag = post.data.tags.find(t => t.data.slug === 'programming');

        assert.ok(programmingTag);
        assert.equal(programmingTag.url, '/tag/programming');
        assert.equal(programmingTag.data.name, 'Programming');
    });

    it('Can return empty string for empty content', function () {
        assert.equal(process.processContent(''), '');
        assert.equal(process.processContent(null), '');
        assert.equal(process.processContent(undefined), '');
    });

    it('Can match author by display name', function () {
        const users = [
            {login: 'jdoe', data: {name: 'Jane Doe', slug: 'jdoe', email: 'jane@example.com'}}
        ];
        const sqPost = {
            'wp:post_type': 'post',
            'dc:creator': 'Jane Doe',
            link: '/test-post',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
            title: 'Test',
            'wp:status': 'publish',
            'content:encoded': '<p>Hello</p>'
        };

        const post = process.processPost(sqPost, 0, [sqPost], users, {url: 'http://example.com'});

        assert.equal(post.data.author.data.name, 'Jane Doe');
        assert.equal(post.data.author.login, 'jdoe');
    });

    it('Can match author by email', function () {
        const users = [
            {login: 'jdoe', data: {name: 'Jane Doe', slug: 'jdoe', email: 'jane@example.com'}}
        ];
        const sqPost = {
            'wp:post_type': 'post',
            'dc:creator': 'jane@example.com',
            link: '/test-post',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
            title: 'Test',
            'wp:status': 'publish',
            'content:encoded': '<p>Hello</p>'
        };

        const post = process.processPost(sqPost, 0, [sqPost], users, {url: 'http://example.com'});

        assert.equal(post.data.author.data.name, 'Jane Doe');
    });

    it('Can create author from creator when no users list', function () {
        const sqPost = {
            'wp:post_type': 'post',
            'dc:creator': 'Some Author',
            link: '/test-post',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
            title: 'Test',
            'wp:status': 'publish',
            'content:encoded': '<p>Hello</p>'
        };

        const post = process.processPost(sqPost, 0, [sqPost], null, {url: 'http://example.com'});

        assert.equal(post.data.author.data.name, 'Some Author');
        assert.equal(post.data.author.data.slug, 'some-author');
        assert.equal(post.data.author.data.email, 'some-author@example.com');
    });

    it('Can remove newsletter form wrapper', function () {
        const html = '<p>Hello</p><div class="newsletter-form-wrapper"><input></div><p>World</p>';

        const processed = process.processContent(html);

        assert.equal(processed, '<p>Hello</p><p>World</p>');
    });

    it('Can wrap nested lists in HTML card comments', function () {
        const html = '<ul><li>Item 1<ul><li>Sub item</li></ul></li></ul>';

        const processed = process.processContent(html);

        assert.ok(processed.includes('<!--kg-card-begin: html-->'));
        assert.ok(processed.includes('<!--kg-card-end: html-->'));
    });

    it('Can handle thumb-image with non-adjacent noscript', function () {
        const html = '<div><noscript><img src="https://example.com/photo.jpg"></noscript><span>spacer</span><img class="thumb-image" data-src="https://example.com/photo.jpg"></div>';

        const processed = process.processContent(html);

        // The noscript is not the immediate previous sibling, but we still walk back to find it
        assert.ok(processed.includes('<noscript>'));
        // The thumb-image should be removed since it matches the noscript img
        assert.ok(!processed.includes('thumb-image'));
    });

    it('Uses untitled slug for posts with null link', function () {
        const sqPost = {
            'wp:post_type': 'post',
            'dc:creator': '',
            link: '/null',
            pubDate: 'Sat, 02 Nov 2013 23:02:32 +0000',
            title: 'Test',
            'wp:status': 'publish',
            'content:encoded': '<p>Hello</p>'
        };

        const post = process.processPost(sqPost, 0, [sqPost], null, {url: 'http://example.com'});

        assert.equal(post.data.slug, 'untitled');
    });

    it('Can handle user with missing fields', function () {
        const user = process.processUser({});

        assert.equal(user.login, '');
        assert.equal(user.data.name, '');
        assert.ok(user.data.email.includes('@example.com'));
    });

    it('Can handle post with missing optional fields', function () {
        const sqPost = {};

        const post = process.processPost(sqPost, 0, [sqPost], [], {url: 'http://example.com'});

        assert.equal(post.data.slug, 'untitled');
        assert.equal(post.data.type, '');
        assert.equal(post.data.status, 'draft');
        assert.equal(post.data.html, '');
        assert.equal(post.data.author.url, 'migrator-added-author');
    });

    it('Can handle XML with no authors or items', async function () {
        const xml = '<?xml version="1.0" encoding="UTF-8"?><rss><channel><link>http://example.com</link></channel></rss>';
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: true
            }
        };

        const processed = await process.all(xml, ctx);

        assert.equal(ctx.options.url, 'http://example.com');
        assert.deepEqual(processed.users, []);
        assert.deepEqual(processed.posts, []);
    });

    it('Can handle video wrapper without expected parent structure', function () {
        const html = '<div class="sqs-video-wrapper" data-html="&lt;iframe src=&quot;https://example.com&quot;&gt;&lt;/iframe&gt;"></div>';

        const processed = process.processContent(html);

        // Video wrapper without .embed-block-wrapper parent is left as-is
        assert.ok(processed.includes('sqs-video-wrapper'));
    });
});
