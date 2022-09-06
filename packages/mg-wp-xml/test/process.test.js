require('./utils');
const path = require('path');
const fs = require('fs').promises;
const process = require('../lib/process');

describe('Process', function () {
    // We're not testing HTML transformation here, so stub the function so it's not called upon
    beforeEach(function () {
        process.processHTMLContent = sinon.stub();
        process.processHTMLContent.returns('Example content');
    });

    afterEach(function () {
        sinon.restore();
    });

    it('Can convert a single published post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        post.should.be.an.Object();
        post.url.should.eql('https://example.com/blog/basic-post.html');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('basic-post');
        data.title.should.eql('Basic Post');
        data.status.should.eql('published');
        data.published_at.should.eql(new Date('2013-06-07T03:00:44.000Z'));
        data.created_at.should.eql(new Date('2013-06-07T03:00:44.000Z'));
        data.updated_at.should.eql(new Date('2013-06-07T03:00:44.000Z'));
        data.feature_image.should.eql('https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        data.type.should.eql('post');
        // We're not testing HTML output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(2);
        tags[0].url.should.eql('/tag/company-news');
        tags[0].data.slug.should.eql('company-news');
        tags[0].data.name.should.eql('Company News');
        tags[1].url.should.eql('migrator-added-tag');
        tags[1].data.name.should.eql('#wp');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('hermione-example-com');
        author.data.slug.should.eql('hermione-example-com');
        author.data.name.should.eql('Hermione Granger');
        author.data.email.should.eql('hermione@example.com');
    });

    it('Can convert a single draft post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];

        post.should.be.an.Object();
        post.url.should.eql('https://example.com/draft-post');

        const data = post.data;

        data.should.be.an.Object();
        data.slug.should.eql('draft-post');
        data.title.should.eql('Draft Post');
        data.status.should.eql('draft');
        data.published_at.should.eql(new Date('2013-11-02T23:02:32.000Z'));
        data.created_at.should.eql(new Date('2013-11-02T23:02:32.000Z'));
        data.updated_at.should.eql(new Date('2013-11-02T23:02:32.000Z'));
        should.not.exist(data.feature_image);
        data.type.should.eql('post');
        // We're not testing HTML output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(2);
        tags[0].url.should.eql('/tag/company-news');
        tags[0].data.slug.should.eql('company-news');
        tags[0].data.name.should.eql('Company News');
        tags[1].url.should.eql('migrator-added-tag');
        tags[1].data.name.should.eql('#wp');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('harry-example-com');
        author.data.slug.should.eql('harry-example-com');
        author.data.name.should.eql('Harry Potter');
        author.data.email.should.eql('harry@example.com');
    });

    it('Can convert a published page', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true
            }
        };
        const inputXMLPath = path.resolve('./test/fixtures/sample.xml');
        const input = await fs.readFile(inputXMLPath, 'utf-8');
        const processed = await process.all(input, ctx);

        const page = processed.posts[2];

        page.should.be.an.Object();
        page.url.should.eql('https://example.com/services');

        const data = page.data;

        data.should.be.an.Object();
        data.slug.should.eql('services');
        data.title.should.eql('Services');
        data.status.should.eql('published');
        data.published_at.should.eql(new Date('2017-05-27T11:33:38.000Z'));
        should.not.exist(data.feature_image);
        data.type.should.eql('page');
        // We're not testing HTML output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        tags.should.be.an.Array().with.lengthOf(1);
        tags[0].url.should.eql('migrator-added-tag');
        tags[0].data.name.should.eql('#wp');

        const author = data.author;

        author.should.be.an.Object();
        author.url.should.eql('migrator-added-author');
        author.data.slug.should.eql('migrator-added-author');
    });
});
