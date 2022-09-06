// Switch these lines once there are useful utils
const testUtils = require('./utils');

const processor = require('../lib/processor');

describe('Process', function () {
    it('Can convert a single post', async function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com/bloob'};
        const post = await processor.processPost(fixture, users, options);

        post.should.be.an.Object().with.properties('url', 'data');

        post.url.should.eql('https://mysite.com/bloob/2020/09/05/my-awesome-post-with-a-canonical');

        post.data.should.be.an.Object();
        const data = post.data;

        data.created_at.should.eql('2019-11-07T15:36:54');
        data.published_at.should.eql('2019-11-07T15:36:54');
        data.updated_at.should.eql('2019-11-07T15:37:03');
        data.slug.should.eql('my-awesome-post');
        data.title.should.eql('My Awesome Post');

        data.html.should.eql('\n<h2><strong>This is my strong headline thing.<\/strong><\/h2>\n\n\n\n<p><em>Note: this article contains awesomeness<\/em><\/p>\n\n\n\n<p>This is a paragraph of text. This is a very short example post.<\/p>\n\n\n\n<!--kg-card-begin: html--><div style=\"height:43px\" aria-hidden=\"true\" class=\"wp-block-spacer\"><\/div><!--kg-card-end: html-->\n\n<figure id=\"attachment_15945\" style=\"width: 1148px\" class=\"wp-caption aligncenter kg-card-hascaption\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/image.png\"><figcaption class=\"wp-caption-text\">My awesome image<\/figcaption><\/figure>\n<!--kg-card-begin: html--><div style=\"width: 1148px\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/image.png\"><img src=\"https://mysite.com/wp-content/uploads/2020/06/another_image.png\"><span class=\"wp-caption-text\">srcset images<\/span><\/div><!--kg-card-end: html--><blockquote><p>Lorem ipsum<\/p><p>Dolor simet<\/p><\/blockquote>'); /* eslint-disable-line no-useless-escape */

        data.feature_image.should.eql('https://mysite.com/wp-content/uploads/2019/11/BOOP.jpg');
        data.feature_image_alt.should.eql('Boopity');
        data.feature_image_caption.should.eql('This is Boopity');

        data.tags.should.be.an.Array().with.lengthOf(6);
        data.tags[5].data.name.should.eql('#wp');
    });

    it('Can find & update smaller images', async function () {
        const fixture = testUtils.fixtures.readSync('single-post-with-smaller-images.json');
        const users = [];
        const options = {tags: true};
        const post = await processor.processPost(fixture, users, options);

        post.data.should.be.an.Object();
        const data = post.data;

        data.html.should.eql('<h2><strong>This is my strong headline thing.</strong></h2>\n' +
        '<img src="https://mysite.com/wp-content/uploads/2020/06/image.png">'); /* eslint-disable-line no-useless-escape */
    });

    it('Can find & remove links around images that link to the same image', async function () {
        const fixture = testUtils.fixtures.readSync('single-post-with-linked-images.json');
        const users = [];
        const options = {tags: true};
        const post = await processor.processPost(fixture, users, options);

        post.data.should.be.an.Object();
        const data = post.data;

        data.html.should.eql('<h2><strong>This is my strong headline thing.</strong></h2>\n' +
        '<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><!--kg-card-begin: html--><a href="https://mysite.com" class="kg-card kg-image-card" style="display: block;"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png" class="kg-image"></a><!--kg-card-end: html--><!--kg-card-begin: html--><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png" class="kg-card kg-image-card" style="display: block;"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png" class="kg-image"></a><!--kg-card-end: html-->'); /* eslint-disable-line no-useless-escape */
    });

    it('Can convert a single user', function () {
        const fixture = testUtils.fixtures.readSync('single-user.json');
        const user = processor.processAuthor(fixture);

        user.should.be.an.Object().with.properties('url', 'data');

        user.url.should.eql('https://mysite.com/author/example');

        user.data.should.be.an.Object();
        const data = user.data;

        data.id.should.eql(29);
        data.slug.should.eql('example');
        data.name.should.eql('Example User');
        data.bio.should.eql('Lorem ipsum small bio.\r\n\r\nAnd emoji 🤓 on the second line.');
        data.profile_image.should.eql('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=3000&d=mm&r=g');
        data.website.should.eql('https://example.com');
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

    it('Can convert a single page', async function () {
        const fixture = testUtils.fixtures.readSync('single-page.json');
        const users = null;
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const page = await processor.processPost(fixture, users, options);

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

    it('Can convert a custom post type', async function () {
        const fixture = testUtils.fixtures.readSync('single-cpt-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.type.should.eql('post');
        data.slug.should.eql('my-cpt-post');
        data.title.should.eql('My CPT Post');

        data.html.should.eql('<p>This is a very short example post.</p>');

        data.tags.should.be.an.Array().with.lengthOf(7);
        data.tags[6].data.slug.should.eql('hash-mycpt');
        data.tags[6].data.name.should.eql('#mycpt');
    });

    it('Can add a #wp-post tag when also converting a custom post type', async function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.tags.should.be.an.Array().with.lengthOf(7);
        data.tags[6].data.slug.should.eql('hash-wp-post');
        data.tags[6].data.name.should.eql('#wp-post');
    });

    it('Can convert entities in tags names', async function () {
        const fixture = testUtils.fixtures.readSync('single-post.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.tags.should.be.an.Array().with.lengthOf(6);
        data.tags[0].data.slug.should.eql('boop');
        data.tags[0].data.name.should.eql('Boop');
        data.tags[1].data.slug.should.eql('foo');
        data.tags[1].data.name.should.eql('foo');
        data.tags[2].data.slug.should.eql('bar-baz');
        data.tags[2].data.name.should.eql('Bar & Baz');
        data.tags[3].data.slug.should.eql('boop');
        data.tags[3].data.name.should.eql('boop');
        data.tags[4].data.slug.should.eql('beep');
        data.tags[4].data.name.should.eql('beep');
        data.tags[5].data.slug.should.eql('hash-wp');
        data.tags[5].data.name.should.eql('#wp');
    });

    it('Can remove first image in post if same as feature image', async function () {
        const fixture = testUtils.fixtures.readSync('single-post-with-duplicate-images.json');
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.html.should.eql('\n<h2><strong>This is my strong headline thing.</strong></h2>\n\n\n\n<p><em>Note: this article contains awesomeness</em></p>');
    });

    it('Can use the first available author is none is set ', async function () {
        const fixture = testUtils.fixtures.readSync('single-post-no-author.json');
        const users = [
            {
                url: 'https://mysite.com/author/admin',
                data: {
                    id: 1,
                    slug: 'admin',
                    name: 'The Admin',
                    roles: ['Contributor']
                }
            }
        ];

        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.author.data.slug.should.eql('admin');
        data.author.data.name.should.eql('The Admin');
    });

    it('Can add addTag to value pages', async function () {
        const fixture = testUtils.fixtures.readSync('single-page.json');
        const users = [];

        const options = {tags: true, addTag: 'My New Tag'};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.tags.should.be.an.Array().with.lengthOf(2);

        data.tags[0].data.slug.should.eql('my-new-tag');
        data.tags[0].data.name.should.eql('My New Tag');

        data.tags[1].data.slug.should.eql('hash-wp');
        data.tags[1].data.name.should.eql('#wp');
    });

    it('Can remove HTML from post titles', async function () {
        const fixture = testUtils.fixtures.readSync('single-post-with-html-in-title.json');

        const users = [];
        const options = {};
        const post = await processor.processPost(fixture, users, options);

        const data = post.data;

        data.title.should.eql('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua');
    });
});

describe('Process HTML', function () {
    it('Can convert a basic [caption] shortcode', async function () {
        let transformedShortcode = await processor.processContent({
            html: '[caption id="attachment_6" align="alignright" width="300"]<img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2-300x205.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6" /> The Great Wave[/caption]'
        });

        transformedShortcode.should.eql('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6"><figcaption>The Great Wave</figcaption></figure>');
    });

    it('Can convert a basic [caption] where the image is wrapped in an anchor', async function () {
        let transformedShortcode = await processor.processContent({
            html: '[caption id="attachment_6" align="alignright" width="300"]<a href="https://example.com"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2-300x205.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6" /></a> The Great Wave[/caption]'
        });

        transformedShortcode.should.eql('<!--kg-card-begin: html--><figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://example.com" class="kg-card kg-image-card" style="display: block;"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6 kg-image"></a><figcaption>The Great Wave</figcaption></figure><!--kg-card-end: html-->');
    });

    it('Can convert a basic [caption] where the image is wrapped in an anchor to the same image', async function () {
        let transformedShortcode = await processor.processContent({
            html: '[caption id="attachment_6" align="alignright" width="300"]<a href="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2-300x205.jpg"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2-300x205.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6" /></a> The Great Wave[/caption]'
        });

        transformedShortcode.should.eql('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6"><figcaption>The Great Wave</figcaption></figure>');
    });

    it('Can convert a [caption] shortcode with HTML in the caption', async function () {
        let transformedShortcode = await processor.processContent({
            html: '[caption id="attachment_6" align="alignright" width="300"]<img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2-300x205.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6" /> <strong>The Great Wave</strong>[/caption]'
        });

        transformedShortcode.should.eql('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="http://localhost/wp-content/uploads/2010/07/800px-Great_Wave_off_Kanagawa2.jpg" alt="Kanagawa" title="The Great Wave" width="300" height="205" class="size-medium wp-image-6"><figcaption><strong>The Great Wave</strong></figcaption></figure>');
    });
});
