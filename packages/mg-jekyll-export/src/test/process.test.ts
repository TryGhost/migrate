import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import {RecordDataError} from '@tryghost/mg-context';
import {parseDate, parseFrontMatter, postUrl, processHtml, processPost} from '../index.js';

// Tests run from build/, so fixtures are read from the source tree.
const readSync = (name: string) => readFileSync(new URL(`../../src/test/fixtures/${name}`, import.meta.url), 'utf8');

const iso = (date: Date | null) => date?.toISOString() ?? null;

describe('Process', function () {
    it('Can process a basic Jekyll Markdown post', function () {
        const fakeName = '_posts/2021-08-23-basic-post.md';
        const fixture = readSync('2021-08-23-basic-post.md');

        const post = processPost(fakeName, fixture);

        assert.equal(post.title, 'This is a Basic Post');
        assert.equal(post.slug, 'basic-post');
        assert.equal(post.sourceSlug, 'basic-post');
        assert.equal(post.status, 'published');
        assert.equal(iso(post.date), '2021-08-23T00:00:00.000Z');
        assert.deepEqual(post.tags, [{name: '#jekyll', slug: 'hash-jekyll'}]);

        assert.equal(
            post.html,
            '<p>Lorem ipsum <em>dolor</em> sit amet, <strong>consectetur</strong> adipiscing elit. <em><strong>Aliquam</strong></em> risus turpis, dictum ut eros vel, mollis fermentum purus. Sed venenatis cursus vestibulum. Proin auctor consequat viverra.</p>\n' +
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
                '<p>Nunc eget magna sed dolor eleifend hendrerit. In quam dui, posuere eu tincidunt ullamcorper, tempor elementum ex. Vivamus lacus quam, bibendum ac felis vel, scelerisque rhoncus lacus. Integer posuere sollicitudin orci, quis dictum enim tempor et. Suspendisse potenti. Sed a ante ante.</p>'
        );

        assert.deepEqual(post.authors, ['Persons Name']);
    });

    it('Can process a basic Jekyll HTML post', function () {
        const fakeName = '_posts/2022-06-05-basic.html';
        const fixture = readSync('2022-06-05-basic.html');
        const post = processPost(fakeName, fixture);

        assert.equal(post.title, 'Basic HTML Post');

        // Here are testing that Markdown syntax is left alone
        assert.equal(post.html, '<p>First Paragraph</p>\n' + '\n' + '* First\n' + '* Second');
        assert.deepEqual(post.authors, ['Mark Stosberg']);
    });

    it('Can process a post without front matter', function () {
        const post = processPost('_posts/2022-06-05-no-front-matter.md', 'Plain body');

        assert.equal(post.title, '(Untitled)');
        assert.equal(post.html, '<p>Plain body</p>');
        assert.deepEqual(post.authors, []);
    });

    it('Can process legacy front matter delimiters', function () {
        const contents = '= yaml =\ntitle: Legacy delimiters\n...\nPlain body';
        const post = processPost('_posts/2022-06-05-legacy-delimiters.md', contents);

        assert.equal(post.title, 'Legacy delimiters');
        assert.equal(post.html, '<p>Plain body</p>');
    });

    it('Can process a basic Jekyll post with no author', function () {
        const fakeName = '_posts/2021-08-24-no-author.md';
        const fixture = readSync('2021-08-24-no-author.md');
        const post = processPost(fakeName, fixture);

        // map() gives a post without authors the Example User.
        assert.deepEqual(post.authors, []);
    });

    it('Can leave relative links when no URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(
            post.html,
            '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
                '<p><img src="/images/photo.jpg" alt="A nice photo"></p>\n' +
                '<p><img src="/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
                '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
                '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
                '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>'
        );
    });

    it('Can fix relative links when a URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, {
            url: `https://www.my-site.com/`
        });

        assert.equal(
            post.html,
            '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://www.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
                '<p><img src="https://www.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
                '<p><img src="https://www.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
                '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
                '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
                '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>'
        );

        assert.equal(postUrl({url: 'https://www.my-site.com/'}, post), 'https://www.my-site.com/relative-links');
    });

    it('Can fix relative links when a URL with subdirectory is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, {
            url: `https://blog.my-site.com/news/`
        });

        assert.equal(
            post.html,
            '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://blog.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
                '<p><img src="https://blog.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
                '<p><img src="https://blog.my-site.com/news/images/photo.jpg" alt="Relative-to-root image"></p>\n' +
                '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
                '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
                '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>'
        );

        assert.equal(
            postUrl({url: 'https://blog.my-site.com/news/'}, post),
            'https://blog.my-site.com/news/relative-links'
        );
    });

    it('Can use a non-standard post date format', function () {
        const fakeName = '_posts/2021-9-1-alt-date-format.md';
        const fixture = readSync('2021-9-1-alt-date-format.md');
        const post = processPost(fakeName, fixture);

        assert.equal(iso(post.date), '2021-09-01T00:00:00.000Z');
        assert.equal(post.slug, 'alt-date-format');
    });

    it('Can add specified tags to each post', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'Hello,  #World, '
        });

        // Public tags come before internal ones.
        assert.deepEqual(post.tags, [
            {name: 'Hello', slug: 'hello'},
            {name: '#jekyll', slug: 'hash-jekyll'},
            {name: '#World', slug: 'hash-world'}
        ]);
    });

    it('Can process draft posts', function () {
        const fakeName = '_drafts/relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.status, 'draft');
        assert.equal(post.slug, 'relative-links');
        // map() dates a draft without a date when the export was read.
        assert.equal(post.date, null);
    });

    it('Can process published:false frontmatter', function () {
        const fakeName = '_posts/2022-06-05-published-false.md';
        const fixture = readSync('2022-06-05-published-false.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.status, 'draft');
        assert.equal(iso(post.date), '2022-06-05T00:00:00.000Z');
    });

    it('Can process `basename` frontmatter into slug', function () {
        const fakeName = '_posts/2022-06-09-basename.md';
        const fixture = readSync('2022-06-09-basename.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.slug, 'custom-basename');
        assert.equal(post.sourceSlug, 'custom-basename');
        assert.equal(iso(post.date), '2022-06-09T00:00:00.000Z');
    });

    it('Can process non-standard post types and add related tag', function () {
        const fakeName = '_posts/w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        assert.equal(post.status, 'published');
        assert.equal(post.slug, 'relative-links');
        assert.deepEqual(post.tags, [
            {name: '#w31rd_type-here', slug: 'hash-w31rd_type-here'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Can process non-standard post types and add related tag, with additonal tags', function () {
        const fakeName = '_drafts/w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'Hello'
        });

        assert.equal(post.status, 'draft');
        assert.deepEqual(post.tags, [
            {name: 'Hello', slug: 'hello'},
            {name: '#w31rd_type-here', slug: 'hash-w31rd_type-here'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Can process posts without a date in the file name', function () {
        const fakeName = '_posts/my-first-post.md';
        const fixture = readSync('my-first-post.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'NoFileDate'
        });

        assert.equal(post.status, 'published');
        assert.equal(post.slug, 'my-first-post');
        assert.equal(iso(post.date), '2021-11-26T00:00:00.000Z');
        assert.deepEqual(post.tags, [
            {name: 'NoFileDate', slug: 'nofiledate'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Can process posts with unquoted date in frontmatter, using .markdown extension', function () {
        const fakeName = '_posts/unquoted-date.markdown';
        const fixture = readSync('unquoted-date.markdown');
        const post = processPost(fakeName, fixture);

        assert.equal(iso(post.date), '2022-06-06T00:00:00.000Z');
        assert.equal(post.slug, 'unquoted-date');
    });

    it('Can process posts with tags and categories in YAML list format', function () {
        const fakeName = '_posts/2022-06-06-tag-list.md';
        const fixture = readSync('2022-06-06-tag-list.md');
        const post = processPost(fakeName, fixture);

        assert.deepEqual(post.tags, [
            {name: 'cat', slug: 'category-cat'},
            {name: 'photos', slug: 'category-photos'},
            {name: 'some-word', slug: 'some-word'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Can process posts that already include HTML', function () {
        const fakeName = '_posts/2022-03-10-has-html.md';
        const fixture = readSync('2022-03-10-has-html.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'Has HTML'
        });

        assert.equal(
            post.html,
            '<p>Lorem ipsum dolor sit amet.</p>\n' +
                '<video width="320" height="240" controls>\n' +
                '  <source src="movie.mp4" type="video/mp4">\n' +
                '  <source src="movie.ogg" type="video/ogg">\n' +
                '</video>\n' +
                '<p>Dolor sit amet.</p>'
        );
    });

    it('Can process lists that have spaced between list items', function () {
        const fakeName = '_posts/2022-03-11-has-spaced-lists.md';
        const fixture = readSync('2022-03-11-has-spaced-lists.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'Has HTML'
        });

        assert.equal(
            post.html,
            '<p>Lorem ipsum.</p>\n' +
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
                '<p>Lorem ipsum.</p>'
        );
    });

    it('Can process front matter tags & categories', function () {
        const fakeName = '_posts/2022-06-03-front-matter-tags-cats.md';
        const fixture = readSync('2022-06-03-front-matter-tags-cats.md');
        const post = processPost(fakeName, fixture, {
            addTags: 'My Extra Tag'
        });

        assert.deepEqual(post.tags, [
            {name: 'News', slug: 'category-news'},
            {name: 'Posts', slug: 'category-posts'},
            {name: 'Articles', slug: 'category-articles'},
            {name: 'Lorem Ipsum', slug: 'lorem-ipsum'},
            {name: 'dolor', slug: 'dolor'},
            {name: 'Simet-Amet', slug: 'simet-amet'},
            {name: 'My Extra Tag', slug: 'my-extra-tag'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Uses the front matter date over the file name, and drops the file name date from the slug', function () {
        const post = processPost(
            '_posts/2023-01-15-dated-both.md',
            '---\ntitle: Dated twice\ndate: 2023-01-14 23:30:00 -0100\n---\nBody'
        );

        assert.equal(iso(post.date), '2023-01-15T00:30:00.000Z');
        assert.equal(post.slug, 'dated-both');
        assert.equal(post.sourceSlug, 'dated-both');
    });

    it('Falls back to the file name date when the front matter date is invalid', function () {
        for (const date of ['sometime', '2021-02-30', '"2021-13-01"', '20210101', '[2021-01-01]']) {
            const post = processPost('_posts/2023-03-01-bad-date.md', `---\ndate: ${date}\n---\nBody`);
            assert.equal(iso(post.date), '2023-03-01T00:00:00.000Z', date);
        }
        assert.equal(processPost('_posts/2023-02-30-impossible.md', 'Body').date, null);
        assert.equal(processPost('_posts/undated.md', 'Body').date, null);
    });

    it('Reads dated drafts like posts', function () {
        const post = processPost('_drafts/2023-01-01-dated-draft.md', 'Body');

        assert.equal(post.status, 'draft');
        assert.equal(post.slug, 'dated-draft');
        assert.equal(iso(post.date), '2023-01-01T00:00:00.000Z');
    });

    it('Parses Jekyll front matter dates, reading zoneless values as UTC', function () {
        const cases: [unknown, string | null][] = [
            ['2022-06-06', '2022-06-06T00:00:00.000Z'],
            ['2021-9-1', '2021-09-01T00:00:00.000Z'],
            ['2023-02-01 08:00', '2023-02-01T08:00:00.000Z'],
            ['2023-02-01 08:00:00', '2023-02-01T08:00:00.000Z'],
            ['2023-02-01T08:00:00Z', '2023-02-01T08:00:00.000Z'],
            ['2023-01-15 10:30:00 +0100', '2023-01-15T09:30:00.000Z'],
            ['2023-01-15 10:30:00 +01:00', '2023-01-15T09:30:00.000Z'],
            ['2023-01-15 10:30:00 +01', '2023-01-15T09:30:00.000Z'],
            ['2023-01-15T10:30:00.25-07:00', '2023-01-15T17:30:00.250Z'],
            [' 2023-01-15 10:30:00 UTC ', '2023-01-15T10:30:00.000Z'],
            ['2023-01-15 10:30:00 GMT', '2023-01-15T10:30:00.000Z'],
            ['2023-01-15 25:00', null],
            ['2023-01-15 10:30:00 EST', null],
            ['15/01/2023', null],
            ['', null],
            [new Date('2023-01-15T00:00:00Z'), null],
            [20230115, null],
            [null, null]
        ];
        for (const [value, expected] of cases) {
            assert.equal(iso(parseDate(value)), expected, String(value));
        }
    });

    it('Reads dates in front matter as text rather than YAML timestamps', function () {
        const {attributes} = parseFrontMatter('---\ndate: 2023-02-01 08:00:00\npublished: no\ncount: 3\n---\nBody');

        assert.deepEqual(attributes, {date: '2023-02-01 08:00:00', published: false, count: 3});
    });

    it('Ignores front matter that is not a mapping, and rejects invalid YAML', function () {
        assert.deepEqual(parseFrontMatter('---\n- a\n- b\n---\nBody'), {attributes: {}, body: 'Body'});
        assert.deepEqual(parseFrontMatter('---\nplain\n---\nBody'), {attributes: {}, body: 'Body'});
        assert.deepEqual(parseFrontMatter('---\n\n---\nBody'), {attributes: {}, body: 'Body'});
        assert.deepEqual(parseFrontMatter('---\n---\nBody'), {attributes: {}, body: 'Body'});
        assert.deepEqual(parseFrontMatter('\uFEFF---\ntitle: BOM\n---'), {attributes: {title: 'BOM'}, body: ''});
        assert.throws(
            () => processPost('_posts/2021-01-01-bad.md', '---\ntitle: [unclosed\n---\nBody'),
            (error: Error) => error instanceof RecordDataError && error.message.startsWith('Invalid front matter: ')
        );
    });

    it('Reads numbers, lists and space-separated values from the front matter', function () {
        const post = processPost(
            '_posts/2021-01-01-values.md',
            '---\ntitle: 2021\nauthor: [Jane Doe, 42, "", {name: Ignored}]\ncategory: [Big News, Other]\n' +
                'categories: "  Posts   Articles "\ntag: Lorem Ipsum\ntags: [Foo, foo, 7]\n---\nBody'
        );

        assert.equal(post.title, '2021');
        assert.deepEqual(post.authors, ['Jane Doe', '42']);
        assert.deepEqual(post.tags, [
            {name: 'Big News', slug: 'category-big-news'},
            {name: 'Other', slug: 'category-other'},
            {name: 'Posts', slug: 'category-posts'},
            {name: 'Articles', slug: 'category-articles'},
            {name: 'Lorem Ipsum', slug: 'lorem-ipsum'},
            {name: 'Foo', slug: 'foo'},
            {name: '7', slug: '7'},
            {name: '#jekyll', slug: 'hash-jekyll'}
        ]);
    });

    it('Slugifies the slug, falling back to the title', function () {
        assert.equal(processPost('_posts/2021-01-01-My Post.md', 'Body').slug, 'my-post');
        assert.equal(processPost('_posts/2021-01-01-My Post.md', 'Body').sourceSlug, 'My Post');
        assert.equal(
            processPost('_posts/2021-01-01-x.md', '---\nbasename: /nested/path/\n---\nBody').sourceSlug,
            'nested/path'
        );
        assert.equal(processPost('_posts/2021-01-01-%%%.md', '---\ntitle: The Title\n---\nBody').slug, 'the-title');
        assert.equal(processPost('_posts/2021-01-01-%%%.md', 'Body').slug, 'post');
    });

    it('Rejects a path that is not a post file', function () {
        assert.throws(() => processPost('_posts/notes.txt', 'Body'), /Not a Jekyll post file: _posts\/notes.txt/);
    });

    it('Keeps HTML that already looks like an attribute, and links without targets', function () {
        const html = processHtml(
            '<p><code>a=""</code> <a>none</a> <img alt="x"> <a href="#top">top</a></p>',
            'https://example.com'
        );

        assert.equal(html, '<p><code>a=""</code> <a>none</a> <img alt="x"> <a href="#top">top</a></p>');
    });

    it('Builds dated live URLs', function () {
        const post = {sourceSlug: 'my-post', date: new Date('2021-08-23T10:00:00Z')};

        assert.equal(postUrl({url: 'https://example.com/'}, post), 'https://example.com/my-post');
        assert.equal(
            postUrl({url: 'https://example.com', datedPermalinks: 'none'}, post),
            'https://example.com/my-post'
        );
        assert.equal(
            postUrl({url: 'https://example.com', datedPermalinks: '/yyyy/mm/dd/'}, post),
            'https://example.com/2021/08/23/my-post'
        );
        assert.equal(
            postUrl({url: 'https://example.com/blog', datedPermalinks: '/yyyy/mm/'}, post),
            'https://example.com/blog/2021/08/my-post'
        );
        assert.equal(
            postUrl({url: 'https://example.com', datedPermalinks: '/yyyy/mm/dd/'}, {...post, date: null}),
            'https://example.com/my-post'
        );
        assert.throws(() => postUrl({url: 'example.com'}, post), /--url/);
        assert.throws(() => postUrl({}, post), /--url/);
    });
});
