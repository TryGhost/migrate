import processor from '../lib/processor.js';
import {processAuthor, processAuthors} from '../lib/utils.js';

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
        const user = processAuthor(singleUserfixture);

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
        const user = processAuthor({
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
        const user = processAuthor({
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
        const users = processAuthors(multipleUsersfixture);

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

        expect(data.custom_excerpt).toEqual('This is my strong headline thing. Here we have some excerpt content […]');
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

describe('Process WordPress HTML', function () {
    test('Can process basic HTML', async function () {
        const html = `<p>This is an example page. It&#8217;s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<p>This is an example page. It’s different from a blog post.</p><ul><li>Lorem</li><li>Ipsum</li></ul><p><strong>Dolor</strong> <a href="https://ghost.org" title="Try Ghost">sit</a> <em>amet</em>.</p>');
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

    test('Can remove elements by CSS selector', async function () {
        const html = `<figure class="is-layout-flex wp-block-gallery-1 wp-block-gallery has-nested-images columns-default is-cropped"><figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/1.jpg" alt="" /></figure><figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/2.jpg" /></figure><figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/3.jpg" alt="" /><figcaption class="wp-element-caption">My caption</figcaption></figure></figure>`;

        const processed = await processor.processContent({html});

        expect(processed).toEqual('<figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/1.jpg" alt></figure><figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/2.jpg"></figure><figure class="wp-block-image size-large"><img src="https://example.com/wp-content/uploads/2022/08/3.jpg" alt><figcaption class="wp-element-caption">My caption</figcaption></figure>');
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
});
