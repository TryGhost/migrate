// Switch these lines once there are useful utils
const testUtils = require('./utils');

const processor = require('../lib/processor');

describe('Process', function () {
    it('Can convert a single post', function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com/bloob'};
        const post = processor.processPost(fixture, users, options);

        post.should.be.an.Object().with.properties('url', 'data');

        post.url.should.eql('https://mysite.com/bloob/2020/09/05/my-awesome-post-with-a-canonical');

        post.data.should.be.an.Object();
        const data = post.data;

        data.created_at.should.eql('2019-11-07T15:36:54');
        data.published_at.should.eql('2019-11-07T15:36:54');
        data.updated_at.should.eql('2019-11-07T15:37:03');
        data.slug.should.eql('my-awesome-post');
        data.title.should.eql('My Awesome Post');

        data.html.should.eql('\n<h2><strong>This is my strong headline thing.<\/strong><\/h2>\n\n\n\n<p><em>Note: this article contains awesomeness<\/em><\/p>\n\n\n\n<p>This is a paragraph of text. This is a very short dummy post.<\/p>\n\n\n\n<!--kg-card-begin: html--><div style=\"height:43px\" aria-hidden=\"true\" class=\"wp-block-spacer\"><\/div><!--kg-card-end: html-->\n\n<figure id=\"attachment_15945\" style=\"width: 1148px\" class=\"wp-caption aligncenter kg-card-hascaption\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/image.png\"><figcaption class=\"wp-caption-text\">My awesome image<\/figcaption><\/figure>\n<!--kg-card-begin: html--><div style=\"width: 1148px\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/image.png\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/another_image.png\"><span class=\"wp-caption-text\">srcset images<\/span><\/div><!--kg-card-end: html--><blockquote><p>Lorem ipsum<\/p><p>Dolor simet<\/p><\/blockquote>'); /* eslint-disable-line no-useless-escape */

        data.feature_image.should.eql('https://mysite.com/wp-content/uploads/2019/11/BOOP.jpg');
        data.feature_image_alt.should.eql('Boopity');
        data.feature_image_caption.should.eql('This is Boopity');

        data.tags.should.be.an.Array().with.lengthOf(6);
        data.tags[5].data.name.should.eql('#wp');
    });

    it('Can convert a single user', function () {
        const fixture = testUtils.fixtures.readSync('single-user.json');
        const user = processor.processAuthor(fixture);

        user.should.be.an.Object().with.properties('url', 'data');

        user.url.should.eql('https://mysite.com/author/dummy');

        user.data.should.be.an.Object();
        const data = user.data;

        data.id.should.eql(29);
        data.slug.should.eql('dummy');
        data.name.should.eql('Dummy User');
        data.bio.should.eql('Lorem ipsum small bio.\r\n\r\nAnd emoji 🤓 on the second line.');
        data.profile_image.should.eql('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=3000&d=mm&r=g');
        data.website.should.eql('https://dummysite.com');
    });

    it('Can convert a multiple users', function () {
        const fixture = testUtils.fixtures.readSync('multiple-users.json');
        const users = processor.processAuthors(fixture);

        users.should.be.an.Object();
        users.should.have.length(2);

        // Converting multiple users uses the same fns as a single user, so let's
        // just test that the second users data is correct for this
        const user = users[1];

        user.should.be.an.Object().with.properties('url', 'data');

        user.url.should.eql('https://mysite.com/author/another-user');

        user.data.should.be.an.Object();
        const data = user.data;

        data.id.should.eql(30);
        data.slug.should.eql('another-user');
        data.name.should.eql('Another User');
        data.bio.should.eql('A different user bio');
        data.profile_image.should.eql('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=3000&d=mm&r=g');
        data.website.should.eql('https://anothersite.com');
    });

    it('Can convert a single page', function () {
        const fixture = testUtils.fixtures.readSync('single-page.json');
        const users = null;
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const page = processor.processPost(fixture, users, options);

        page.should.be.an.Object().with.properties('url', 'data');

        page.url.should.eql('https://mysite.com/sample-page');

        page.data.should.be.an.Object();

        const data = page.data;
        data.type.should.eql('page');

        data.created_at.should.eql('2020-09-17T11:49:03');
        data.published_at.should.eql('2020-09-17T11:49:03');
        data.updated_at.should.eql('2020-09-18T11:15:32');

        data.slug.should.eql('sample-page');
        data.title.should.eql('Sample Page');

        data.html.should.eql('\n<p>This is an example page. It&#8217;s different from a blog post because it will stay in one place and will show up in your site navigation (in most themes). Most people start with an About page that introduces them to potential site visitors.</p>\n'); /* eslint-disable-line no-useless-escape */

        data.feature_image.should.eql('https://mysite.com/wp-content/uploads/2020/09/sample-image-scaled.jpg');
    });

    it('Can convert a custom post type', function () {
        const fixture = testUtils.fixtures.readSync('single-cpt-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = processor.processPost(fixture, users, options);

        const data = post.data;

        data.type.should.eql('post');
        data.slug.should.eql('my-cpt-post');
        data.title.should.eql('My CPT Post');

        data.html.should.eql('<p>This is a very short dummy post.</p>');

        data.tags.should.be.an.Array().with.lengthOf(7);
        data.tags[6].data.slug.should.eql('hash-mycpt');
        data.tags[6].data.name.should.eql('#mycpt');
    });

    it('Can add a #wp-post tag when also converting a custom post type', function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = processor.processPost(fixture, users, options);

        const data = post.data;

        data.tags.should.be.an.Array().with.lengthOf(7);
        data.tags[6].data.slug.should.eql('hash-wp-post');
        data.tags[6].data.name.should.eql('#wp-post');
    });

    it('Can remove first image in post if same as feature image', function () {
        const fixture = testUtils.fixtures.readSync('single-post-with-duplicate-images.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = processor.processPost(fixture, users, options);

        const data = post.data;

        data.html.should.eql('\n<h2><strong>This is my strong headline thing.</strong></h2>\n\n\n\n<p><em>Note: this article contains awesomeness</em></p>');
    });
});
