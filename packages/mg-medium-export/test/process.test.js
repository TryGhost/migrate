// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const processPost = require('../lib/process-post');

describe('Process', function () {
    it('Can process a basic medium post', function () {
        const fixture = testUtils.fixtures.readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        post.should.be.a.MediumMetaObject();

        post.url.should.eql('https://medium.com/@JoeBloggs/testpost-efefef12121212');

        post.data.title.should.eql('Blog Post Title');
        post.data.slug.should.eql('testpost');
        post.data.custom_excerpt.should.eql('This is a subtitle of some sort');
        post.data.status.should.eql('published');

        post.data.created_at.should.eql('2018-08-11T11:23:34.123Z');
        post.data.published_at.should.eql('2018-08-11T11:23:34.123Z');
        post.data.updated_at.should.eql('2018-08-11T11:23:34.123Z');

        post.data.html.should.match(/^<section name="007"/);
        post.data.html.should.match(/<\/section>$/);

        post.data.author.should.be.a.MediumMetaObject();

        post.data.author.url.should.eql('https://medium.com/@JoeBloggs');
        post.data.author.data.name.should.eql('Joe Bloggs');
        post.data.author.data.slug.should.eql('joebloggs');
        post.data.author.data.slug.should.eql('joebloggs');
        post.data.author.data.roles[0].should.eql('Contributor');

        post.data.tags.should.be.an.Array().with.lengthOf(3);

        post.data.tags[0].should.be.a.MediumMetaObject();
        post.data.tags[0].url.should.eql('https://medium.com/tag/things');
        post.data.tags[0].data.name.should.eql('Things');
        post.data.tags[0].data.slug.should.eql('things');
        post.data.tags[1].should.be.a.MediumMetaObject();
        post.data.tags[1].url.should.eql('https://medium.com/tag/stuff');
        post.data.tags[1].data.name.should.eql('Stuff');
        post.data.tags[1].data.slug.should.eql('stuff');
        // Migrator always marks posts with an internal tag
        post.data.tags[2].data.name.should.eql('#medium');
    });

    it('Can process a draft medium post', function () {
        const fixture = testUtils.fixtures.readSync('draft-post.html');
        const fakeName = 'draft_blog-post-title-ababab121212.html';
        const post = processPost(fakeName, fixture);

        post.should.be.a.MediumMetaObject();

        post.url.should.eql('https://medium.com/p/ababab12121212');

        post.data.title.should.eql('Blog Post Title');
        post.data.slug.should.eql('blog-post-title');
        post.data.custom_excerpt.should.eql('This is a subtitle of some sort');
        post.data.status.should.eql('draft');
        post.data.html.should.match(/^<section name="007"/);
        post.data.html.should.match(/<\/section>$/);

        // Migrator always marks posts with an internal tag
        post.data.tags.should.be.an.Array().with.lengthOf(1);
        post.data.tags[0].data.name.should.eql('#medium');

        // Drafts don't have these
        should.not.exist(post.data.published_at);
        should.not.exist(post.data.author);
    });

    it('Can do advanced content processing on medium posts', function () {
        const fixture = testUtils.fixtures.readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        post.should.be.a.MediumMetaObject();

        const html = post.data.html;
        const firstDivRegex = /^<section name="007" class="section section--body section--first">[^\w<>]+<div class="(.*?)"/;

        // should start with a section followed by a div
        html.should.match(firstDivRegex);

        // the first div should not be a section divider anymore (what's in the fixture)
        html.match(firstDivRegex)[1].should.not.eql('section-divider');
        // this is what we expect instead
        html.match(firstDivRegex)[1].should.eql('section-content');

        // should not contain a header with the post title
        html.should.not.match(/<h3[^>]*>Blog Post Title/);

        // should have feature image with caption & alt text
        post.data.feature_image.should.eql('https://cdn-images-1.medium.com/max/2000/abc123.jpeg');
        post.data.feature_image_alt.should.eql('This is image alt text');
        post.data.feature_image_caption.should.eql('This is an image caption');

        // Migrator always marks posts with an internal tag
        post.data.tags.should.be.an.Array().with.lengthOf(4);
        post.data.tags[0].data.name.should.eql('Things');
        post.data.tags[1].data.name.should.eql('Stuff');
        post.data.tags[2].data.name.should.eql('#medium');
        post.data.tags[3].data.name.should.eql('#auto-feature-image');
    });

    it('Can process blockquotes', function () {
        const fixture = testUtils.fixtures.readSync('quote-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost(fakeName, fixture);

        post.should.be.a.MediumMetaObject();

        const html = post.data.html;

        html.should.containEql('<blockquote><p>“Lorem Ipsum”&nbsp;<a href="https://example/com" rel="noopener" target="_blank">Example</a></p></blockquote>');
        html.should.containEql('<blockquote><p>Lorem Ipsum</p></blockquote>');
    });
});
