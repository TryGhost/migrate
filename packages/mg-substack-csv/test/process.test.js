require('./utils');
const parse = require('@tryghost/mg-fs-utils/lib/parse-csv');
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
        processed.posts.length.should.equal(3);

        const post = processed.posts[0];
        post.should.be.an.Object();

        post.url.should.eql('https://dummysite.substack.com/plain-text');

        const data = post.data;
        data.should.be.an.Object();

        data.slug.should.eql('plain-text');
        data.published_at.should.eql('2019-07-26T20:48:19.814Z');
        data.title.should.eql('Plain Text');
        data.html.should.eql('<h2>Lorem Ipsum</h2>\n<a class="button primary" href="/subscribe/"><span>Sign up now</span></a>\n<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.</p>\n<p>Dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>\n<div><hr></div>\n<a class="button primary" href="/subscribe/"><span>Sign up now</span></a>\n');
        data.custom_excerpt.should.eql('Lorem ipsum dolor sit amet.');
        data.type.should.eql('post');
        data.status.should.eql('published');
        data.visibility.should.eql('public');

        data.tags.length.should.equal(2);

        const tag1 = data.tags[0];
        tag1.url.should.eql('migrator-added-tag');
        tag1.data.name.should.eql('#substack');

        const tag2 = data.tags[1];
        tag2.url.should.eql('https://dummysite.substack.com/tag/newsletter');
        tag2.data.name.should.eql('newsletter');

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
        post.data.tags[1].data.name.should.eql('podcast');
    });
});
