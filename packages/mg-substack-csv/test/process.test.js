require('./utils');
const parse = require('@tryghost/mg-fs-utils/lib/csv').parse;
const path = require('path');
const map = require('../lib/mapper');
const process = require('../lib/process');

describe('Convert Substack CSV format to Ghost JSON format', function () {
    it('Reads CSV and converts to JSON', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);

        // This attribute gets stripped out in process(), so check it now
        mapped.posts[0].substackId.should.eql('172839.plain-text');

        const processed = await process(mapped, ctx);

        processed.posts.should.be.an.Object();
        processed.posts.length.should.equal(7);

        const post = processed.posts[0];
        post.should.be.an.Object();

        post.url.should.eql('https://dummysite.substack.com/p/plain-text');

        const data = post.data;
        data.should.be.an.Object();

        data.slug.should.eql('plain-text');
        data.published_at.should.eql('2019-07-26T20:48:19.814Z');
        data.updated_at.should.eql('2019-07-26T20:48:19.814Z');
        data.created_at.should.eql('2019-07-26T20:48:19.814Z');
        data.title.should.eql('Plain Text');
        data.html.should.eql('<h2>Lorem Ipsum</h2>\n<p>\n    <a href="/subscribe/"><span>Sign up now</span></a>\n</p>\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.</p>\n<p>Dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>\n<div><hr></div>\n<p>\n    <a href="/subscribe/"><span>Sign up now</span></a>\n</p>\n');
        data.custom_excerpt.should.eql('Lorem ipsum dolor sit amet.');
        data.type.should.eql('post');
        data.status.should.eql('published');
        data.visibility.should.eql('public');

        data.tags.length.should.equal(3);

        const tag1 = data.tags[0];
        tag1.url.should.eql('migrator-added-tag');
        tag1.data.name.should.eql('#substack');

        const tag2 = data.tags[1];
        tag2.url.should.eql('https://dummysite.substack.com/tag/newsletter');
        tag2.data.name.should.eql('Newsletter');

        const tag3 = data.tags[2];
        tag3.url.should.eql('migrator-added-tag-visibility-public');
        tag3.data.name.should.eql('#access-public');

        const author = data.author;
        author.url.should.eql('https://dummysite.substack.com/author/dummyuser');
        author.data.email.should.eql('dummyuser@email.com');
        author.data.slug.should.eql('dummyuser');
    });

    it('Can convert JSON to Ghost JSON', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The second post contains a tweet, which should be converted
        const post = processed.posts[1];

        post.data.html.should.eql('<h2>Aliquam suscipit eros congue</h2>\n' +
        '<blockquote>\n' +
        '    <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam aliquam magna ligula, pretium ornare est luctus eget. Ut commodo sit amet tellus quis commodo.</p>\n' +
        '</blockquote>\n' +
        '<p>Pellentesque <a href="https://dummyurl.com">eget dapibus</a> ante, ut consectetur dolor.</p>\n' +
        '<h3>Mauris ut dapibus neque</h3>\n' +
        '<ul>\n' +
        '    <li>Vestibulum vitae condimentum massa. Aliquam eu pellentesque purus, et hendrerit quam</li>\n' +
        '</ul>\n' +
        '<p>Aliquam et lectus quis nunc mollis convallis vitae nec neque. Curabitur nec laoreet nisi, non iaculis nunc. Phasellus sed leo euismod, efficitur purus sit amet, rutrum nisl. Aliquam non condimentum dui, et auctor nisi.</p>\n' +
        '<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="https://twitter.com/elonmusk/status/1303376024646889472"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>\n' +
        '<p>Curabitur nec laoreet nisi, non iaculis nunc. Phasellus sed leo euismod, efficitur purus sit amet, rutrum nisl. Aliquam non condimentum dui, et auctor nisi.</p>\n');
    });

    it('Can convert a draft podcast post', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The third post is a draft podcast
        const post = processed.posts[2];

        post.data.status.should.eql('draft');
        post.data.tags[1].data.name.should.eql('Podcast');
    });

    it('Can transform subscribe links with custom defined URL', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com',
                subscribeLink: '#/portal/signup'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The first post contains 2 subscribe links
        const post = processed.posts[0];
        const data = post.data;
        data.html.should.eql('<h2>Lorem Ipsum</h2>\n<p>\n    <a href="#/portal/signup"><span>Sign up now</span></a>\n</p>\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.</p>\n<p>Dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>\n<div><hr></div>\n<p>\n    <a href="#/portal/signup"><span>Sign up now</span></a>\n</p>\n');
    });

    it('Can convert a list with an image into a HTML card', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com',
                subscribeLink: '#/portal/signup'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The 5th post contains an image in a list item
        const post = processed.posts[4];
        const data = post.data;
        data.html.should.eql('<h2>Lorem Ipsum</h2>\n<!--kg-card-begin: html--><ul>\n    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>\n    <li>In eleifend tortor nulla, vel aliquet ex pretium ac</li>\n    <li><img src="https://example.com/photo.jpg" alt="A nice photo"></li>\n    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>\n</ul><!--kg-card-end: html-->\n');
    });

    it('Can convert an image wrapped with a link', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The 6th post contains 2 a linked image
        const post = processed.posts[5];
        const data = post.data;
        data.html.should.eql('<h2>Lorem Ipsum</h2>\n<figure class="kg-card kg-image-card kg-card-hascaption">\n        <a target="_blank" href="https://example.com">\n            <img src="https://example.com/photo_1200x800.jpeg" alt="A nice photo" class="kg-image">\n            \n        </a>\n        <figcaption class="image-caption">This is a <a href="https://example.com/page">really</a> nice photo</figcaption>\n    </figure>\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>\n');
    });

    it('Can migrate posts before a given date', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com',
                postsBefore: 'January 20, 2021'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        processed.posts.should.be.an.Object();
        processed.posts.length.should.equal(4);
    });

    it('Can migrate posts between 2 given dates', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com',
                postsAfter: 'July 29, 2019',
                postsBefore: 'January 20, 2021'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        processed.posts.should.be.an.Object();
        processed.posts.length.should.equal(3);
    });

    it('Can migrate posts after a given date', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com',
                postsAfter: 'January 10, 2021'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        processed.posts.should.be.an.Object();
        processed.posts.length.should.equal(4);
    });

    it('Can wrap lists with images in HTML comments', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The 4th post contains an image in an unordered list
        const post = processed.posts[3];
        const data = post.data;
        data.html.should.eql('<h2>Text with Image</h2>\n' +
        '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Aliquam aliquam magna ligula, pretium ornare est luctus eget.</p>\n' +
        '<figure class="kg-card kg-image-card">\n' +
        '        <a target="_blank" href="https://dummysite.substack.com/image.jpg">\n' +
        '            <img src="https://dummysite.substack.com/image.jpg" alt class="kg-image">\n' +
        '        </a>\n' +
        '    </figure>\n' +
        '<p>Phasellus scelerisque metus id elit elementum venenatis. Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.</p>\n' +
        '<!--kg-card-begin: html--><ul>\n' +
        '    <li>\n' +
        '        <img src="https://dummysite.substack.com/image.jpg" alt>\n' +
        '    </li>\n' +
        '</ul><!--kg-card-end: html-->\n' +
        '<ul>\n' +
        '    <li>Lorem</li>\n' +
        '    <li>Ipsum</li>\n' +
        '</ul>\n');
    });

    it('Can process footnotes in text content', async function () {
        const inputCSVPath = path.resolve('./test/fixtures/posts.csv');
        const inputPostsPath = path.resolve('./test/fixtures/posts');

        const input = await parse(inputCSVPath);
        input.should.be.an.Object();

        const ctx = {
            postsDir: inputPostsPath,
            options: {
                drafts: true,
                url: 'https://dummysite.substack.com',
                email: 'dummyuser@email.com'
            }
        };
        const mapped = await map(input, ctx.options);
        const processed = await process(mapped, ctx);

        // The 7th post contains footnotes in <p>, <ol>, and <ul> elements
        const post = processed.posts[6];
        const data = post.data;
        data.html.should.eql('<h2>Text with Footnotes</h2>\n' +
          '<p>Lorem ipsum</p>\n' +
          '<!--kg-card-begin: html--><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a></p><!--kg-card-end: html-->\n' +
          '<!--kg-card-begin: html--><ol>\n' +
          '    <li>Phasellus scelerisque metus id elit elementum venenatis.<a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a></li>\n' +
          '</ol><!--kg-card-end: html-->\n' +
          '<!--kg-card-begin: html--><ul>\n' +
          '    <li>Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a></li>\n' +
          '</ul><!--kg-card-end: html-->\n' +
          '\n' +
          '\n' +
          '\n' +
          '<!--kg-card-begin: html--><div class="footnotes"><hr><ol><li id="footnote-1">\n' +
          '        <p>Lorem ipsum</p>\n' +
          '        <p>Dolor simet <a href="#footnote-anchor-1" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
          '    </li><li id="footnote-2">\n' +
          '        <p>Consectetur adipiscing <a href="#footnote-anchor-2" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
          '    </li><li id="footnote-3">\n' +
          '        <p>Elit elementum venenatis <a href="#footnote-anchor-3" title="Jump back to footnote NaN in the text.">&#x21A9;</a></p>\n' +
          '    </li></ol></div><!--kg-card-end: html-->'
        );
    });
});
