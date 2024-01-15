import {URL} from 'node:url';
import {unlink, readdirSync, readFileSync} from 'node:fs';
import {resolve, join} from 'node:path';
import {execSync} from 'node:child_process';
import csv from '@tryghost/mg-fs-utils/lib/csv';
import processZip from '../index.js';
import map from '../lib/mapper.js';
import process, {processContent} from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;

const inputPath = join(__dirname, '/fixtures/');
const inputZipPath = join(__dirname, '/fixtures/posts.zip');
const inputCSVPath = join(__dirname, '/fixtures/posts.csv');
const inputPostsPath = join(__dirname, '/fixtures/posts');

describe('Process Substack ZIP file', function () {
    beforeAll(function () {
        execSync(`zip -r ${inputZipPath} *`, {
            cwd: inputPath
        });
    });

    afterAll(function () {
        unlink(inputZipPath, (err) => {
            if (err) {
                throw err;
            }
        });
    });

    test('Reads ZIP and generates Ghost JSON', async function () {
        const processed = await processZip.ingest({
            options: {
                pathToZip: inputZipPath,
                drafts: true,
                pages: true,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        });

        expect(processed.posts).toBeArrayOfSize(4);

        expect(processed.posts[0].url).toEqual('https://example.substack.com/p/plain-text');
        expect(processed.posts[0].substackId).toEqual('123401.plain-text');
        expect(processed.posts[0].substackPodcastURL).toEqual(false);
        expect(processed.posts[0].data.slug).toEqual('plain-text');
        expect(processed.posts[0].data.type).toEqual('post');

        expect(processed.posts[1].url).toEqual('https://example.substack.com/p/podcast');
        expect(processed.posts[1].substackId).toEqual('123402.podcast');
        expect(processed.posts[1].substackPodcastURL).toEqual('https://example.com/my-audio/file.mp3');
        expect(processed.posts[1].data.slug).toEqual('podcast');
        expect(processed.posts[1].data.type).toEqual('post');

        expect(processed.posts[2].url).toEqual('https://example.substack.com/p/draft-text');
        expect(processed.posts[2].substackId).toEqual('123404.draft-text');
        expect(processed.posts[2].substackPodcastURL).toEqual(false);
        expect(processed.posts[2].data.slug).toEqual('draft-text');
        expect(processed.posts[2].data.type).toEqual('post');

        expect(processed.posts[3].url).toEqual('https://example.substack.com/p/about-us');
        expect(processed.posts[3].substackId).toEqual('123405.about-us');
        expect(processed.posts[3].substackPodcastURL).toEqual(false);
        expect(processed.posts[3].data.slug).toEqual('about-us');
        expect(processed.posts[3].data.type).toEqual('page');
    });
});

describe('Process unpacked data from a Substack ZIP to Ghost JSON', function () {
    let postDataFromFixtures = null;

    beforeEach(function () {
        const inputCSVString = readFileSync(inputCSVPath, {encoding: 'utf8'});
        const inputCSV = csv.parseString(inputCSVString);

        let input = {
            meta: inputCSV,
            posts: []
        };

        readdirSync(inputPostsPath).forEach((file) => {
            let theHtml = readFileSync(resolve(inputPostsPath, file), {encoding: 'utf8'});

            input.posts.push({
                name: file,
                html: theHtml
            });
        });

        postDataFromFixtures = input;
    });

    test('Reads CSV and converts to JSON', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com',
                addPlatformTag: true,
                addTypeTag: true,
                addAccessTag: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        // This attribute gets stripped out in process(), so check it now
        expect(mapped.posts[0].substackId).toEqual('123401.plain-text');

        const processed = await process(mapped, ctx);

        const post = processed.posts[0];
        expect(post).toBeObject();

        expect(post.url).toEqual('https://example.substack.com/p/plain-text');

        const data = post.data;
        expect(data).toBeObject();

        expect(data.slug).toEqual('plain-text');
        expect(data.published_at).toEqual('2019-07-26T20:48:19.814Z');
        expect(data.updated_at).toEqual('2019-07-26T20:48:19.814Z');
        expect(data.created_at).toEqual('2019-07-26T20:48:19.814Z');
        expect(data.title).toEqual('Plain Text');
        expect(data.custom_excerpt).toEqual('“This quote’s rather short”');
        expect(data.type).toEqual('post');
        expect(data.status).toEqual('published');
        expect(data.visibility).toEqual('public');

        expect(data.tags).toBeArrayOfSize(4);

        const tag1 = data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');

        const tag2 = data.tags[1];
        expect(tag2.url).toEqual('migrator-added-tag');
        expect(tag2.data.name).toEqual('#substack');

        const tag3 = data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag-substack-type-newsletter');
        expect(tag3.data.name).toEqual('#substack-type-newsletter');

        const tag4 = data.tags[3];
        expect(tag4.url).toEqual('migrator-added-tag-substack-access-everyone');
        expect(tag4.data.name).toEqual('#substack-access-everyone');

        const author = data.author;
        expect(author.url).toEqual('https://example.substack.com/author/exampleuser');
        expect(author.data.email).toEqual('exampleuser@email.com');
        expect(author.data.slug).toEqual('exampleuser');
    });

    test('Can add a tag based on the post type', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                addPlatformTag: true,
                addTypeTag: true,
                addAccessTag: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        // The 2nd post is a podcast
        const post = processed.posts[1];
        const data = post.data;

        expect(data.tags).toBeArrayOfSize(4);

        const tag1 = data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/podcast');
        expect(tag1.data.name).toEqual('Podcast');

        const tag2 = data.tags[1];
        expect(tag2.url).toEqual('migrator-added-tag');
        expect(tag2.data.name).toEqual('#substack');

        const tag3 = data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag-substack-type-podcast');
        expect(tag3.data.name).toEqual('#substack-type-podcast');

        const tag4 = data.tags[3];
        expect(tag4.url).toEqual('migrator-added-tag-substack-access-everyone');
        expect(tag4.data.name).toEqual('#substack-access-everyone');
    });

    test('Can convert a draft podcast post', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        // The 3rd processed post is a draft podcast
        const post = processed.posts[2];

        expect(post.data.status).toEqual('draft');
        expect(post.data.tags[0].data.name).toEqual('Newsletter');
    });

    test('Can migrate posts before a given date', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com',
                postsBefore: 'January 20, 2021'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        expect(processed.posts).toBeArrayOfSize(1);
    });

    test('Can migrate posts between 2 given dates', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com',
                postsAfter: 'January 20, 2019',
                postsBefore: 'August 12, 2022'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        expect(processed.posts).toBeArrayOfSize(2);
    });

    test('Can migrate posts after a given date', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com',
                postsAfter: 'August 12, 2022'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        expect(processed.posts).toBeArrayOfSize(2);
    });

    test('Can optionally include thread posts', async function () {
        const ctx = {
            options: {
                drafts: true,
                pages: false,
                threads: true,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        expect(mapped.posts).toBeArrayOfSize(4);
    });

    test('Can optionally add custom tag', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                addTag: 'Hello World',
                pages: false,
                addPlatformTag: true,
                addTypeTag: true,
                addAccessTag: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        const post = mapped.posts[0];

        const tag1 = post.data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');
        expect(tag1.data.slug).toEqual('newsletter');

        const tag2 = post.data.tags[1];
        expect(tag2.url).toEqual('https://example.substack.com/tag/hello-world');
        expect(tag2.data.name).toEqual('Hello World');
        expect(tag2.data.slug).toEqual('hello-world');

        const tag3 = post.data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag');
        expect(tag3.data.name).toEqual('#substack');
        expect(tag3.data.slug).toEqual('hash-substack');
    });

    test('Can skip platform tag', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                pages: false,
                addPlatformTag: false,
                addTypeTag: true,
                addAccessTag: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        const post = mapped.posts[0];

        const tag1 = post.data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');
        expect(tag1.data.slug).toEqual('newsletter');

        const tag2 = post.data.tags[1];
        expect(tag2.url).toEqual('migrator-added-tag-substack-type-newsletter');
        expect(tag2.data.name).toEqual('#substack-type-newsletter');
        expect(tag2.data.slug).toEqual('hash-substack-type-newsletter');

        const tag3 = post.data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag-substack-access-everyone');
        expect(tag3.data.name).toEqual('#substack-access-everyone');
        expect(tag3.data.slug).toEqual('hash-substack-access-everyone');
    });

    test('Can skip type tag', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                pages: false,
                addPlatformTag: true,
                addTypeTag: false,
                addAccessTag: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        const post = mapped.posts[0];

        const tag1 = post.data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');
        expect(tag1.data.slug).toEqual('newsletter');

        const tag2 = post.data.tags[1];
        expect(tag2.url).toEqual('migrator-added-tag');
        expect(tag2.data.name).toEqual('#substack');
        expect(tag2.data.slug).toEqual('hash-substack');

        const tag3 = post.data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag-substack-access-everyone');
        expect(tag3.data.name).toEqual('#substack-access-everyone');
        expect(tag3.data.slug).toEqual('hash-substack-access-everyone');
    });

    test('Can skip access tag', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                pages: false,
                addPlatformTag: true,
                addTypeTag: true,
                addAccessTag: false
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        const post = mapped.posts[0];

        const tag1 = post.data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');
        expect(tag1.data.slug).toEqual('newsletter');

        const tag2 = post.data.tags[1];
        expect(tag2.url).toEqual('migrator-added-tag');
        expect(tag2.data.name).toEqual('#substack');
        expect(tag2.data.slug).toEqual('hash-substack');

        const tag3 = post.data.tags[2];
        expect(tag3.url).toEqual('migrator-added-tag-substack-type-newsletter');
        expect(tag3.data.name).toEqual('#substack-type-newsletter');
        expect(tag3.data.slug).toEqual('hash-substack-type-newsletter');
    });

    test('Can skip all platform, type & access tags', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                pages: false,
                addPlatformTag: false,
                addTypeTag: false,
                addAccessTag: false
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        const post = mapped.posts[0];

        const tag1 = post.data.tags[0];
        expect(tag1.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag1.data.name).toEqual('Newsletter');
        expect(tag1.data.slug).toEqual('newsletter');
    });

    test('Can migrate pages', async function () {
        const ctx = {
            options: {
                url: 'https://example.substack.com',
                pages: true
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        expect(mapped.posts).toBeArrayOfSize(3);
        expect(mapped.posts[0].data.type).toEqual('post');
        expect(mapped.posts[1].data.type).toEqual('post');
        expect(mapped.posts[2].data.type).toEqual('page');
    });
});

