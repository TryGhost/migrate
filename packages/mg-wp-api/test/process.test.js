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
import datedPosts from './fixtures/dated-posts.json';

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
        expect(data.bio).toEqual('Lorem ipsum small bio. And emoji 🤓 on the second line.');
        expect(data.profile_image).toEqual('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=500&d=blank&r=g');
        expect(data.website).toEqual('https://example.com');
    });

    test('Will not add invalid user website URL', function () {
        const user = processor.processAuthor({
            id: 29,
            name: 'Example User',
            url: 'https://#'
        });

        expect(user).toBeObject();
        expect(user.data).toHaveProperty('id');
        expect(user.data).toHaveProperty('name');
        expect(user.data).not.toHaveProperty('website');
    });

    test('Will scale user avatars', function () {
        const user = processor.processAuthor({
            id: 29,
            name: 'Example User',
            avatar_urls: {
                24: 'https://secure.gravatar.com/avatar/cb8419c1d471d55fbca0d63d1fb2b6ac?s=24&d=wp_user_avatar&r=g',
                48: 'https://secure.gravatar.com/avatar/cb8419c1d471d55fbca0d63d1fb2b6ac?s=48&d=wp_user_avatar&r=g',
                96: 'https://secure.gravatar.com/avatar/cb8419c1d471d55fbca0d63d1fb2b6ac?s=96&d=wp_user_avatar&r=g'
            }
        });

        expect(user.data.profile_image).toEqual('https://secure.gravatar.com/avatar/cb8419c1d471d55fbca0d63d1fb2b6ac?s=500&d=blank&r=g');
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
        expect(data.profile_image).toEqual('https://secure.gravatar.com/avatar/205e460b479e2e5b48aec07710c08d50?s=500&d=blank&r=g');
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
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: ['mycpt']};
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
        const options = {tags: true, addTag: null, featureImage: 'featuredmedia', url: 'https://mysite.com', cpt: ['mycpt']};
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

    test('Can use excerpt selector & remove from content', async function () {
        const users = [];
        const options = {
            excerptSelector: 'h2'
        };
        const post = await processor.processPost(singlePostFixture, users, options);

        const data = post.data;

        expect(data.custom_excerpt).toEqual('This is my strong headline thing.');
        expect(data.html).not.toContain('<h2><strong>This is my strong headline thing.</strong></h2>');
    });

    test('Can use excerpt from WordPress API', async function () {
        const users = [];
        const options = {
            excerptSelector: false,
            excerpt: true
        };
        const post = await processor.processPost(singlePostFixture, users, options);

        const data = post.data;

        expect(data.custom_excerpt).toEqual('This is my strong headline thing. Here we have some excerpt content');
    });

    test('Does not filter posts by date of options not present', async function () {
        const users = [
            {
                data: {
                    id: 11,
                    name: 'Example User',
                    slug: 'example'
                }
            }
        ];

        const options = {
            tags: true,
            addTag: null,
            featureImage: 'featuredmedia',
            url: 'https://mysite.com/bloob'
        };

        const posts = await processor.processPosts(datedPosts, users, options);

        expect(posts).toBeArrayOfSize(3);
    });
});

describe('Process excerpt text handling', function () {
    test('Basic text', function () {
        let processed = processor.processExcerpt('Hello');
        expect(processed).toEqual('Hello');
    });

    test('Basic text in <p> tags', function () {
        let processed = processor.processExcerpt('<p>Hello world</p>');
        expect(processed).toEqual('Hello world');
    });

    test('Text with formatting tags', function () {
        let processed = processor.processExcerpt('<p><p>Hello <b>world</b><br>\n\n\t\t\r\r <u>this</u>\r\n is my <span><em>excerpt</em></span></p></p>');
        expect(processed).toEqual('Hello world this is my excerpt');
    });

    test('Removes excess spaces', function () {
        let processed = processor.processExcerpt('<p> Hello     world</p>');
        expect(processed).toEqual('Hello world');
    });

    test('Does not trim very long string', function () {
        let theString = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vestibulum tempus ut massa at cursus. Donec at sapien felis. Pellentesque rutrum arcu velit, eu pulvinar lorem consectetur porta. Nulla elementum dapibus ornare. Fusce in imperdiet nisl. Nulla viverra dapibus sapien id consectetur. Duis pharetra tempor ante, vel bibendum felis blandit non. Duis ut sem ac ligula finibus mattis vitae eget turpis. Praesent a dictum diam, ut pretium arcu. Aenean venenatis, sapien et euismod tincidunt, ex massa venenatis ex, non pellentesque nibh augue ac dolor. In at commodo orci, ut viverra purus. Maecenas at leo rhoncus tellus aliquet porta eu ac libero. Maecenas sagittis quis enim sed bibendum. Praesent mi nunc, mattis eu mattis ut, porta rhoncus felis. Phasellus elit est, vehicula non elit sed, tempor elementum felis. Nullam imperdiet porttitor enim non ultrices. Pellentesque dignissim sem sed tempus lacinia. Proin gravida mollis justo sed convallis. Morbi mattis est tincidunt est pharetra pulvinar. Vivamus scelerisque gravida cursus. Pellentesque non lorem ultrices, eleifend enim sed, gravida erat. Interdum et malesuada fames ac ante ipsum primis in faucibus. Pellentesque faucibus eget magna at facilisis. Praesent feugiat lacinia sem, eu blandit ipsum fermentum eu.';
        let processed = processor.processExcerpt(`<p><p>${theString}</p></p>`);
        expect(processed).toEqual(theString);
    });
});

