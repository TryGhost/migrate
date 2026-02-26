import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import processPost from '../lib/process-post.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = join(__dirname, './', 'fixtures', name);
    return readFileSync(fixtureFileName, {encoding: 'utf8'});
};

describe('Process', function () {
    it('Can process a basic Jekyll Markdown post', function () {
        const fakeName = '_posts/2021-08-23-basic-post.md';
        const fixture = readSync('2021-08-23-basic-post.md');

        const post = processPost(fakeName, fixture);

        assert.equal(post.data.title, 'This is a Basic Post');
        assert.equal(post.data.slug, 'basic-post');

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.created_at.toISOString(), '2021-08-23T00:00:00.000Z');
        assert.equal(post.data.published_at.toISOString(), '2021-08-23T00:00:00.000Z');
        assert.equal(post.data.updated_at.toISOString(), '2021-08-23T00:00:00.000Z');

        assert.equal(post.data.tags[0].url, 'migrator-added-tag');
        assert.equal(post.data.tags[0].data.name, '#jekyll');

        assert.equal(post.data.html, '<p>Lorem ipsum <em>dolor</em> sit amet, <strong>consectetur</strong> adipiscing elit. <em><strong>Aliquam</strong></em> risus turpis, dictum ut eros vel, mollis fermentum purus. Sed venenatis cursus vestibulum. Proin auctor consequat viverra.</p>\n' +
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

        assert.equal(post.data.author.data.email, 'persons-name@example.com');
        assert.equal(post.data.author.data.name, 'Persons Name');
        assert.equal(post.data.author.data.slug, 'persons-name');
        assert.equal(post.data.author.data.roles[0], 'Contributor');
    });

    it('Can process a basic Jekyll HTML post', function () {
        const fakeName = '_posts/2022-06-05-basic.html';
        const fixture = readSync('2022-06-05-basic.html');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.title, 'Basic HTML Post');

        // Here are testing that Markdown syntax is left alone
        assert.equal(post.data.html, '<p>First Paragraph</p>\n' +
            '\n' +
            '* First\n' +
            '* Second');
        assert.equal(post.data.author.data.name, 'Mark Stosberg');
    });

    it('Can process a basic Jekyll post with no author', function () {
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

        assert.equal(post.data.author.data.email, 'person@name.com');
        assert.equal(post.data.author.data.name, 'Person Name');
        assert.equal(post.data.author.data.slug, 'person');
        assert.equal(post.data.author.data.roles[0], 'Editor');
    });

    it('Can leave relative links when no URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');
    });

    it('Can fix relative links when a URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://www.my-site.com/`
            }
        );

        assert.equal(post.data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://www.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://www.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="https://www.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        assert.equal(post.url, 'https://www.my-site.com/relative-links');
    });

    it('Can fix relative links when a URL with subdirectory is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://blog.my-site.com/news/`
            }
        );

        assert.equal(post.data.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://blog.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://blog.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p><img src="https://blog.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        assert.equal(post.url, 'https://blog.my-site.com/news/relative-links');
    });

    it('Can use a non-standard post date format', function () {
        const fakeName = '_posts/2021-9-1-alt-date-format.md';
        const fixture = readSync('2021-9-1-alt-date-format.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.created_at.toISOString(), '2021-09-01T00:00:00.000Z');
        assert.equal(post.data.published_at.toISOString(), '2021-09-01T00:00:00.000Z');
        assert.equal(post.data.updated_at.toISOString(), '2021-09-01T00:00:00.000Z');
    });

    it('Can use a supplied email domain for authors', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            email: 'company.com'
        });

        assert.equal(post.data.author.data.email, 'persons-name@company.com');
    });

    it('Can add specified tags to each post', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello,  #World'
        });

        assert.equal(post.data.tags.length, 3);

        assert.equal(post.data.tags[0].url, 'migrator-added-tag');
        assert.equal(post.data.tags[0].data.slug, 'hash-jekyll');
        assert.equal(post.data.tags[0].data.name, '#jekyll');

        assert.equal(post.data.tags[1].url, 'migrator-added-tag-hello');
        assert.equal(post.data.tags[1].data.slug, 'hello');
        assert.equal(post.data.tags[1].data.name, 'Hello');

        assert.equal(post.data.tags[2].url, 'migrator-added-tag-hash-world');
        assert.equal(post.data.tags[2].data.slug, 'hash-world');
        assert.equal(post.data.tags[2].data.name, '#World');
    });

    it('Can process draft posts', function () {
        const fakeName = '_drafts/relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'draft');
    });

    it('Can process published:false frontmatter', function () {
        const fakeName = '_posts/2022-06-05-published-false.md';
        const fixture = readSync('2022-06-05-published-false.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'draft');
    });

    it('Can process `basename` frontmatter into slug', function () {
        const fakeName = '_posts/2022-06-09-basename.md';
        const fixture = readSync('2022-06-09-basename.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.slug, 'custom-basename');
    });

    it('Can process non-standard post types and add related tag', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.tags.length, 2);

        assert.equal(post.data.tags[0].url, 'migrator-added-tag-hash-w31rd_type-here');
        assert.equal(post.data.tags[0].data.slug, 'hash-w31rd_type-here');
        assert.equal(post.data.tags[0].data.name, '#w31rd_type-here');

        assert.equal(post.data.tags[1].url, 'migrator-added-tag');
        assert.equal(post.data.tags[1].data.slug, 'hash-jekyll');
        assert.equal(post.data.tags[1].data.name, '#jekyll');
    });

    it('Can process non-standard post types and add related tag, with additonal tags', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello'
        });

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.tags.length, 3);

        assert.equal(post.data.tags[0].url, 'migrator-added-tag-hash-w31rd_type-here');
        assert.equal(post.data.tags[0].data.slug, 'hash-w31rd_type-here');
        assert.equal(post.data.tags[0].data.name, '#w31rd_type-here');

        assert.equal(post.data.tags[1].url, 'migrator-added-tag');
        assert.equal(post.data.tags[1].data.slug, 'hash-jekyll');
        assert.equal(post.data.tags[1].data.name, '#jekyll');

        assert.equal(post.data.tags[2].url, 'migrator-added-tag-hello');
        assert.equal(post.data.tags[2].data.slug, 'hello');
        assert.equal(post.data.tags[2].data.name, 'Hello');
    });

    it('Can process posts without a date in the file name', function () {
        const fakeName = '_posts/my-first-post.md';
        const fixture = readSync('my-first-post.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'NoFileDate'
        });

        assert.equal(post.data.type, 'post');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.created_at.toISOString(), '2021-11-26T00:00:00.000Z');
        assert.equal(post.data.published_at.toISOString(), '2021-11-26T00:00:00.000Z');
        assert.equal(post.data.updated_at.toISOString(), '2021-11-26T00:00:00.000Z');

        assert.equal(post.data.tags[0].url, 'migrator-added-tag');
        assert.equal(post.data.tags[0].data.slug, 'hash-jekyll');
        assert.equal(post.data.tags[0].data.name, '#jekyll');

        assert.equal(post.data.tags[1].url, 'migrator-added-tag-nofiledate');
        assert.equal(post.data.tags[1].data.slug, 'nofiledate');
        assert.equal(post.data.tags[1].data.name, 'NoFileDate');
    });

    it('Can process posts with unquoted date in frontmatter, using .markdown extension', function () {
        const fakeName = '_posts/unquoted-date.markdown';
        const fixture = readSync('unquoted-date.markdown');
        const post = processPost(fakeName, fixture, false);

        assert.equal(post.data.created_at.toISOString(), '2022-06-06T00:00:00.000Z');
        assert.equal(post.data.published_at.toISOString(), '2022-06-06T00:00:00.000Z');
        assert.equal(post.data.updated_at.toISOString(), '2022-06-06T00:00:00.000Z');
    });

    it('Can process posts with tags and categories in YAML list format', function () {
        const fakeName = '_posts/2022-06-06-tag-list.md';
        const fixture = readSync('2022-06-06-tag-list.md');
        const post = processPost(fakeName, fixture, false);

        assert.equal(post.data.tags[0].data.name, 'cat');
        assert.equal(post.data.tags[0].data.slug, 'category-cat');
        assert.equal(post.data.tags[1].data.name, 'photos');
        assert.equal(post.data.tags[1].data.slug, 'category-photos');
        assert.equal(post.data.tags[2].data.slug, 'some-word');
    });

    it('Can process posts that already include HTML', function () {
        const fakeName = '_posts/2022-03-10-has-html.md';
        const fixture = readSync('2022-03-10-has-html.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        assert.equal(post.data.html, '<p>Lorem ipsum dolor sit amet.</p>\n' +
        '<video width="320" height="240" controls>\n' +
        '  <source src="movie.mp4" type="video/mp4">\n' +
        '  <source src="movie.ogg" type="video/ogg">\n' +
        '</video>\n' +
        '<p>Dolor sit amet.</p>');
    });

    it('Can process lists that have spaced between list items', function () {
        const fakeName = '_posts/2022-03-11-has-spaced-lists.md';
        const fixture = readSync('2022-03-11-has-spaced-lists.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        assert.equal(post.data.html, '<p>Lorem ipsum.</p>\n' +
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

    it('Can process front matter tags & categories', function () {
        const fakeName = '_posts/2022-06-03-front-matter-tags-cats.md';
        const fixture = readSync('2022-06-03-front-matter-tags-cats.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'My Extra Tag'
        });

        assert.equal(post.data.tags.length, 8);
        assert.deepEqual(post.data.tags, [
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
