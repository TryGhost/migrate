/* eslint no-undef: 0 */
import processor from '../lib/processor.js';

// Import our fixtures
import singlePostFixture from './fixtures/single-post.json';
import singleUserfixture from './fixtures/single-user.json';
import multipleUsersfixture from './fixtures/multiple-users.json';
import singlePagefixture from './fixtures/single-page.json';
import singleCptPostfixture from './fixtures/single-cpt-post.json';
import singlePostWithDuplicateImagesfixture from './fixtures/single-post-with-duplicate-images.json';
import singlePostWithHtmlInTitlefixture from './fixtures/single-post-with-html-in-title.json';
import singlePostNoAuthorFixture from './fixtures/single-post-no-author.json';

describe('Process WordPress REST API JSON', function () {
    test('Can convert a single post', async function () {
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com/bloob'};
        const post = await processor.processPost(singlePostFixture, users, options);

        expect(post).toBeObject();
        expect(post).toHaveProperty('url');
        expect(post).toHaveProperty('data');

        expect(post.url).toEqual('https://mysite.com/bloob/2020/09/05/my-awesome-post-with-a-canonical');

        const data = post.data;
        expect(data).toBeObject();

        expect(data.created_at).toEqual('2019-11-07T15:36:54');
        expect(data.published_at).toEqual('2019-11-07T15:36:54');
        expect(data.updated_at).toEqual('2019-11-07T15:37:03');
        expect(data.slug).toEqual('my-awesome-post');
        expect(data.title).toEqual('My Awesome Post');

        expect(data.feature_image).toEqual('https://mysite.com/wp-content/uploads/2019/11/BOOP.jpg');
        expect(data.feature_image_alt).toEqual('Boopity');
        expect(data.feature_image_caption).toEqual('This is Boopity');

        expect(data.tags).toBeArrayOfSize(6);
        expect(data.tags[5].data.name).toEqual('#wp');
    });

    test('Can convert a single user', function () {
        const user = processor.processAuthor(singleUserfixture);

        expect(user).toBeObject();
        expect(user).toHaveProperty('url');
        expect(user).toHaveProperty('data');

        expect(user.url).toEqual('https://mysite.com/author/example');

        const data = user.data;
        expect(data).toBeObject();

        expect(data.id).toEqual(29);
        expect(data.slug).toEqual('example');
        expect(data.name).toEqual('Example User');
        expect(data.bio).toEqual('Lorem ipsum small bio.\r\n\r\nAnd emoji 🤓 on the second line.');
        expect(data.profile_image).toEqual('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=3000&d=mm&r=g');
        expect(data.website).toEqual('https://example.com');
    });

    test('Can convert a multiple users', function () {
        const users = processor.processAuthors(multipleUsersfixture);

        expect(users).toBeArrayOfSize(2);

        // Converting multiple users uses the same fns as a single user, so let's
        // just test that the second users data is correct for this
        const user = users[1];

        expect(user).toBeObject();
        expect(user).toHaveProperty('url');
        expect(user).toHaveProperty('data');

        expect(user.url).toEqual('https://mysite.com/author/another-user');

        const data = user.data;
        expect(data).toBeObject();

        expect(data.id).toEqual(30);
        expect(data.slug).toEqual('another-user');
        expect(data.name).toEqual('Another User');
        expect(data.bio).toEqual('A different user bio');
        expect(data.profile_image).toEqual('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=3000&d=mm&r=g');
        expect(data.website).toEqual('https://anothersite.com');
    });

    test('Can convert a single page', async function () {
        const users = null;
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const page = await processor.processPost(singlePagefixture, users, options);

        expect(page).toBeObject();
        expect(page).toHaveProperty('url');
        expect(page).toHaveProperty('data');

        expect(page.url).toEqual('https://mysite.com/sample-page');

        const data = page.data;
        expect(data).toBeObject();
        expect(data.type).toEqual('page');

        expect(data.created_at).toEqual('2020-09-17T11:49:03');
        expect(data.published_at).toEqual('2020-09-17T11:49:03');
        expect(data.updated_at).toEqual('2020-09-18T11:15:32');

        expect(data.slug).toEqual('sample-page');
        expect(data.title).toEqual('Sample Page');

        expect(data.feature_image).toEqual('https://mysite.com/wp-content/uploads/2020/09/sample-image-scaled.jpg');
    });

    test('Can convert a custom post type', async function () {
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(singleCptPostfixture, users, options);

        const data = post.data;

        expect(data.type).toEqual('post');
        expect(data.slug).toEqual('my-cpt-post');
        expect(data.title).toEqual('My CPT Post');

        expect(data.tags).toBeArrayOfSize(7);
        expect(data.tags[6].data.slug).toEqual('hash-mycpt');
        expect(data.tags[6].data.name).toEqual('#mycpt');
    });

    test('Can add a #wp-post tag when also converting a custom post type', async function () {
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(singlePostFixture, users, options);

        const data = post.data;

        expect(data.tags).toBeArrayOfSize(7);
        expect(data.tags[6].data.slug).toEqual('hash-wp-post');
        expect(data.tags[6].data.name).toEqual('#wp-post');
    });

    test('Can convert entities in tags names', async function () {
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com'};
        const post = await processor.processPost(singlePostFixture, users, options);

        const data = post.data;

        expect(data.tags).toBeArrayOfSize(6);
        expect(data.tags[0].data.slug).toEqual('boop');
        expect(data.tags[0].data.name).toEqual('Boop');
        expect(data.tags[1].data.slug).toEqual('foo');
        expect(data.tags[1].data.name).toEqual('foo');
        expect(data.tags[2].data.slug).toEqual('bar-baz');
        expect(data.tags[2].data.name).toEqual('Bar & Baz');
        expect(data.tags[3].data.slug).toEqual('boop');
        expect(data.tags[3].data.name).toEqual('boop');
        expect(data.tags[4].data.slug).toEqual('beep');
        expect(data.tags[4].data.name).toEqual('beep');
        expect(data.tags[5].data.slug).toEqual('hash-wp');
        expect(data.tags[5].data.name).toEqual('#wp');
    });

    test('Can remove first image in post if same as feature image', async function () {
        const users = [];
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: 'mycpt'};
        const post = await processor.processPost(singlePostWithDuplicateImagesfixture, users, options);

        const data = post.data;

        expect(data.html).toEqual('\n<h2><strong>This is my strong headline thing.</strong></h2>\n\n\n\n<p><em>Note: this article contains awesomeness</em></p>');
    });

    test('Can use the first available author is none is set ', async function () {
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
        const post = await processor.processPost(singlePostNoAuthorFixture, users, options);

        const data = post.data;

        expect(data.author.data.slug).toEqual('admin');
        expect(data.author.data.name).toEqual('The Admin');
    });

    test('Can add addTag to value pages', async function () {
        const users = [];

        const options = {tags: true, addTag: 'My New Tag'};
        const post = await processor.processPost(singlePagefixture, users, options);

        const data = post.data;

        expect(data.tags).toBeArrayOfSize(1);

        expect(data.tags[0].data.slug).toEqual('my-new-tag');
        expect(data.tags[0].data.name).toEqual('My New Tag');
    });

    test('Can remove HTML from post titles', async function () {
        const users = [];
        const options = {};
        const post = await processor.processPost(singlePostWithHtmlInTitlefixture, users, options);

        const data = post.data;

        expect(data.title).toEqual('Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua');
    });
});