describe('Convert HTML from Substack to Ghost-compatible HTML', function () {
    test('Returns post object if no HTML present', async function () {
        const post = {
            data: {}
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('');
    });

    test('Can transform subscribe links with custom defined URL', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p><a href="https://example.com/subscribe">Subscribe</a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div><p><a href="#/portal/signup">Subscribe</a></p>`);
    });

    test('Can transform comment buttons with custom defined URL', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/p/my-post/comments&quot;,&quot;text&quot;:&quot;Leave a comment&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/p/my-post/comments"><span>Leave a comment</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            comments: true,
            commentLink: '#post-comments'
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<div class="kg-card kg-button-card kg-align-center"><a href="#post-comments" class="kg-btn kg-btn-accent">Leave a comment</a></div>`);
    });

    test('Can remove transform comment buttons', async function () {
        const post = {
            data: {
                html: `<p>Hello</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/p/my-post/comments&quot;,&quot;text&quot;:&quot;Leave a comment&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/p/my-post/comments"><span>Leave a comment</span></a></p><p>World</p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            comments: false
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<p>Hello</p><p>World</p>`);
    });

    test('Will not change button element hrefs that are not subscribe buttons', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p>Lorem ipsum dolor sit.</p><p class="button-wrapper" data-attrs='{"url":"https://ghost.org","text":"Try Ghost","class":null}'><a class="button primary" href="https://ghost.org"><span>Try Ghost</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div><p>Lorem ipsum dolor sit.</p><div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org/" class="kg-btn kg-btn-accent">Try Ghost</a></div>`);
    });

    test('Will remove share buttons', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/?utm_source=substack&amp;utm_medium=email&amp;utm_content=share&amp;action=share&quot;,&quot;text&quot;:&quot;Share PodSnacks&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/?utm_source=substack&amp;utm_medium=email&amp;utm_content=share&amp;action=share"><span>Share PodSnacks</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div>`);
    });

    test('Can convert signup forms to signup buttons', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p><div class="subscription-widget-wrap" data-attrs="{&quot;url&quot;:&quot;https://example.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe&quot;}"><div class="subscription-widget show-subscribe"><div class="preamble"><p class="cta-caption">You should sign up!</p></div><form class="subscription-widget-subscribe"><input type="email" class="email-input" name="email" placeholder="Type your email…" tabindex="-1"><input type="submit" class="button primary" value="Subscribe"><div class="fake-input-wrapper"><div class="fake-input"></div><div class="fake-button"></div></div></form></div></div>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual(`<p>Lorem ipsum</p><div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>`);
    });

    test('Can convert an image wrapped with a link', async function () {
        const post = {
            data: {
                html: `<div class="captioned-image-container">
                    <figure>
                        <a class="image-link image2 image2-800-1200" target="_blank" href="https://example.com">
                            <img src="https://example.com/photo_1200x800.jpeg" data-attrs="{&quot;src&quot;:&quot;https://example.com/photo_1200x800.jpeg&quot;,&quot;height&quot;:800,&quot;width&quot;:1200,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:185654,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/jpeg&quot;,&quot;href&quot;:&quot;https://apple.com&quot;}" alt="A nice photo">
                            <style>
                                a.image2.image-link.image2-800-1200 {
                                    padding-bottom: 66.66666666666666%;
                                    padding-bottom: min(66.66666666666666%, 800px);
                                    width: 100%;
                                    height: 0;
                                }
                                a.image2.image-link.image2-800-1200 img {
                                    max-width: 1200px;
                                    max-height: 800px;
                                }
                            </style>
                        </a>
                        <figcaption class="image-caption">This is a <a href="https://example.com/page">really</a> nice photo</figcaption>
                    </figure>
                </div>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://example.com"><img src="https://example.com/photo_1200x800.jpeg" class="kg-image" alt="A nice photo" loading="lazy"></a><figcaption>This is a <a href="https://example.com/page">really</a> nice photo</figcaption></figure>\n' +
        '                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>');
    });

    test('Can wrap lists with images in HTML comments', async function () {
        const post = {
            data: {
                html: `<ul>
                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>
                    <li><img src="https://example.com/photo.jpg" alt="A nice photo"></li>
                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>
                </ul>
                <ul>
                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>
                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>
                </ul>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<!--kg-card-begin: html--><ul>\n' +
        '                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>\n' +
        '                    <li><img src="https://example.com/photo.jpg" alt="A nice photo"></li>\n' +
        '                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>\n' +
        '                </ul><!--kg-card-end: html-->\n' +
        '                <ul>\n' +
        '                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>\n' +
        '                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>\n' +
        '                </ul>');
    });

    test('Can process footnotes in text content in old style', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a></p>
                <ol>
                    <li>Lorem</li>
                    <li>Phasellus scelerisque metus id elit elementum venenatis.<a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a></li>
                </ol>
                <ul>
                    <li>Ipsum</li>
                    <li>Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a></li>
                </ul>
                <div class="footnote" id="footnote-1">
                    <a href="#footnote-anchor-1" class="footnote-number" contenteditable="false">1</a>
                    <div class="footnote-content">
                        <p>Lorem ipsum</p>
                        <p>Dolor simet</p>
                    </div>
                </div>
                <div class="footnote" id="footnote-2">
                    <a href="#footnote-anchor-2" class="footnote-number" contenteditable="false">2</a>
                    <div class="footnote-content">
                        <p>Consectetur adipiscing</p>
                    </div>
                </div>
                <div class="footnote" id="footnote-3">
                    <a href="#footnote-anchor-3" class="footnote-number" contenteditable="false">3</a>
                    <div class="footnote-content">
                        <p>Elit elementum venenatis</p>
                    </div>
                </div>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>Lorem ipsum</p>\n' +
        '                <!--kg-card-begin: html--><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a></p><!--kg-card-end: html-->\n' +
        '                <!--kg-card-begin: html--><ol>\n' +
        '                    <li>Lorem</li>\n' +
        '                    <li>Phasellus scelerisque metus id elit elementum venenatis.<a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a></li>\n' +
        '                </ol><!--kg-card-end: html-->\n' +
        '                <!--kg-card-begin: html--><ul>\n' +
        '                    <li>Ipsum</li>\n' +
        '                    <li>Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a></li>\n' +
        '                </ul><!--kg-card-end: html-->\n' +
        '                \n' +
        '                \n' +
        '                <!--kg-card-begin: html--><div class="footnotes"><hr><ol><li id="footnote-1">\n' +
        '                        <p>Lorem ipsum</p>\n' +
        '                        <p>Dolor simet <a href="#footnote-anchor-1" title="Jump back to footnote 1 in the text.">↩</a></p>\n' +
        '                    </li><li id="footnote-2">\n' +
        '                        <p>Consectetur adipiscing <a href="#footnote-anchor-2" title="Jump back to footnote 2 in the text.">↩</a></p>\n' +
        '                    </li><li id="footnote-3">\n' +
        '                        <p>Elit elementum venenatis <a href="#footnote-anchor-3" title="Jump back to footnote 3 in the text.">↩</a></p>\n' +
        '                    </li></ol></div><!--kg-card-end: html-->');
    });

    test('Can process footnotes in text content in new style', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>
                <p>Lorem ipsum<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a>.</p>
                    <p>Dolor simet</p>
                    <p>Dolor simet <a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a>.</p>
                    <p>Hello world</p>
                    <p>Hello world. This<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a> is new</p>
            <div class="footnote"><a id="footnote-1" href="#footnote-anchor-1" class="footnote-number" contenteditable="false">2</a>
                <div class="footnote-content">
                    <p>Note content</p>
                    <p>Two lines</p>
                </div>
            </div>
            <div class="footnote"><a id="footnote-2" href="#footnote-anchor-2" class="footnote-number" contenteditable="false">3</a>
                <div class="footnote-content">
                    <p>More notes</p>
                </div>
            </div>
            <div class="footnote"><a id="footnote-3" href="#footnote-anchor-3" class="footnote-number" contenteditable="false">4</a>
                <div class="footnote-content">
                    <p><a href="https://ghost.org">Link</a> in this one</p>
                </div>
            </div>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>Lorem ipsum</p>\n' +
        '                <!--kg-card-begin: html--><p>Lorem ipsum<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a>.</p><!--kg-card-end: html-->\n' +
        '                    <p>Dolor simet</p>\n' +
        '                    <!--kg-card-begin: html--><p>Dolor simet <a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a>.</p><!--kg-card-end: html-->\n' +
        '                    <p>Hello world</p>\n' +
        '                    <!--kg-card-begin: html--><p>Hello world. This<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a> is new</p><!--kg-card-end: html-->\n' +
        '            \n' +
        '            \n' +
        '            <!--kg-card-begin: html--><div class="footnotes"><hr><ol><li id="footnote-1">\n' +
        '                    <p>Note content</p>\n' +
        '                    <p>Two lines <a href="#footnote-anchor-1" title="Jump back to footnote 1 in the text.">↩</a></p>\n' +
        '                </li><li id="footnote-2">\n' +
        '                    <p>More notes <a href="#footnote-anchor-2" title="Jump back to footnote 2 in the text.">↩</a></p>\n' +
        '                </li><li id="footnote-3">\n' +
        '                    <p><a href="https://ghost.org">Link</a> in this one <a href="#footnote-anchor-3" title="Jump back to footnote 3 in the text.">↩</a></p>\n' +
        '                </li></ol></div><!--kg-card-end: html-->');
    });

    test('Can process embedded posts', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>

                <div class="embedded-post-wrap"
                    data-attrs="{&quot;id&quot;: 123456,&quot;url&quot;: &quot;https://example.substack.com/p/example-post&quot;,&quot;publication_id&quot;: 1234,&quot;publication_name&quot;: &quot;Example Site&quot;,&quot;publication_logo_url&quot;: &quot;https://bucketeer-1234.s3.amazonaws.com/public/images/5678_680x680.png&quot;,&quot;title&quot;: &quot;Lorem ipsum, This is the Title I’m Showing You&quot;,&quot;truncated_body_text&quot;: &quot;Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …&quot;,&quot;date&quot;: &quot;2020-01-24T18:45:11.711Z&quot;,&quot;like_count&quot;: 8,&quot;comment_count&quot;: 3,&quot;utm_campaign&quot;: null}">
                    <a class="embedded-post" native="true"
                        href="https://example.substack.com/p/example-post?utm_source=substack&amp;utm_campaign=post_embed&amp;utm_medium=web">
                        <div class="embedded-post-header">
                            <img class="embedded-post-publication-logo"
                                src="https://bucketeer-1234.s3.amazonaws.com/public/images/5678_680x680.png">
                                    <span class="embedded-post-publication-name">Example Site</span>
                        </div>
                        <div class="embedded-post-title">Lorem ipsum, This is the Title I’m Showing You</div>
                        <div class="embedded-post-body">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …</div><span
                            class="embedded-post-read-more">Read more</span>
                        <div class="embedded-post-meta">2 years ago · 8 likes · 3 comments · Example User</div>
                    </a>
                </div>

                <p>Dolor Simet</p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>Lorem ipsum</p>\n' +
        '\n' +
        '                <!--kg-card-begin: html--><figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.substack.com/p/example-post"><div class="kg-bookmark-content"><div class="kg-bookmark-title">Lorem ipsum, This is the Title I’m Showing You</div><div class="kg-bookmark-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="https://bucketeer-1234.s3.amazonaws.com/public/images/5678_680x680.png"><span class="kg-bookmark-author">Example Site</span></div></div></a></figure><!--kg-card-end: html-->\n' +
        '\n' +
        '                <p>Dolor Simet</p>');
    });

    test('Can add an audio card for podcast posts', async function () {
        const post = {
            substackPodcastURL: 'https://example.com/files/audio.mp3',
            data: {
                html: `<p>Hello</p>`,
                title: 'My Podcast Episode #1'
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toContain('<p>Hello</p>');
        expect(processed.data.html).toContain('<div class="kg-card kg-audio-card">');
        expect(processed.data.html).toContain('<div class="kg-audio-player-container">');
        expect(processed.data.html).toContain('<audio src="https://example.com/files/audio.mp3" preload="metadata"></audio>');
        expect(processed.data.html).toContain('<div class="kg-audio-title">My Podcast Episode #1</div>');
    });

    test('Can remove the first image if it is the same as `og:image`', async function () {
        const post = {
            data: {
                html: `<p></p><img src="https://example.com/content/file_1200x800.jpg" /><p>My content</p>`,
                title: 'My Image Post',
                og_image: 'https://example.com/content/file_1024x768.jpg'
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>My content</p>');
    });

    test('Will take useMetaImage as priority over useFirstImage', async function () {
        const post = {
            data: {
                html: `<p></p><figure><img src="https://example.com/content/first-image.jpg" /><figcaption>My image</figcaption></figure><p>My content</p>`,
                title: 'My Image Post',
                og_image: 'https://example.com/content/file_1024x768.jpg'
            }
        };
        const url = 'https://example.com';
        const options = {
            useMetaImage: true,
            useFirstImage: true
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<figure><img src="https://example.com/content/first-image.jpg"><figcaption>My image</figcaption></figure><p>My content</p>');
        expect(processed.data.feature_image).toEqual('https://example.com/content/file_1024x768.jpg');
    });

    test('Can useFirstImage', async function () {
        const post = {
            data: {
                html: `<p></p><figure><img src="https://example.com/content/first-image.jpg" /><figcaption>My image</figcaption></figure><p>My content</p>`,
                title: 'My Image Post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: true
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>My content</p>');
        expect(processed.data.feature_image).toEqual('https://example.com/content/first-image.jpg');
        expect(processed.data.feature_image_caption).toEqual('My image');
    });

    test('Converts bucketeer image paths', async function () {
        const post = {
            data: {
                html: '<div class="captioned-image-container"><figure><a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1456w" sizes="100vw"><img src="https://bucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/efgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" width="1200" height="800.390625" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/efgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg&quot;,&quot;srcNoWatermark&quot;:null,&quot;fullscreen&quot;:false,&quot;imageSize&quot;:&quot;large&quot;,&quot;height&quot;:683,&quot;width&quot;:1024,&quot;resizeWidth&quot;:1200,&quot;bytes&quot;:188889,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/jpeg&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;topImage&quot;:true,&quot;internalRedirect&quot;:null}" class="sizing-large" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1456w" sizes="100vw" fetchpriority="high"></picture></div></a><figcaption class="image-caption">My image</figcaption></figure></div><p>Hello</p>',
                title: 'My Image Post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" class="kg-image" alt loading="lazy"><figcaption>My image</figcaption></figure><p>Hello</p>');
    });

    test('Converts galleries', async function () {
        const post = {
            data: {
                html: `<div dir="auto" class="body markup">
                    <p>Hello</p>
                    <figure class="frontend-components-ImageGallery-module__imageGallery--shoTe">
                        <div class="pencraft pc-display-flex pc-flexDirection-column pc-gap-8 pc-reset">
                            <div
                                class="pencraft pc-display-flex pc-gap-8 pc-reset frontend-components-ImageGallery-module__imageRow--RFMqP">
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                            </div>
                            <div
                                class="pencraft pc-display-flex pc-gap-8 pc-reset frontend-components-ImageGallery-module__imageRow--RFMqP">
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                            </div>
                            <figcaption class="frontend-components-ImageGallery-module__imageCaption--JESLj">My caption</figcaption>
                        </div>
                    </figure>
                    <p>World</p>
                </div>`,
                title: 'My gallery post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).not.toInclude('<figure class="frontend-components-ImageGallery-module__imageGallery--shoTe">');
        expect(processed.data.html).toInclude('<figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg" width="474" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg" width="474" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg" width="474" height="auto" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg" width="474" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg" width="474" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg" width="474" height="auto" loading="lazy" alt></div></div></div><figcaption>My caption</figcaption></figure>');
    });

    test('Converts embeded galleries', async function () {
        const post = {
            data: {
                html: `<p>Before</p><div class="image-gallery-embed" data-attrs="{&quot;gallery&quot;:{&quot;images&quot;:[{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg&quot;}],&quot;caption&quot;:&quot;My caption&quot;,&quot;alt&quot;:&quot;My alt text&quot;,&quot;staticGalleryImage&quot;:{&quot;type&quot;:&quot;image/png&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1240-6dbe-4463-8494-4171b6c05b3a_1456x964.png&quot;}},&quot;isEditorNode&quot;:true}"></div><p>After</p>`,
                title: 'My gallery embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toBe('<p>Before</p><figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg" width="auto" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg" width="auto" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg" width="auto" height="auto" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg" width="auto" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg" width="auto" height="auto" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg" width="auto" height="auto" loading="lazy" alt></div></div></div><figcaption>My caption</figcaption></figure><p>After</p>');
    });

    test('Includes supplied content in tweet blockquote', async function () {
        const post = {
            data: {
                html: `<p>Hello</p><div class="tweet">
                <a class="tweet-link-top" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-header">
                        <img class="tweet-header-avatar" src="https://example.com/image/twitter_name/w_96/example.jpg" alt="Twitter avatar for @example" loading="lazy">
                        <div class="tweet-header-text">
                            <span class="tweet-author-name">example </span><span class="tweet-author-handle">@example</span>
                        </div>
                    </div>
                    <div class="tweet-text">This is the tweet text</div>
                </a>
                <a class="tweet-link-bottom" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-footer">
                        <span class="tweet-date">1:26 AM ∙ Apr 28, 2022</span>
                        <hr>
                        <div class="tweet-ufi">
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/likes" class="likes">
                                <span class="like-count">50</span>
                                Likes
                            </span>
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/retweets"
                                class="retweets">
                                <span class="rt-count">35</span>
                                Retweets
                            </span>
                        </div>
                    </div>
                </a>
            </div><p>World</p>`,
                title: 'My tweet post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>Hello</p><figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><p lang="en" dir="ltr">This is the tweet text</p>— example (@example) <a href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890">1:26 AM ∙ Apr 28, 2022</a><a href="https://twitter.com/example/status/123456"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure><p>World</p>');
    });
});

describe('Change image element source', function () {
    test('Handle images that link to themselves', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></figure>');
    });

    test('Handle images that link to themselves with no srcset', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></figure>');
    });

    test('Handle images with external links', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://ghost.org"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card"><a href="https://ghost.org"><img src="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></a></figure>');
    });

    test('Handles images with no src attribute', async function () {
        let thehtml = `<p>Hello</p><a class="image-link is-viewable-img image2" target="_blank" href="https://ghost.org"><div class="image2-inset"><picture> <source type="image/webp"><img class="sizing-normal" alt=""></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        expect(processed.data.html).toEqual('<p>Hello</p>');
    });

    test('Can process Instagram embeds', async () => {
        let theHtml = `<div class="instagram" data-attrs="{&quot;instagram_id&quot;:&quot;QWERTYNgZO8&quot;,&quot;title&quot;:&quot;A post shared by Example User (@exampleuser)&quot;,&quot;author_name&quot;:&quot;exampleuser&quot;,&quot;thumbnail_url&quot;:&quot;https://scontent.cdninstagram.com/v/t01.2345-67/e01/p480x480/125269447_123456789439748_5866997504257834626_n.jpg?_nc_ht=scontent.cdninstagram.com&amp;_nc_cat=100&amp;_nc_ohc=ABCDKvvBbVMAX-g_pZ8&amp;tp=1&amp;oh=c4e4faca2360d3c909134133edddccd6&amp;oe=60138323&quot;,&quot;timestamp&quot;:null,&quot;belowTheFold&quot;:false}"><div class="instagram-top-bar"><a class="instagram-author-name" href="https://instagram.com/exampleuser" target="_blank">exampleuser</a></div><a class="instagram-image" href="https://instagram.com/p/QWERTYNgZO8" target="_blank"><img src="https://scontent.cdninstagram.com/v/t01.2345-67/e01/p480x480/125269447_123456789439748_5866997504257834626_n.jpg?_nc_ht=scontent.cdninstagram.com&amp;_nc_cat=100&amp;_nc_ohc=ABCDKvvBbVMAX-g_pZ8&amp;tp=1&amp;oh=c4e4faca2360d3c909134133edddccd6&amp;oe=60138323"></a><div class="instagram-bottom-bar"><div class="instagram-title">A post shared by Example User (<a href="https://instagram.com/exampleuser" target="_blank">@exampleuser</a>)</div></div></div>`;

        const post = {
            data: {
                html: theHtml,
                title: 'My Instagram Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        expect(processed.data.html).toEqual('<figure class="instagram"><iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;" src="https://instagram.com/p/QWERTYNgZO8embed/captioned/"></iframe><script async src="//www.instagram.com/embed.js"></script></figure>');
    });
});
