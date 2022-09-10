// Switch these lines once there are useful utils
const testUtils = require('./utils');

const processor = require('../lib/processor');

describe('Process WordPress REST API JSON', function () {
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

        data.tags.should.be.an.Array().with.lengthOf(1);

        data.tags[0].data.slug.should.eql('my-new-tag');
        data.tags[0].data.name.should.eql('My New Tag');
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

describe('Process WordPress HTML', function () {
    it('Can process basic HTML', async function () {
        const html = `<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>');
    });

    it('Can wrap a nested unordered list in a HTML card', async function () {
        const html = `<ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul><!--kg-card-end: html-->');
    });

    it('Can wrap a nested ordered list in a HTML card', async function () {
        const html = `<ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol><!--kg-card-end: html-->');
    });

    it('Can wrap an ordered list with `type` attr in a HTML card', async function () {
        const html = `<ol type="a"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><ol type="a"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    it('Can wrap an ordered list with `start` attr in a HTML card', async function () {
        const html = `<ol start="2"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><ol start="2"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    it('Can wrap an list that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    it('Can wrap an list in a div that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<div><ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol></div>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<div><!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html--></div>');
    });

    it('Can leave image divs alone', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg" /></div>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg"></div>');
    });

    it('Can wrap styled elements in a HTML card', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><p>Hello</p></div>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<!--kg-card-begin: html--><div style="padding: 20px; background: #ff6600;"><p>Hello</p></div><!--kg-card-end: html-->');
    });

    it('Can find & update smaller images', async function () {
        const html = `<img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /><img src="https://mysite.com/wp-content/uploads/2020/06/another-image-1200x800.png" />`;

        const processed = await processor.processContent(html);

        processed.should.eql('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/another-image.png">');
    });

    it('Can find & remove links around images that link to the same image', async function () {
        const html = `<a href="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a>`;

        const processed = await processor.processContent(html);

        processed.should.eql('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a>');
    });

    it('Can handle a single button element', async function () {
        const html = `<div class="wp-container-1 is-horizontal is-content-justification-center wp-block-buttons">
        <div class="wp-block-button"><a class="wp-block-button__link" href="https://ghost.org" target="_blank" rel="noreferrer noopener">Ghost</a></div>
        </div>`;
        const processed = await processor.processContent(html);

        processed.should.eql('<div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org" class="kg-btn kg-btn-accent">Ghost</a></div>');
    });

    it('Can handle a multiple button element', async function () {
        const html = `<div class="wp-container-2 wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="Ghost.org">Hello</a></div><div class="wp-block-button"><a class="wp-block-button__link" href="apple.com">World</a></div></div>`;
        const processed = await processor.processContent(html);

        processed.should.eql('<div class="kg-card kg-button-card kg-align-left"><a href="Ghost.org" class="kg-btn kg-btn-accent">Hello</a></div><div class="kg-card kg-button-card kg-align-left"><a href="apple.com" class="kg-btn kg-btn-accent">World</a></div>');
    });

    // it('Can process audio files', async function () {
    //     const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3"></audio><figcaption>My audio file</figcaption></figure>`;
    //     const processed = await processor.processContent(html);

    //     console.log(processed);

    //     // processed.should.eql('');
    // });

    // it('Can process autoplay audio files', async function () {
    //     const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay=""></audio><figcaption>My autoplay audio file</figcaption></figure>`;
    //     const processed = await processor.processContent(html);

    //     console.log(processed);

    //     // processed.should.eql('');
    // });

    // it('Can process looped audio files', async function () {
    //     const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" loop=""></audio><figcaption>My looped audio file</figcaption></figure>`;
    //     const processed = await processor.processContent(html);

    //     console.log(processed);

    //     // processed.should.eql('');
    // });

    // it('Can process looped autoplay audio files', async function () {
    //     const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay="" loop=""></audio><figcaption>My looped autoplay audio file</figcaption></figure>`;
    //     const processed = await processor.processContent(html);

    //     console.log(processed);

    //     // processed.should.eql('');
    // });
});