describe('Process WordPress HTML', function () {
    test('Can process basic HTML', async function () {
        const html = `<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>');
    });

    test('Can wrap a nested unordered list in a HTML card', async function () {
        const html = `<ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul><!--kg-card-end: html-->');
    });

    test('Can wrap a nested ordered list in a HTML card', async function () {
        const html = `<ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an ordered list with `type` attr in a HTML card', async function () {
        const html = `<ol type="a"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><ol type="a"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an ordered list with `start` attr in a HTML card', async function () {
        const html = `<ol start="2"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><ol start="2"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an list that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an list in a div that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<div><ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol></div>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<div><!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html--></div>');
    });

    test('Can leave image divs alone', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg" /></div>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg"></div>');
    });

    test('Can wrap styled elements in a HTML card', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><p>Hello</p></div>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><div style="padding: 20px; background: #ff6600;"><p>Hello</p></div><!--kg-card-end: html-->');
    });

    test('Can find & update smaller images', async function () {
        const html = `<img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /><img src="https://mysite.com/wp-content/uploads/2020/06/another-image-1200x800.png" />`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/another-image.png">');
    });

    test('Can find & remove links around images that link to the same image', async function () {
        const html = `<a href="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a>`;

        const processed = await processor.processContent(html);

        expect(processed).toEqual('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a>');
    });

    test('Can handle a single button element', async function () {
        const html = `<div class="wp-container-1 is-horizontal is-content-justification-center wp-block-buttons">
        <div class="wp-block-button"><a class="wp-block-button__link" href="https://ghost.org" target="_blank" rel="noreferrer noopener">Ghost</a></div>
        </div>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org" class="kg-btn kg-btn-accent">Ghost</a></div>');
    });

    test('Can handle a multiple button element', async function () {
        const html = `<div class="wp-container-2 wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="Ghost.org">Hello</a></div><div class="wp-block-button"><a class="wp-block-button__link" href="apple.com">World</a></div></div>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<div class="kg-card kg-button-card kg-align-left"><a href="Ghost.org" class="kg-btn kg-btn-accent">Hello</a></div><div class="kg-card kg-button-card kg-align-left"><a href="apple.com" class="kg-btn kg-btn-accent">World</a></div>');
    });

    test('Can process audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3"></audio><figcaption>My audio file</figcaption></figure>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" style="width: 100%;"></audio><figcaption>My audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process autoplay audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay=""></audio><figcaption>My autoplay audio file</figcaption></figure>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay style="width: 100%;"></audio><figcaption>My autoplay audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process looped audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" loop=""></audio><figcaption>My looped audio file</figcaption></figure>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" loop style="width: 100%;"></audio><figcaption>My looped audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process looped autoplay audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay="" loop=""></audio><figcaption>My looped autoplay audio file</figcaption></figure>`;
        const processed = await processor.processContent(html);

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay loop style="width: 100%;"></audio><figcaption>My looped autoplay audio file</figcaption></figure><!--kg-card-end: html-->');
    });
});