describe('Process WordPress HTML', function () {
    test('Can process basic HTML', async function () {
        const html = `<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>');
    });

    test('Can wrap a nested unordered list in a HTML card', async function () {
        const html = `<ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><ul><li>Lorem</li><li>Ipsum<ul><li>Sit Amet</li></ul></li></ul><!--kg-card-end: html-->');
    });

    test('Can wrap a nested ordered list in a HTML card', async function () {
        const html = `<ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><ol><li>Lorem</li><li>Ipsum<ol><li>Sit Amet</li></ol></li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an ordered list with `type` attr in a HTML card', async function () {
        const html = `<ol type="a"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><ol type="a"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an ordered list with `start` attr in a HTML card', async function () {
        const html = `<ol start="2"><li>Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><ol start="2"><li>Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an list that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html-->');
    });

    test('Can wrap an list in a div that contains a list item with a `value` attribute n a HTML card', async function () {
        const html = `<div><ul><li value="10">Lorem</li><li>Ipsum</li></ul><ol><li value="10">Lorem</li><li>Ipsum</li></ol></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div><!--kg-card-begin: html--><ul><li value="10">Lorem</li><li>Ipsum</li></ul><!--kg-card-end: html--><!--kg-card-begin: html--><ol><li value="10">Lorem</li><li>Ipsum</li></ol><!--kg-card-end: html--></div>');
    });

    test('Can leave image divs alone', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg" /></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div style="padding: 20px; background: #ff6600;"><img src="https://example.com/images/photo.jpg"></div>');
    });

    test('Can wrap styled elements in a HTML card', async function () {
        const html = `<div style="padding: 20px; background: #ff6600;"><p>Hello</p></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><div style="padding: 20px; background: #ff6600;"><p>Hello</p></div><!--kg-card-end: html-->');
    });

    test('Can find & update smaller images', async function () {
        const html = `<img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /><img src="https://mysite.com/wp-content/uploads/2020/06/another-image-1200x800.png" />`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/another-image.png">');
    });

    test('Can handle images in .wp-caption div', async function () {
        const html = `<div id="attachment_437" style="width: 510px" class="wp-caption aligncenter"><a href="http:/example.com/wp-content/uploads/2015/04/photo.jpg"><img aria-describedby="caption-attachment-437" class="wp-image-437" src="http:/example.com/wp-content/uploads/2015/04/photo.jpg" alt="My photo alt" width="500" height="355" data-wp-pid="437" /></a><p id="caption-attachment-437" class="wp-caption-text">My photo caption</p></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="http:/example.com/wp-content/uploads/2015/04/photo.jpg" class="kg-image" alt="My photo alt" loading="lazy"><figcaption>My photo caption</figcaption></figure>');
    });

    test('Can find & remove links around images that link to the same image', async function () {
        const html = `<a href="https://mysite.com/wp-content/uploads/2020/06/image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image-300x200.png" /></a>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img src="https://mysite.com/wp-content/uploads/2020/06/image.png"><a href="https://mysite.com"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a><a href="https://mysite.com/wp-content/uploads/2020/06/another-image.png"><img src="https://mysite.com/wp-content/uploads/2020/06/image.png"></a>');
    });

    test('Can handle a single button element', async function () {
        const html = `<div class="wp-container-1 is-horizontal is-content-justification-center wp-block-buttons">
        <div class="wp-block-button"><a class="wp-block-button__link" href="https://ghost.org" target="_blank" rel="noreferrer noopener">Ghost</a></div>
        </div>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org" class="kg-btn kg-btn-accent">Ghost</a></div>');
    });

    test('Can handle a multiple button element', async function () {
        const html = `<div class="wp-container-2 wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="Ghost.org">Hello</a></div><div class="wp-block-button"><a class="wp-block-button__link" href="apple.com">World</a></div></div>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div class="kg-card kg-button-card kg-align-left"><a href="Ghost.org" class="kg-btn kg-btn-accent">Hello</a></div><div class="kg-card kg-button-card kg-align-left"><a href="apple.com" class="kg-btn kg-btn-accent">World</a></div>');
    });

    test('Can process audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3"></audio><figcaption>My audio file</figcaption></figure>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" style="width: 100%;"></audio><figcaption>My audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process autoplay audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay=""></audio><figcaption>My autoplay audio file</figcaption></figure>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay style="width: 100%;"></audio><figcaption>My autoplay audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process looped audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" loop=""></audio><figcaption>My looped audio file</figcaption></figure>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" loop style="width: 100%;"></audio><figcaption>My looped audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can process looped autoplay audio files', async function () {
        const html = `<figure class="wp-block-audio"><audio controls="" src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay="" loop=""></audio><figcaption>My looped autoplay audio file</figcaption></figure>`;
        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="wp-block-audio"><audio controls src="http://example.com/wp-content/uploads/2021/12/audio.mp3" autoplay loop style="width: 100%;"></audio><figcaption>My looped autoplay audio file</figcaption></figure><!--kg-card-end: html-->');
    });

    test('Can remove elements by CSS selector', async function () {
        const html = `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi sagittis vel purus sed placerat.</p><div class="ads"><img src="#" /></div><p>Proin est justo, mollis non turpis et, suscipit consequat orci.</p><script src="https://addnetwork.example.com"></script>`;
        let options = {
            removeSelectors: '.ads, script[src*="https://addnetwork.example.com"]'
        };
        const processed = await processor.processContent({html, options});

        expect(processed).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Morbi sagittis vel purus sed placerat.</p><p>Proin est justo, mollis non turpis et, suscipit consequat orci.</p>');
    });

    test('Can change image data-gif to src', async function () {
        const html = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-gif="https://example.com/wp-content/uploads/2022/08/3.gif" />';

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img src="https://example.com/wp-content/uploads/2022/08/3.gif">');
    });

    test('Can change image data-src to src', async function () {
        const html = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-src="https://example.com/wp-content/uploads/2022/08/3.jpg" />';

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img src="https://example.com/wp-content/uploads/2022/08/3.jpg">');
    });

    test('Can remove duplicate <noscript> images', async function () {
        const html = `<div class="elementor-image"><img decoding="async" width="700" height="624" src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt="" data-srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w" sizes="(max-width: 700px) 100vw, 700px" /><noscript><img decoding="async" width="700" height="624" src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt="" srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w" sizes="(max-width: 700px) 100vw, 700px" /></noscript></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div class="elementor-image"><img width="700" height="624" src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt data-srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w"></div>');
    });

    test('Can remove duplicate <noscript> images with data-src (type 1)', async function () {
        const html = `<div class="elementor-image"><img decoding="async" width="700" height="624" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt="" data-srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w" sizes="(max-width: 700px) 100vw, 700px" /><noscript><img decoding="async" width="700" height="624" src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt="" srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w" sizes="(max-width: 700px) 100vw, 700px" /></noscript></div>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<div class="elementor-image"><img width="700" height="624" src="https://www.example.com.com/wp-content/uploads/2023/02/sample.png" class="attachment-medium_large size-medium_large wp-image-1234 lazyload" alt data-srcset="https://www.example.com.com/wp-content/uploads/2023/02/sample.png 700w, https://www.restlesscommunications.com/wp-content/uploads/2023/02/sample-300x267.png 300w"></div>');
    });

    test('Can remove duplicate <noscript> images with data-src (type 2)', async function () {
        const html = `<img decoding="async" class="alignnone wp-image-1234 size-full lazyload" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://example.com/wp-content/uploads/2021/photo.jpg" alt="Photo description" width="1000" height="1500" data-srcset="https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?w=1000&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=768%2C1152&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=600%2C900&amp;ssl=1 600w" sizes="(max-width: 1000px) 100vw, 1000px" /><noscript><img decoding="async" class="alignnone wp-image-1234 size-full lazyload" src="https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=1000%2C1500&#038;ssl=1" alt="Photo description" width="1000" height="1500" srcset="https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?w=1000&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=768%2C1152&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=600%2C900&amp;ssl=1 600w" sizes="(max-width: 1000px) 100vw, 1000px" data-recalc-dims="1" /></noscript>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img class="alignnone wp-image-1234 size-full lazyload" src="https://example.com/wp-content/uploads/2021/photo.jpg" alt="Photo description" width="1000" height="1500" data-srcset="https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?w=1000&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=768%2C1152&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2021/photo.jpg?resize=600%2C900&amp;ssl=1 600w">');
    });

    test('Can remove duplicate <noscript> images with data-src (type 3)', async function () {
        const html = `<img decoding="async" class="alignnone size-large wp-image-22700 lazyload" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" data-src="https://example.com/wp-content/uploads/2020/05/photo-1000x1497.jpg" alt="My photo" width="1000" height="1497" data-srcset="https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=1000%2C1497&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=768%2C1150&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=600%2C898&amp;ssl=1 600w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?w=1002&amp;ssl=1 1002w" sizes="(max-width: 1000px) 100vw, 1000px" /><noscript><img decoding="async" class="alignnone size-large wp-image-22700 lazyload" src="https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=1000%2C1497&#038;ssl=1" alt="My photo" width="1000" height="1497" srcset="https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=1000%2C1497&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=768%2C1150&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=600%2C898&amp;ssl=1 600w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?w=1002&amp;ssl=1 1002w" sizes="(max-width: 1000px) 100vw, 1000px" data-recalc-dims="1" /></noscript>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<img class="alignnone size-large wp-image-22700 lazyload" src="https://example.com/wp-content/uploads/2020/05/photo.jpg" alt="My photo" width="1000" height="1497" data-srcset="https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=1000%2C1497&amp;ssl=1 1000w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=200%2C300&amp;ssl=1 200w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=768%2C1150&amp;ssl=1 768w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?resize=600%2C898&amp;ssl=1 600w, https://i0.wp.com/example.com/wp-content/uploads/2020/05/photo.jpg?w=1002&amp;ssl=1 1002w">');
    });

    test('Can conbine <p> tags in <blockquote>s', async function () {
        const html = `<blockquote><p>Paragraph 1</p><p>Paragraph 2</p><p>Paragraph 3</p></blockquote>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<blockquote><p>Paragraph 1<br><br>Paragraph 2<br><br>Paragraph 3</p></blockquote>');
    });

    test('Can handle <cite> tags in <blockquote>s', async function () {
        const html = `<blockquote class="wp-block-quote"><p><em>Lorem ipsum,<br>dolor simet.<br>Lorem Ipsum.<br>Dolor Simet.</em></p><cite>Person Name, Role. <em>Company</em>. Country.</cite></blockquote>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<blockquote><p><em>Lorem ipsum,<br>dolor simet.<br>Lorem Ipsum.<br>Dolor Simet.</em><br><br>Person Name, Role. <em>Company</em>. Country.</p></blockquote>');
    });

    test('Can convert YouTube embeds from text', async function () {
        const html = `<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">
        https://youtu.be/1234abcd123
        </div></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-embed-card"><iframe width="160" height="90" src="https://www.youtube.com/embed/1234abcd123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure>');
    });

    test('Can convert YouTube embeds from text with figcaption', async function () {
        const html = `<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper">https://youtu.be/abcd1234?si=bcde2345</div><figcaption class="wp-element-caption"><em>Lorem ipsum video figcapion</em>.</figcaption></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-embed-card"><iframe width="160" height="90" src="https://www.youtube.com/embed/abcd1234?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe><figcaption>Lorem ipsum video figcapion.</figcaption></figure>');
    });

    test('Can convert YouTube embeds from iframe src', async function () {
        const html = `<figure class="wp-block-embed is-type-video is-provider-youtube wp-block-embed-youtube wp-embed-aspect-16-9 wp-has-aspect-ratio"><div class="wp-block-embed__wrapper"><span class="embed-youtube" style="text-align:center; display: block;"><iframe loading="lazy" class="youtube-player" width="640" height="360" src="https://www.youtube.com/embed/1234abcd123?version=3&#038;rel=1&#038;showsearch=0&#038;showinfo=1&#038;iv_load_policy=1&#038;fs=1&#038;hl=en-NZ&#038;autohide=2&#038;wmode=transparent" allowfullscreen="true" style="border:0;" sandbox="allow-scripts allow-same-origin allow-popups allow-presentation allow-popups-to-escape-sandbox"></iframe></span></div></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-embed-card"><iframe width="160" height="90" src="https://www.youtube.com/embed/1234abcd123?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe></figure>');
    });

    test('Can convert Twitter embed', async function () {
        const html = `<figure class="wp-block-embed is-type-rich is-provider-twitter wp-block-embed-twitter"><div class="wp-block-embed__wrapper">https://twitter.com/example/status/12345678</div></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<!--kg-card-begin: embed--><figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><a href="https://twitter.com/example/status/12345678"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure><!--kg-card-end: embed-->');
    });

    test('Can convert WP post embed', async function () {
        const mockFileCache = {
            hasFile: (filename) => {
                // Filename is derived from bookmarkHref: https://www.example.org/2025/04/03/lorem-ipsum/
                return filename === 'https___www_example_org_2025_04_03_lorem_ipsum_.json';
            },
            readTmpJSONFile: () => ({
                responseData: {
                    title: 'Lorem Ipsum',
                    description: 'A sample description',
                    image: 'https://www.example.org/images/featured.jpg',
                    icon: 'https://www.example.org/favicon.ico',
                    publisher: 'Example Publisher'
                }
            })
        };

        const html = `<figure class="wp-block-embed is-type-wp-embed is-provider-the-example wp-block-embed-the-example"><div class="wp-block-embed__wrapper"><blockquote class="wp-embedded-content" data-secret="qwertyTVih"><a href="https://www.example.org/2025/04/03/lorem-ipsum/">Lorem Ipsum</a></blockquote><iframe loading="lazy" class="wp-embedded-content" sandbox="allow-scripts" security="restricted" style="position: absolute; visibility: hidden;" title="&#8220;Lorem Ipsum&#8221; &#8212; The Urbanist" src="https://www.example.org/2025/04/03/lorem-ipsum/embed/#?secret=abcd#?secret=qwertyTVih" data-secret="qwertyTVih" width="600" height="338" frameborder="0" marginwidth="0" marginheight="0" scrolling="no"></iframe></div></figure>`;

        const processed = await processor.processContent({html, fileCache: mockFileCache, options: {
            scrape: ['all']
        }});

        expect(processed).toEqual('<!--kg-card-begin: html--><figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://www.example.org/2025/04/03/lorem-ipsum/"><div class="kg-bookmark-content"><div class="kg-bookmark-title">Lorem Ipsum</div><div class="kg-bookmark-description">A sample description</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="https://www.example.org/favicon.ico" alt><span class="kg-bookmark-author">Example Publisher</span></div></div><div class="kg-bookmark-thumbnail"><img src="https://www.example.org/images/featured.jpg" alt></div></a></figure><!--kg-card-end: html-->');
    });

    test('Can convert WP post embed to link when scrape fails', async function () {
        const mockFileCache = {
            hasFile: () => {
                // eslint-disable-next-line ghost/ghost-custom/no-native-error
                throw new Error('Scrape failed');
            }
        };

        const html = `<figure class="wp-block-embed is-type-wp-embed is-provider-the-example wp-block-embed-the-example"><div class="wp-block-embed__wrapper"><blockquote class="wp-embedded-content" data-secret="qwertyTVih"><a href="https://www.example.org/2025/04/03/lorem-ipsum/">Lorem Ipsum</a></blockquote><iframe loading="lazy" class="wp-embedded-content" sandbox="allow-scripts" security="restricted" style="position: absolute; visibility: hidden;" title="&#8220;Lorem Ipsum&#8221; &#8212; The Urbanist" src="https://www.example.org/2025/04/03/lorem-ipsum/embed/#?secret=abcd#?secret=qwertyTVih" data-secret="qwertyTVih" width="600" height="338" frameborder="0" marginwidth="0" marginheight="0" scrolling="no"></iframe></div></figure>`;

        const processed = await processor.processContent({html, fileCache: mockFileCache, options: {
            scrape: ['all']
        }});

        expect(processed).toEqual('<p><a href="https://www.example.org/2025/04/03/lorem-ipsum/">Lorem Ipsum</a></p>');
    });

    test('Can convert WP post embed to link when scrape option is not enabled', async function () {
        const html = `<figure class="wp-block-embed is-type-wp-embed is-provider-the-example wp-block-embed-the-example"><div class="wp-block-embed__wrapper"><blockquote class="wp-embedded-content" data-secret="qwertyTVih"><a href="https://www.example.org/2025/04/03/lorem-ipsum/">Lorem Ipsum</a></blockquote><iframe loading="lazy" class="wp-embedded-content" sandbox="allow-scripts" security="restricted" style="position: absolute; visibility: hidden;" title="&#8220;Lorem Ipsum&#8221; &#8212; The Urbanist" src="https://www.example.org/2025/04/03/lorem-ipsum/embed/#?secret=abcd#?secret=qwertyTVih" data-secret="qwertyTVih" width="600" height="338" frameborder="0" marginwidth="0" marginheight="0" scrolling="no"></iframe></div></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<p><a href="https://www.example.org/2025/04/03/lorem-ipsum/">Lorem Ipsum</a></p>');
    });

    test('Can convert a list-based gallery', async function () {
        const html = `<ul class="wp-block-gallery alignwide columns-3 is-cropped">
            <li class="blocks-gallery-item">
                <figure>
                    <a href="https://example.com/wp-content/uploads/2024/07/photo1.jpg">
                        <img width="500" height="375" src="https://example.com/wp-content/uploads/2024/07/photo1.jpg" class="attachment-large size-large" alt="" data-full="https://example.com/wp-content/uploads/2024/07/photo1.jpg" loading="lazy">
                    </a>
                </figure>
            </li>
            <li class="blocks-gallery-item">
                <figure>
                    <a href="https://example.com/wp-content/uploads/2024/07/photo2.jpg">
                        <img width="500" height="375" src="https://example.com/wp-content/uploads/2024/07/photo2.jpg" class="attachment-large size-large" alt="" data-full="https://example.com/wp-content/uploads/2024/07/photo2.jpg" loading="lazy">
                    </a>
                </figure>
            </li>
            <li class="blocks-gallery-item">
                <figure>
                    <a href="https://example.com/wp-content/uploads/2024/07/photo3.jpg">
                        <img loading="lazy" width="500" height="375" src="https://example.com/wp-content/uploads/2024/07/photo3.jpg" class="attachment-large size-large" alt="">
                    </a>
                </figure>
            </li>
            <li class="blocks-gallery-item">
                <figure>
                    <a href="https://example.com/wp-content/uploads/2024/07/photo4.jpg">
                        <img loading="lazy" width="500" height="375" src="https://example.com/wp-content/uploads/2024/07/photo4.jpg" class="attachment-large size-large" alt="">
                    </a>
                </figure>
            </li>
        </ul>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com/wp-content/uploads/2024/07/photo1.jpg" width="500" height="375" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com/wp-content/uploads/2024/07/photo2.jpg" width="500" height="375" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com/wp-content/uploads/2024/07/photo4.jpg" width="500" height="375" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com/wp-content/uploads/2024/07/photo3.jpg" width="500" height="375" loading="lazy" alt></div></div></div></figure>');
    });

    test('Can convert a figure-based gallery', async function () {
        const html = `<figure class="wp-block-gallery has-nested-images columns-default is-cropped wp-block-gallery-1 is-layout-flex wp-block-gallery-is-layout-flex">
                <figure class="wp-block-image size-large">
                    <a href="https://example.org/wp-content/uploads/2021/01/landscape.jpg">
                        <img width="1000"  height="667"  class="wp-image-24259" src="https://example.org/wp-content/uploads/2021/01/landscape.jpg">
                    </a>
                </figure>
                <figure class="wp-block-image size-large">
                    <a href="https://example.org/wp-content/uploads/2020/12/portrait.jpg">
                        <img width="1000"  height="750"  class="wp-image-24166" src="https://example.org/wp-content/uploads/2020/12/portrait.jpg"  >
                    </a>
                </figure>
            </figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.org/wp-content/uploads/2021/01/landscape.jpg" width="1000" height="667" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.org/wp-content/uploads/2020/12/portrait.jpg" width="1000" height="750" loading="lazy" alt></div></div></div></figure>');
    });

    test('Outputs unchanged HTML is `rawHtml` option is set', async function () {
        const html = `<p style="font-weight: 400;">Hello</p><img data-src="https://example.com/image.jpg" />`;

        const processed = await processor.processContent({html, options: {rawHtml: true}});

        expect(processed).toEqual('<!--kg-card-begin: html--><p style="font-weight: 400;">Hello</p><img data-src="https://example.com/image.jpg" /><!--kg-card-end: html-->');
    });

    test('Adds a <code> tag to syntax highlighted code', async function () {
        const html = `<pre class="wp-block-syntaxhighlighter-code">config:
  color:
    green:
      sage: true</pre>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<pre class="wp-block-syntaxhighlighter-code"><code>config:\n' +
        '  color:\n' +
        '    green:\n' +
        '      sage: true</code></pre>');
    });

    test('Does not add a <code> tag to syntax highlighted code', async function () {
        const html = `<pre class="wp-block-syntaxhighlighter-code"><code>config:
  color:
    green:
      sage: true</code></pre>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<pre class="wp-block-syntaxhighlighter-code"><code>config:\n' +
        '  color:\n' +
        '    green:\n' +
        '      sage: true</code></pre>');
    });
});

