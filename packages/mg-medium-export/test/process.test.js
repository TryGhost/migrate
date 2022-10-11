/* eslint no-undef: 0 */
import fs from 'node:fs';
import path from 'node:path';
import processPost from '../lib/process-post.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = path.join(__dirname, './', 'fixtures', name);
    return fs.readFileSync(fixtureFileName, {encoding: 'utf8'});
};

expect.extend({
    toBeMediumMetaObject(received, expected) {
        const MediumMetaObject = (value) => {
            expect(value).toBeObject();
            expect(value).toHaveProperty('url');
            expect(value).toHaveProperty('data');

            expect(value.url).toBeString();
            expect(value.url).toMatch(/^https:\/\/medium\.com/);
            expect(value.data).toBeObject();
            expect(value.data).toHaveProperty('slug');
        };

        // expected can either be an array or an object
        const expectedResult = MediumMetaObject(received);

        // equality check for received todo and expected todo
        const pass = this.equals(expected, expectedResult);

        if (pass) {
            return {
                message: () => `Expected: ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(received)}`,
                pass: true
            };
        }
        return {
            message: () => `Expected: ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(received)}\n\n${this.utils.diff(expected, received)}`,
            pass: false
        };
    }
});

describe('Process', function () {
    it('Can process a basic medium post', function () {
        const fixture = readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        expect(post).toBeMediumMetaObject();

        expect(post.url).toEqual('https://medium.com/@JoeBloggs/testpost-efefef12121212');

        expect(post.data.title).toEqual('Blog Post Title');
        expect(post.data.slug).toEqual('testpost');
        expect(post.data.custom_excerpt).toEqual('This is a subtitle of some sort');
        expect(post.data.status).toEqual('published');

        expect(post.data.created_at).toEqual('2018-08-11T11:23:34.123Z');
        expect(post.data.published_at).toEqual('2018-08-11T11:23:34.123Z');
        expect(post.data.updated_at).toEqual('2018-08-11T11:23:34.123Z');

        expect(post.data.html).toMatch(/^<section name="007"/);
        expect(post.data.html).toMatch(/<\/section>$/);

        expect(post.data.author).toBeMediumMetaObject();

        expect(post.data.author.url).toEqual('https://medium.com/@JoeBloggs');
        expect(post.data.author.data.name).toEqual('Joe Bloggs');
        expect(post.data.author.data.slug).toEqual('joebloggs');
        expect(post.data.author.data.slug).toEqual('joebloggs');
        expect(post.data.author.data.roles[0]).toEqual('Contributor');

        expect(post.data.tags).toBeArrayOfSize(3);

        expect(post.data.tags[0]).toBeMediumMetaObject();
        expect(post.data.tags[0].url).toEqual('https://medium.com/tag/things');
        expect(post.data.tags[0].data.name).toEqual('Things');
        expect(post.data.tags[0].data.slug).toEqual('things');
        expect(post.data.tags[1]).toBeMediumMetaObject();
        expect(post.data.tags[1].url).toEqual('https://medium.com/tag/stuff');
        expect(post.data.tags[1].data.name).toEqual('Stuff');
        expect(post.data.tags[1].data.slug).toEqual('stuff');
        // Migrator always marks posts with an internal tag
        expect(post.data.tags[2].data.name).toEqual('#medium');
    });

    it('Can process a draft medium post', function () {
        const fixture = readSync('draft-post.html');
        const fakeName = 'draft_blog-post-title-ababab121212.html';
        const post = processPost(fakeName, fixture);

        expect(post).toBeMediumMetaObject();

        expect(post.url).toEqual('https://medium.com/p/ababab12121212');

        expect(post.data.title).toEqual('Blog Post Title');
        expect(post.data.slug).toEqual('blog-post-title');
        expect(post.data.custom_excerpt).toEqual('This is a subtitle of some sort');
        expect(post.data.status).toEqual('draft');
        expect(post.data.html).toMatch(/^<section name="007"/);
        expect(post.data.html).toMatch(/<\/section>$/);

        // Migrator always marks posts with an internal tag
        expect(post.data.tags).toBeArrayOfSize(1);
        expect(post.data.tags[0].data.name).toEqual('#medium');

        // Drafts don't have these
        expect(post.data.published_at).not.toBeDefined();
        expect(post.data.author).not.toBeDefined();
    });

    it('Can do advanced content processing on medium posts', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        expect(post).toBeMediumMetaObject();

        const html = post.data.html;
        const firstDivRegex = /^<section name="007" class="section section--body section--first">[^\w<>]+<div class="(.*?)"/;

        // should start with a section followed by a div
        expect(html).toMatch(firstDivRegex);

        // the first div should not be a section divider anymore (what's in the fixture)
        expect(html.match(firstDivRegex)[1]).not.toEqual('section-divider');
        // this is what we expect instead
        expect(html.match(firstDivRegex)[1]).toEqual('section-content');

        // should not contain a header with the post title
        expect(html).not.toMatch(/<h3[^>]*>Blog Post Title/);

        // should have feature image with caption & alt text
        expect(post.data.feature_image).toEqual('https://cdn-images-1.medium.com/max/2000/abc123.jpeg');
        expect(post.data.feature_image_alt).toEqual('This is image alt text');
        expect(post.data.feature_image_caption).toEqual('This is an image caption');

        // Migrator always marks posts with an internal tag
        expect(post.data.tags).toBeArrayOfSize(4);
        expect(post.data.tags[0].data.name).toEqual('Things');
        expect(post.data.tags[1].data.name).toEqual('Stuff');
        expect(post.data.tags[2].data.name).toEqual('#medium');
        expect(post.data.tags[3].data.name).toEqual('#auto-feature-image');
    });

    it('Can process blockquotes', function () {
        const fixture = readSync('quote-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        expect(post).toBeMediumMetaObject();

        const html = post.data.html;

        expect(html).toContain('<blockquote><p>“Lorem Ipsum”&nbsp;<a href="https://example/com" rel="noopener" target="_blank">Example</a></p></blockquote>');
        expect(html).toContain('<blockquote><p>Lorem Ipsum</p></blockquote>');
    });
});
