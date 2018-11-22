// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const processPost = require('../lib/process-post');

describe('Process', function () {
    it('Can process a basic medium post', function () {
        const fixture = testUtils.fixtures.readSync('basic-post.html');
        const post = processPost('2018-08-11_blog-post-title-efefef121212.html', fixture);

        post.should.be.a.MediumMetaObject();

        post.url.should.eql('https://medium.com/@JoeBloggs/testpost-efefef12121212');

        post.data.title.should.eql('Blog Post Title');
        post.data.slug.should.eql('blog-post-title');
        post.data.custom_excerpt.should.eql('This is a subtitle of some sort');
        post.data.status.should.eql('published');
        post.data.published_at.should.eql('2018-08-11T11:23:34.123Z');
        post.data.html.should.match(/^<section name="007"/);
        post.data.html.should.match(/<\/section>$/);

        post.data.author.should.be.a.MediumMetaObject();

        post.data.author.url.should.eql('https://medium.com/@JoeBloggs');
        post.data.author.data.name.should.eql('Joe Bloggs');
        post.data.author.data.slug.should.eql('joebloggs');

        post.data.tags.should.be.an.Array().with.lengthOf(2);

        post.data.tags[0].should.be.a.MediumMetaObject();
        post.data.tags[0].url.should.eql('https://medium.com/tag/things');
        post.data.tags[0].data.name.should.eql('Things');
        post.data.tags[0].data.slug.should.eql('things');
        post.data.tags[1].should.be.a.MediumMetaObject();
        post.data.tags[1].url.should.eql('https://medium.com/tag/stuff');
        post.data.tags[1].data.name.should.eql('Stuff');
        post.data.tags[1].data.slug.should.eql('stuff');
    });

    it('Can process a draft medium post', function () {
        const fixture = testUtils.fixtures.readSync('draft-post.html');
        const post = processPost('draft_blog-post-title-ababab121212.html', fixture);

        post.should.be.a.MediumMetaObject();

        post.url.should.eql('https://medium.com/p/ababab12121212');

        post.data.title.should.eql('Blog Post Title');
        post.data.slug.should.eql('blog-post-title');
        post.data.custom_excerpt.should.eql('This is a subtitle of some sort');
        post.data.status.should.eql('draft');
        post.data.html.should.match(/^<section name="007"/);
        post.data.html.should.match(/<\/section>$/);

        // Drafts don't have these
        should.not.exist(post.data.published_at);
        should.not.exist(post.data.author);
        should.not.exist(post.data.tags);
    });
});