describe('Process shortcodes', function () {
    test('Convert convert a caption shortcode to a WP image figure', async function () {
        let html = 'Hello [caption id="attachment_6" align="alignright" width="300"]<img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6" />[/caption] World';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('Hello <figure class="kg-card kg-image-card"><img src="http://example.com/wp-content/uploads/2010/07/image.jpg" class="kg-image" alt="Image of a thing" loading="lazy" title="The Great Image" width="300" height="205"></figure> World');
    });

    test('Convert convert a caption shortcode with text to a WP image figure', async function () {
        let html = 'Hello [caption id="attachment_6" align="alignright" width="300"]<img src="http://example.com/wp-content/uploads/2010/07/image.jpg" alt="Image of a thing" title="The Great Image" width="300" height="205" class="size-medium wp-image-6" /> The Great Image[/caption] World';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('Hello <figure class="kg-card kg-image-card kg-card-hascaption"><img src="http://example.com/wp-content/uploads/2010/07/image.jpg" class="kg-image" alt="Image of a thing" loading="lazy" title="The Great Image" width="300" height="205"><figcaption>The Great Image</figcaption></figure> World');
    });

    test('Will convert $ to entity in caption shortcode', async function () {
        let html = `[caption id="attachment_60523" align="aligncenter" width="680"]<a href="https://example.com/image.jpg"><img src="https://example.com/image.jpg" alt="Lorem ipsum &quot;dolor $$$&quot;" width="680" height="355" class="size-full wp-image-60523" /></a> Person Name[/caption]`;

        let options = {
            attachments: []
        };

        let convertedHtml = await processor.processShortcodes({html, options});

        expect(convertedHtml).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://example.com/image.jpg" class="kg-image" alt="Lorem ipsum &quot;dolor &amp;#36;&amp;#36;&amp;#36;&quot;" loading="lazy" width="680" height="355"><figcaption>Person Name</figcaption></figure>');
    });

    test('Can convert vc_separator to <hr>', async function () {
        let html = 'Hello[vc_separator]World';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('Hello<hr>World');
    });

    test('Can convert vc_btn to WP button element', async function () {
        let html = '[vc_btn title="Read more 1" shape="square" color="black" align="center" link="https%3A%2F%2Fexample.com"] [vc_btn title="Read more 2" shape="square" color="black" align="center" link="https://example.com"] [vc_btn title="Read more 3" shape="square" color="black" align="center" link="url:https%3A%2F%2Fexample.com"]';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 1</a></div></div>');
        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 2</a></div></div>');
        expect(convertedHtml).toInclude('<div class="wp-block-buttons"><div class="wp-block-button"><a class="wp-block-button__link" href="https://example.com">Read more 3</a></div></div>');
    });

    test('Can unwrap common layout shortcodes', async function () {
        let html = 'Hello [vc_row][vc_column][vc_column_text]Lorem[/vc_column_text][/vc_column][vc_column][vc_column_text]Ipsum[/vc_column_text][/vc_column][/vc_row] World';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('Hello Lorem  Ipsum    World');
    });

    test('Can remove gravityform shortcodes', async function () {
        let html = 'Hello [gravityform id="1" title="false" description="false" ajax="true" tabindex="49" field_values="check=First Choice,Second Choice"] World [gravityform id="1" title="false" description="false" ajax="true" tabindex="49" field_values="check=First Choice,Second Choice"/]';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('Hello  World ');
    });

    test('Can remove Divi section shortcodes', async function () {
        let html = '<p>[et_pb_section]My text here[/et_pb_section]</p>';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<p>My text here </p>');
    });

    test('Can remove tested Divi shortcodes', async function () {
        let html = '<p>[et_pb_section][et_pb_column][et_pb_row]Row 1[/et_pb_row][et_pb_row]Row 2[/et_pb_row][/et_pb_column][/et_pb_section]</p>';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<p>Row 1 Row 2   </p>');
    });

    test('Can handle Divi text shortcodes', async function () {
        let html = '<p>[et_pb_text]@ET-DC@abcd1234==@[/et_pb_text][et_pb_text]Hello[/et_pb_text]</p>';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<p> Hello</p>');
    });

    test('Can handle advanced_iframe shortcodes', async function () {
        let html = '[advanced_iframe frameborder="0" height="200" scrolling="no" src="https://example.com?e=123456"]';

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<iframe src="https://example.com?e=123456" height="200" style="border:0; width: 100%;" loading="lazy"></iframe>');
    });

    test('Can handle code shortcodes', async function () {
        let html = `[code]

const hello () => {
  return new MyClass();
}

[/code]`;

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class=""><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre></figure>');
    });

    test('Can handle sourcecode shortcodes', async function () {
        let html = `[sourcecode]

const hello () => {
  return new MyClass();
}

[/sourcecode]`;

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class=""><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre></figure>');
    });

    test('Can handle sourcecode shortcodes with language & title', async function () {
        let html = `[sourcecode language="js" title="My method"]

const hello () => {
  return new MyClass();
}

[/sourcecode]`;

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<figure><pre class="language-js"><code>const hello () => {\n' +
        '  return new MyClass();\n' +
        '}</code></pre><figcaption>My method</figcaption></figure>');
    });

    test('Can handle audio shortcodes', async function () {
        let html = `[audio mp3="/path/to/file.mp3" wav="/path/to/file.wav"][/audio] [audio ogg="/path/to/file.ogg"]`;

        let convertedHtml = await processor.processShortcodes({html});

        expect(convertedHtml).toEqual('<!--kg-card-begin: html--><audio controls src="/path/to/file.mp3" preload="metadata"></audio><!--kg-card-end: html--> <!--kg-card-begin: html--><audio controls src="/path/to/file.ogg" preload="metadata"></audio><!--kg-card-end: html-->');
    });

    test('Can handle gallery shortcodes', async function () {
        let html = `[gallery ids="1,2,3,4,5,6,7,8,9,10,11,12" columns="4" size="full"]`;

        let options = {
            attachments: [
                {
                    id: '1',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/1.jpg',
                    description: null,
                    alt: 'Image 123 alt text',
                    width: 1200,
                    height: 800
                },
                {
                    id: '2',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/2.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '3',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/3.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '4',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/4.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '5',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/5.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '6',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/6.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '7',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/7.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '8',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/8.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '9',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/9.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '10',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/10.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '11',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/11.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                },
                {
                    id: '12',
                    url: 'https://example.com.com/wp-content/uploads/2025/02/24/12.jpg',
                    description: null,
                    alt: '',
                    width: 1200,
                    height: 800
                }
            ]
        };

        let convertedHtml = await processor.processShortcodes({html, options});

        expect(convertedHtml).toEqual('<figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/1.jpg" width="1200" height="800" loading="lazy" alt="Image 123 alt text"></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/2.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/3.jpg" width="1200" height="800" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/4.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/5.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/6.jpg" width="1200" height="800" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/7.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/8.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/9.jpg" width="1200" height="800" loading="lazy" alt></div></div></div></figure><figure class="kg-card kg-gallery-card kg-width-wide"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/10.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/11.jpg" width="1200" height="800" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://example.com.com/wp-content/uploads/2025/02/24/12.jpg" width="1200" height="800" loading="lazy" alt></div></div></div></figure>');
    });

    test('Will skip gallery shortcodes if no attachments avaliable', async function () {
        let html = `[gallery ids="123,234,345,456" columns="4" size="full"]`;

        let options = {
            attachments: []
        };

        let convertedHtml = await processor.processShortcodes({html, options});

        expect(convertedHtml).toEqual('[gallery ids="123,234,345,456" columns="4" size="full"]');
    });
});

describe('wpCDNToLocal', function () {
    test('Does not amend non-CDN URLs', function () {
        const updated = processor.wpCDNToLocal('http://test.com/image.jpg?this-should=stay&and=this');
        expect(updated).toEqual('http://test.com/image.jpg?this-should=stay&and=this');
    });

    test('Updated simple CDN URL', function () {
        const updated = processor.wpCDNToLocal('https://i0.wp.com/example.com/wp-content/uploads/2021/02photo.jpg?resize=200%2C300&amp;ssl=1');
        expect(updated).toEqual('https://example.com/wp-content/uploads/2021/02photo.jpg');
    });

    test('Updated long & subdirectory CDN URL', function () {
        const updated = processor.wpCDNToLocal('https://i0.wp.com/this-is-a-long-one.com/subdir/wp-content/uploads/2021/02photo.jpg?resize=200%2C300&amp;ssl=1');
        expect(updated).toEqual('https://this-is-a-long-one.com/subdir/wp-content/uploads/2021/02photo.jpg');
    });
});
