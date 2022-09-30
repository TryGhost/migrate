/* eslint no-undef: 0 */
const csv = require('@tryghost/mg-fs-utils/lib/csv');
const fs = require('fs');
const path = require('path');
const childProcess = require('child_process');
const processZip = require('../index.js');
const map = require('../lib/mapper');
const process = require('../lib/process');

const inputPath = path.resolve('./test/fixtures/');
const inputZipPath = path.resolve('./test/fixtures/posts.zip');
const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
const inputPostsPath = path.resolve('./test/fixtures/posts');

describe('Process Substack ZIP file', function () {
    beforeAll(function () {
        childProcess.execSync(`zip -r ${inputZipPath} *`, {
            cwd: inputPath
        });
    });

    afterAll(function () {
        fs.unlink(inputZipPath, (err) => {
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
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        });

        expect(processed.posts).toBeArrayOfSize(3);

        expect(processed.posts[0].url).toEqual('https://example.substack.com/p/plain-text');
        expect(processed.posts[0].substackId).toEqual('123401.plain-text');
        expect(processed.posts[0].substackPodcastURL).toEqual(false);
        expect(processed.posts[0].data.slug).toEqual('plain-text');

        expect(processed.posts[1].url).toEqual('https://example.substack.com/p/podcast');
        expect(processed.posts[1].substackId).toEqual('123402.podcast');
        expect(processed.posts[1].substackPodcastURL).toEqual('https://example.com/my-audio/file.mp3');
        expect(processed.posts[1].data.slug).toEqual('podcast');

        expect(processed.posts[2].url).toEqual('https://example.substack.com/p/draft-text');
        expect(processed.posts[2].substackId).toEqual('123404.draft-text');
        expect(processed.posts[2].substackPodcastURL).toEqual(false);
        expect(processed.posts[2].data.slug).toEqual('draft-text');
    });
});

describe('Process unpacked data from a Substack ZIP to Ghost JSON', function () {
    let postDataFromFixtures = null;

    beforeEach(function () {
        const inputCSVString = fs.readFileSync(inputCSVPath, {encoding: 'utf8'});
        const inputCSV = csv.parseString(inputCSVString);

        let input = {
            meta: inputCSV,
            posts: []
        };

        fs.readdirSync(inputPostsPath).forEach((file) => {
            let theHtml = fs.readFileSync(path.resolve(inputPostsPath, file), {encoding: 'utf8'});

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
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        // This attribute gets stripped out in process(), so check it now
        expect(mapped.posts[0].substackId).toEqual('123401.plain-text');

        const processed = await process(mapped, ctx);

        expect(processed.posts).toBeArrayOfSize(3);

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
        expect(data.custom_excerpt).toEqual('Lorem ipsum dolor sit amet.');
        expect(data.type).toEqual('post');
        expect(data.status).toEqual('published');
        expect(data.visibility).toEqual('public');

        expect(data.tags).toBeArrayOfSize(4);

        const tag1 = data.tags[0];
        expect(tag1.url).toEqual('migrator-added-tag');
        expect(tag1.data.name).toEqual('#substack');

        const tag2 = data.tags[1];
        expect(tag2.url).toEqual('https://example.substack.com/tag/newsletter');
        expect(tag2.data.name).toEqual('Newsletter');

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
                url: 'https://example.substack.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        // The 2nd post is a podcast
        const post = processed.posts[1];
        const data = post.data;

        expect(data.tags).toBeArrayOfSize(4);

        const tag1 = data.tags[0];
        expect(tag1.url).toEqual('migrator-added-tag');
        expect(tag1.data.name).toEqual('#substack');

        const tag2 = data.tags[1];
        expect(tag2.url).toEqual('https://example.substack.com/tag/podcast');
        expect(tag2.data.name).toEqual('Podcast');

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
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);
        const processed = await process(mapped, ctx);

        // The 3rd processed post is a draft podcast
        const post = processed.posts[2];

        expect(post.data.status).toEqual('draft');
        expect(post.data.tags[1].data.name).toEqual('Newsletter');
    });

    test('Can migrate posts before a given date', async function () {
        const ctx = {
            options: {
                drafts: true,
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
                threads: true,
                url: 'https://example.substack.com',
                email: 'exampleuser@email.com'
            }
        };
        const mapped = await map(postDataFromFixtures, ctx.options);

        expect(mapped.posts).toBeArrayOfSize(4);
    });
});

describe('Convert HTML from Substack to Ghost-compatible HTML', function () {
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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

        expect(processed.data.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption">\n' +
        '                        <a target="_blank" href="https://example.com">\n' +
        '                            <img src="https://example.com/photo_1200x800.jpeg" alt="A nice photo" class="kg-image">\n' +
        '                            \n' +
        '                        </a>\n' +
        '                        <figcaption class="image-caption">This is a <a href="https://example.com/page">really</a> nice photo</figcaption>\n' +
        '                    </figure>\n' +
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

        const processed = await process.processContent(post, url, options);

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

    test('Can process footnotes in text content', async function () {
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

        const processed = await process.processContent(post, url, options);

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
        '                        <p>Dolor simet <a href="#footnote-anchor-1" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
        '                    </li><li id="footnote-2">\n' +
        '                        <p>Consectetur adipiscing <a href="#footnote-anchor-2" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
        '                    </li><li id="footnote-3">\n' +
        '                        <p>Elit elementum venenatis <a href="#footnote-anchor-3" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
        '                    </li></ol></div><!--kg-card-end: html-->');
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

        const processed = await process.processContent(post, url, options);

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

        const processed = await process.processContent(post, url, options);

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
                title: 'My Image Post'
            },
            metaData: {
                responseData: {
                    og_image: 'https://example.com/content/file_1024x768.jpg'
                }
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await process.processContent(post, url, options);

        expect(processed.data.html).toEqual('<p>My content</p>');
    });
});
