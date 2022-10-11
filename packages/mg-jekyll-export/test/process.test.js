/* eslint no-undef: 0 */
import {URL} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import processPost from '../lib/process-post.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = path.join(__dirname, './', 'fixtures', name);
    return fs.readFileSync(fixtureFileName, {encoding: 'utf8'});
};

describe('Process', function () {
    test('Can process a basic Jekyll Markdown post', function () {
        const fakeName = '_posts/2021-08-23-basic-post.md';
        const fixture = readSync('2021-08-23-basic-post.md');

        const post = processPost(fakeName, fixture);

        expect(post.data.title).toEqual('This is a Basic Post');
        expect(post.data.slug).toEqual('basic-post');

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('published');

        expect(post.data.created_at.toISOString()).toEqual('2021-08-23T00:00:00.000Z');
        expect(post.data.published_at.toISOString()).toEqual('2021-08-23T00:00:00.000Z');
        expect(post.data.updated_at.toISOString()).toEqual('2021-08-23T00:00:00.000Z');

        expect(post.data.tags[0].url).toEqual('migrator-added-tag');
        expect(post.data.tags[0].data.name).toEqual('#jekyll');

        expect(post.data.html).toEqual('<p>Lorem ipsum <em>dolor</em> sit amet, <strong>consectetur</strong> adipiscing elit. <em><strong>Aliquam</strong></em> risus turpis, dictum ut eros vel, mollis fermentum purus. Sed venenatis cursus vestibulum. Proin auctor consequat viverra.</p>\n' +
            '<p>Praesent sed est laoreet, vehicula nisl ac, fermentum magna.</p>\n' +
            '<p>Lorem ipsum <em>dolor</em> sit amet, <strong>consectetur</strong> adipiscing elit. <em><strong>Aliquam</strong></em> risus turpis, dictum ut eros vel, mollis fermentum purus. Sed venenatis cursus vestibulum. Proin auctor consequat viverra.</p>\n' +
            '<h2>Nulla et enim vel augue ultricies tempus</h2>\n' +
            '<p>Donec eu <a href="https://example.com">luctus neque</a>, ut aliquet justo. Sed eleifend lorem sit amet libero pharetra, et vestibulum nibh pretium. Maecenas viverra nunc tortor, porta convallis quam convallis non. Donec nisl dolor, viverra id tortor accumsan, interdum feugiat sapien. Sed ultrices interdum tristique.</p>\n' +
            '<p><img src="https://example.com/landscape.jpg" alt="A landscape image"></p>\n' +
            '<ul>\n' +
            '<li>Orci varius natoque penatibus et magnis dis</li>\n' +
            '<li>Parturient montes, nascetur ridiculus mus. Suspendisse rutrum justo orci, sed vulputate est interdum a</li>\n' +
            '<li>Nullam convallis, enim id tristique interdum, ligula leo ultricies nisi, eget scelerisque est eros lacinia orci.\n' +
            '<ul>\n' +
            '<li>Sed ante elit, laoreet ut feugiat vel, varius eu elit.</li>\n' +
            '</ul>\n' +
            '</li>\n' +
            '<li>Class aptent taciti sociosqu ad litora torquent per conubia nostra</li>\n' +
            '</ul>\n' +
            '<p>Per inceptos himenaeos. Phasellus pharetra condimentum iaculis. Duis suscipit viverra scelerisque. Maecenas auctor arcu enim, dapibus egestas mi rhoncus quis.</p>\n' +
            '<ul>\n' +
            '<li>Orci varius natoque penatibus et magnis dis</li>\n' +
            '<li>Parturient montes, nascetur ridiculus mus. Suspendisse rutrum justo orci, sed vulputate est interdum a</li>\n' +
            '<li>Nullam convallis, enim id tristique interdum, ligula leo ultricies nisi, eget scelerisque est eros lacinia orci.\n' +
            '<ul>\n' +
            '<li>Sed ante elit, laoreet ut feugiat vel, varius eu elit.</li>\n' +
            '</ul>\n' +
            '</li>\n' +
            '<li>Class aptent taciti sociosqu ad litora torquent per conubia nostra</li>\n' +
            '</ul>\n' +
            '<h3>Fusce efficitur congue hendrerit</h3>\n' +
            '<p>Integer eu viverra ligula. Sed vulputate facilisis aliquam. In ultricies rhoncus justo, in feugiat tortor volutpat id. Morbi mollis tortor vel turpis feugiat tempus.</p>\n' +
            '<h4>Proin pretium faucibus tincidunt</h4>\n' +
            '<p>Praesent ac nulla eu ante pretium vehicula eget pharetra magna. Cras eleifend lobortis lacus, in volutpat diam finibus in.</p>\n' +
            '<h5>Integer posuere libero non nisi commodo molestie</h5>\n' +
            '<p>Donec luctus posuere dui sit amet consectetur. Suspendisse interdum enim eu dolor convallis laoreet. Mauris non metus elit. Nam ut sem rutrum, sollicitudin dui sed, feugiat velit.</p>\n' +
            '<h6>Etiam eget imperdiet purus.</h6>\n' +
            '<p>Duis a mattis augue, nec scelerisque velit. Sed mollis enim quis quam sollicitudin, quis fringilla tellus pulvinar. Aenean in consectetur ex. Sed non rhoncus nisl, quis vestibulum leo. Nulla vel porttitor dolor.</p>\n' +
            '<ol>\n' +
            '<li>Orci varius natoque penatibus et magnis dis</li>\n' +
            '<li>Parturient montes, nascetur ridiculus mus. Suspendisse rutrum justo orci, sed vulputate est interdum a</li>\n' +
            '<li>Nullam convallis, enim id tristique interdum, ligula leo ultricies nisi, eget scelerisque est eros lacinia orci.\n' +
            '<ol>\n' +
            '<li>Sed ante elit, laoreet ut feugiat vel, varius eu elit.</li>\n' +
            '</ol>\n' +
            '</li>\n' +
            '<li>Class aptent taciti sociosqu ad litora torquent per conubia nostra</li>\n' +
            '</ol>\n' +
            '<p>Nunc eget magna sed dolor eleifend hendrerit. In quam dui, posuere eu tincidunt ullamcorper, tempor elementum ex. Vivamus lacus quam, bibendum ac felis vel, scelerisque rhoncus lacus. Integer posuere sollicitudin orci, quis dictum enim tempor et. Suspendisse potenti. Sed a ante ante.</p>');

        expect(post.data.author.data.email).toEqual('persons-name@example.com');
        expect(post.data.author.data.name).toEqual('Persons Name');
        expect(post.data.author.data.slug).toEqual('persons-name');
        expect(post.data.author.data.roles[0]).toEqual('Contributor');
    });

    test('Can process a basic Jekyll HTML post', function () {
        const fakeName = '_posts/2022-06-05-basic.html';
        const fixture = readSync('2022-06-05-basic.html');
        const post = processPost(fakeName, fixture);

        expect(post.data.title).toEqual('Basic HTML Post');

        // Here are testing that Markdown syntax is left alone
        expect(post.data.html).toEqual('<p>First Paragraph</p>\n' +
            '\n' +
            '* First\n' +
            '* Second');
        expect(post.data.author.data.name).toEqual('Mark Stosberg');
    });

    test('Can process a basic Jekyll post with no author', function () {
        const fakeName = '_posts/2021-08-24-no-author.md';
        const fixture = readSync('2021-08-24-no-author.md');
        const post = processPost(fakeName, fixture,
            {
                data: {
                    email: `person@name.com`,
                    name: 'Person Name',
                    slug: 'person',
                    roles: [
                        'Editor'
                    ]
                }
            }
        );

        expect(post.data.author.data.email).toEqual('person@name.com');
        expect(post.data.author.data.name).toEqual('Person Name');
        expect(post.data.author.data.slug).toEqual('person');
        expect(post.data.author.data.roles[0]).toEqual('Editor');
    });

    test('Can leave relative links when no URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');
    });

    test('Can fix relative links when a URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://www.my-site.com/`
            }
        );

        expect(post.data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://www.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://www.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="https://www.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        expect(post.url).toEqual('https://www.my-site.com/relative-links');
    });

    test('Can fix relative links when a URL with subdirectory is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://blog.my-site.com/news/`
            }
        );

        expect(post.data.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://blog.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://blog.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="https://blog.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        expect(post.url).toEqual('https://blog.my-site.com/news/relative-links');
    });

    test('Can use a non-standard post date format', function () {
        const fakeName = '_posts/2021-9-1-alt-date-format.md';
        const fixture = readSync('2021-9-1-alt-date-format.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.created_at.toISOString()).toEqual('2021-09-01T00:00:00.000Z');
        expect(post.data.published_at.toISOString()).toEqual('2021-09-01T00:00:00.000Z');
        expect(post.data.updated_at.toISOString()).toEqual('2021-09-01T00:00:00.000Z');
    });

    test('Can use a supplied email domain for authors', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            email: 'company.com'
        });

        expect(post.data.author.data.email).toEqual('persons-name@company.com');
    });

    test('Can add specified tags to each post', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello,  #World'
        });

        expect(post.data.tags).toBeArrayOfSize(3);

        expect(post.data.tags[0].url).toEqual('migrator-added-tag');
        expect(post.data.tags[0].data.slug).toEqual('hash-jekyll');
        expect(post.data.tags[0].data.name).toEqual('#jekyll');

        expect(post.data.tags[1].url).toEqual('migrator-added-tag-hello');
        expect(post.data.tags[1].data.slug).toEqual('hello');
        expect(post.data.tags[1].data.name).toEqual('Hello');

        expect(post.data.tags[2].url).toEqual('migrator-added-tag-hash-world');
        expect(post.data.tags[2].data.slug).toEqual('hash-world');
        expect(post.data.tags[2].data.name).toEqual('#World');
    });

    test('Can process draft posts', function () {
        const fakeName = '_drafts/relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('draft');
    });

    test('Can process published:false frontmatter', function () {
        const fakeName = '_posts/2022-06-05-published-false.md';
        const fixture = readSync('2022-06-05-published-false.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('draft');
    });

    test('Can process `basename` frontmatter into slug', function () {
        const fakeName = '_posts/2022-06-09-basename.md';
        const fixture = readSync('2022-06-09-basename.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.slug).toEqual('custom-basename');
    });

    test('Can process non-standard post types and add related tag', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('published');

        expect(post.data.tags).toBeArrayOfSize(2);

        expect(post.data.tags[0].url).toEqual('migrator-added-tag-hash-w31rd_type-here');
        expect(post.data.tags[0].data.slug).toEqual('hash-w31rd_type-here');
        expect(post.data.tags[0].data.name).toEqual('#w31rd_type-here');

        expect(post.data.tags[1].url).toEqual('migrator-added-tag');
        expect(post.data.tags[1].data.slug).toEqual('hash-jekyll');
        expect(post.data.tags[1].data.name).toEqual('#jekyll');
    });

    test('Can process non-standard post types and add related tag, with additonal tags', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello'
        });

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('published');

        expect(post.data.tags).toBeArrayOfSize(3);

        expect(post.data.tags[0].url).toEqual('migrator-added-tag-hash-w31rd_type-here');
        expect(post.data.tags[0].data.slug).toEqual('hash-w31rd_type-here');
        expect(post.data.tags[0].data.name).toEqual('#w31rd_type-here');

        expect(post.data.tags[1].url).toEqual('migrator-added-tag');
        expect(post.data.tags[1].data.slug).toEqual('hash-jekyll');
        expect(post.data.tags[1].data.name).toEqual('#jekyll');

        expect(post.data.tags[2].url).toEqual('migrator-added-tag-hello');
        expect(post.data.tags[2].data.slug).toEqual('hello');
        expect(post.data.tags[2].data.name).toEqual('Hello');
    });

    test('Can process posts without a date in the file name', function () {
        const fakeName = '_posts/my-first-post.md';
        const fixture = readSync('my-first-post.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'NoFileDate'
        });

        expect(post.data.type).toEqual('post');
        expect(post.data.status).toEqual('published');

        expect(post.data.created_at.toISOString()).toEqual('2021-11-26T00:00:00.000Z');
        expect(post.data.published_at.toISOString()).toEqual('2021-11-26T00:00:00.000Z');
        expect(post.data.updated_at.toISOString()).toEqual('2021-11-26T00:00:00.000Z');

        expect(post.data.tags[0].url).toEqual('migrator-added-tag');
        expect(post.data.tags[0].data.slug).toEqual('hash-jekyll');
        expect(post.data.tags[0].data.name).toEqual('#jekyll');

        expect(post.data.tags[1].url).toEqual('migrator-added-tag-nofiledate');
        expect(post.data.tags[1].data.slug).toEqual('nofiledate');
        expect(post.data.tags[1].data.name).toEqual('NoFileDate');
    });

    test('Can process posts with unquoted date in frontmatter, using .markdown extension', function () {
        const fakeName = '_posts/unquoted-date.markdown';
        const fixture = readSync('unquoted-date.markdown');
        const post = processPost(fakeName, fixture, false);

        expect(post.data.created_at.toISOString()).toEqual('2022-06-06T00:00:00.000Z');
        expect(post.data.published_at.toISOString()).toEqual('2022-06-06T00:00:00.000Z');
        expect(post.data.updated_at.toISOString()).toEqual('2022-06-06T00:00:00.000Z');
    });

    test('Can process posts with tags and categories in YAML list format', function () {
        const fakeName = '_posts/2022-06-06-tag-list.md';
        const fixture = readSync('2022-06-06-tag-list.md');
        const post = processPost(fakeName, fixture, false);

        expect(post.data.tags[0].data.name).toEqual('cat');
        expect(post.data.tags[0].data.slug).toEqual('category-cat');
        expect(post.data.tags[1].data.name).toEqual('photos');
        expect(post.data.tags[1].data.slug).toEqual('category-photos');
        expect(post.data.tags[2].data.slug).toEqual('some-word');
    });
    test('Can process posts that already include HTML', function () {
        const fakeName = '_posts/2022-03-10-has-html.md';
        const fixture = readSync('2022-03-10-has-html.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        expect(post.data.html).toEqual('<p>Lorem ipsum dolor sit amet.</p>\n' +
        '<video width="320" height="240" controls>\n' +
        '  <source src="movie.mp4" type="video/mp4">\n' +
        '  <source src="movie.ogg" type="video/ogg">\n' +
        '</video>\n' +
        '<p>Dolor sit amet.</p>');
    });

    test('Can process lists that have spaced between list items', function () {
        const fakeName = '_posts/2022-03-11-has-spaced-lists.md';
        const fixture = readSync('2022-03-11-has-spaced-lists.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        expect(post.data.html).toEqual('<p>Lorem ipsum.</p>\n' +
        '<ul>\n' +
        '<li>This</li>\n' +
        '<li>Is</li>\n' +
        '<li>My</li>\n' +
        '<li>List</li>\n' +
        '</ul>\n' +
        '<p>Dolor sit amet.</p>\n' +
        '<ul>\n' +
        '<li>This</li>\n' +
        '<li>Is</li>\n' +
        '<li>Another</li>\n' +
        '<li>List</li>\n' +
        '</ul>\n' +
        '<p>Lorem ipsum.</p>\n' +
        '<ul>\n' +
        '<li>This list</li>\n' +
        '<li>Has spaces</li>\n' +
        '<li>Between each</li>\n' +
        '<li>Line</li>\n' +
        '</ul>\n' +
        '<p>Dolor sit amet.</p>\n' +
        '<ul>\n' +
        '<li>Likewise</li>\n' +
        '<li>For this</li>\n' +
        '<li>Set of</li>\n' +
        '<li>List Items too</li>\n' +
        '</ul>\n' +
        '<p>Lorem ipsum.</p>');
    });

    test('Can process front matter tags & categories', function () {
        const fakeName = '_posts/2022-06-03-front-matter-tags-cats.md';
        const fixture = readSync('2022-06-03-front-matter-tags-cats.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'My Extra Tag'
        });

        expect(post.data.tags).toBeArrayOfSize(8);
        expect(post.data.tags).toEqual([
            {
                url: 'migrator-added-tag-category-news',
                data: {name: 'News', slug: 'category-news'}
            },
            {
                url: 'migrator-added-tag-category-posts',
                data: {name: 'Posts', slug: 'category-posts'}
            },
            {
                url: 'migrator-added-tag-category-articles',
                data: {name: 'Articles', slug: 'category-articles'}
            },
            {
                url: 'migrator-added-tag-lorem-ipsum',
                data: {name: 'Lorem Ipsum', slug: 'lorem-ipsum'}
            },
            {
                url: 'migrator-added-tag-dolor',
                data: {name: 'dolor', slug: 'dolor'}
            },
            {
                url: 'migrator-added-tag-simet-amet',
                data: {name: 'Simet-Amet', slug: 'simet-amet'}
            },
            {
                url: 'migrator-added-tag',
                data: {name: '#jekyll', slug: 'hash-jekyll'}
            },
            {
                url: 'migrator-added-tag-my-extra-tag',
                data: {name: 'My Extra Tag', slug: 'my-extra-tag'}
            }
        ]);
    });
});
