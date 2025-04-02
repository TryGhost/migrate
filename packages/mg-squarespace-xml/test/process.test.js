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
    test('Can get site URL from XML file', async function () {
        let ctx = {
            options: {}
        };
        const input = await readSync('sample.xml');
        await process.all(input, ctx);

        expect(ctx.options.url).toEqual('http://example.com');
    });

    test('Can convert a single published post', async function () {
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

        expect(post).toBeObject();
        expect(post.url).toEqual('http://example.com/blog/basic-post.html');

        const data = post.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('basic-post');
        expect(data.title).toEqual('Basic Post');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.created_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.updated_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.feature_image).toEqual('https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        expect(data.type).toEqual('post');
        expect(data.html).toEqual('<div class="image-block-outer-wrapper layout-caption-below design-layout-inline" data-test="image-block-inline-outer-wrapper">\n' +
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

        expect(tags).toBeArrayOfSize(2);
        expect(tags[0].url).toEqual('/tag/company-news');
        expect(tags[0].data.slug).toEqual('company-news');
        expect(tags[0].data.name).toEqual('Company News');
        expect(tags[1].url).toEqual('migrator-added-tag-sqs');
        expect(tags[1].data.name).toEqual('#sqs');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('hermione-example-com');
        expect(author.data.slug).toEqual('hermione-example-com');
        expect(author.data.name).toEqual('Hermione Granger');
        expect(author.data.email).toEqual('hermione@example.com');
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

        expect(post).toBeObject();
        expect(post.url).toEqual('http://example.com/draft-post');

        const data = post.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('draft-post');
        expect(data.title).toEqual('Draft & Post & More—More');
        expect(data.status).toEqual('draft');
        expect(data.published_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.created_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.updated_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.feature_image).not.toBeDefined();
        expect(data.type).toEqual('post');
        expect(data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. </p>');

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(2);
        expect(tags[0].url).toEqual('/tag/company-news');
        expect(tags[0].data.slug).toEqual('company-news');
        expect(tags[0].data.name).toEqual('Company News');
        expect(tags[1].url).toEqual('migrator-added-tag-sqs');
        expect(tags[1].data.name).toEqual('#sqs');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('harry-example-com');
        expect(author.data.slug).toEqual('harry-example-com');
        expect(author.data.name).toEqual('Harry Potter');
        expect(author.data.email).toEqual('harry@example.com');
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

        expect(page).toBeObject();
        expect(page.url).toEqual('http://example.com/services');

        const data = page.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('services');
        expect(data.title).toEqual('Services');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual(new Date('2017-05-27T11:33:38.000Z'));
        expect(data.feature_image).not.toBeDefined();
        expect(data.type).toEqual('page');
        expect(data.html).toEqual('<h2>Our Services</h2><p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>');

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(1);
        expect(tags[0].url).toEqual('migrator-added-tag-sqs');
        expect(tags[0].data.name).toEqual('#sqs');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('migrator-added-author');
        expect(author.data.slug).toEqual('migrator-added-author');
    });

    test('Can only convert posts', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: true,
                pages: false
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        expect(processed.posts).toBeArrayOfSize(3);
        expect(processed.posts[0].data.type).toEqual('post');
        expect(processed.posts[1].data.type).toEqual('post');
        expect(processed.posts[2].data.type).toEqual('post');
    });

    test('Can only convert pages', async function () {
        let ctx = {
            options: {
                drafts: true,
                posts: false,
                pages: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        expect(processed.posts).toBeArrayOfSize(2);
        expect(processed.posts[0].data.type).toEqual('page');
    });

    test('Can convert audio block to audio card', async function () {
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

        expect(processed).toContain('<div class="kg-card kg-audio-card">');
        expect(processed).toContain('<audio src="http://example.com/auio-file.mp3"');
        expect(processed).not.toContain('<div class="sqs-audio-embed"');
    });

    test('Can convert blockquotes', async function () {
        let blockquote = `<p>Hello</p>
<figure class="block-animation-none">
  <blockquote data-animation-role="quote">
    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>
  </blockquote>
  <figcaption class="source">— Lipsum</figcaption>
</figure>
<p>World</p>`;

        let processed = process.processContent(blockquote);

        expect(processed).toEqual('<p>Hello</p>\n' +
        '<figure class="block-animation-none">\n' +
        '  <blockquote data-animation-role="quote"><p>\n' +
        '    <span>“</span>Lorem ipsum<br><br>dolor simet.<span>”</span>\n' +
        '  <br><br>— Lipsum</p></blockquote>\n' +
        '  \n' +
        '</figure>\n' +
        '<p>World</p>');
    });

    test('Can conremove elements', async function () {
        let blockquote = `<p>Hello</p><div class="custom-subscribe-form"></div><p>World</p>`;

        let processed = process.processContent(blockquote, {
            removeSelectors: '.custom-subscribe-form'
        });

        expect(processed).toEqual('<p>Hello</p><p>World</p>');
    });

    test('Can handle posts with no title', async function () {
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

        expect(data.title).toEqual('Our Services Sed ut perspiciatis unde omnis iste');

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(2);
        expect(tags[0].url).toEqual('migrator-added-tag-sqs');
        expect(tags[0].data.name).toEqual('#sqs');
        expect(tags[1].url).toEqual('migrator-added-tag-no-title');
        expect(tags[1].data.name).toEqual('#no-title');
    });

    test('Will clean up post slugs', async function () {
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

        expect(data.slug).toEqual('my-dated-post');
    });
});
