// Switch these lines once there are useful utils
const testUtils = require('./utils');

// Thing we are testing
const processPost = require('../lib/process-post');

describe('Process', function () {
    it('Can process a basic Jekyll Markdown post', function () {
        const fakeName = '_posts/2021-08-23-basic-post.md';
        const fixture = testUtils.fixtures.readSync('2021-08-23-basic-post.md');
        const post = processPost(fakeName, fixture);

        post.data.title.should.eql('This is a Basic Post');
        post.data.slug.should.eql('basic-post');

        post.data.type.should.eql('post');
        post.data.status.should.eql('published');

        post.data.created_at.toISOString().should.eql('2021-08-23T00:00:00.000Z');
        post.data.published_at.toISOString().should.eql('2021-08-23T00:00:00.000Z');
        post.data.updated_at.toISOString().should.eql('2021-08-23T00:00:00.000Z');

        post.data.tags[0].url.should.eql('migrator-added-tag');
        post.data.tags[0].data.name.should.eql('#jekyll');

        post.data.html.should.eql('<p>Lorem ipsum <em>dolor</em> sit amet, <strong>consectetur</strong> adipiscing elit. <em><strong>Aliquam</strong></em> risus turpis, dictum ut eros vel, mollis fermentum purus. Sed venenatis cursus vestibulum. Proin auctor consequat viverra.</p>\n' +
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

        post.data.author.data.email.should.eql('persons-name@dummyemail.com');
        post.data.author.data.name.should.eql('Persons Name');
        post.data.author.data.slug.should.eql('persons-name');
        post.data.author.data.roles[0].should.eql('Contributor');
    });

    it('Can process a basic Jekyll HTML post', function () {
        const fakeName = '_posts/2022-06-05-basic.html';
        const fixture = testUtils.fixtures.readSync('2022-06-05-basic.html');
        const post = processPost(fakeName, fixture);

        post.data.title.should.eql('Basic HTML Post');

        // Here are testing that Markdown syntax is left alone
        post.data.html.should.eql('<p>First Paragraph</p>\n' +
            '\n' +
            '* First\n' +
            '* Second');
        post.data.author.data.name.should.eql('Mark Stosberg');
    });

    it('Can process a basic Jekyll post with no author', function () {
        const fakeName = '_posts/2021-08-24-no-author.md';
        const fixture = testUtils.fixtures.readSync('2021-08-24-no-author.md');
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

        post.data.author.data.email.should.eql('person@name.com');
        post.data.author.data.name.should.eql('Person Name');
        post.data.author.data.slug.should.eql('person');
        post.data.author.data.roles[0].should.eql('Editor');
    });

    it('Can leave relative links when no URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        post.data.html.should.eql('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');
    });

    it('Can fix relative links when a URL is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://www.my-site.com/`
            }
        );

        post.data.html.should.eql('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://www.my-site.com/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://www.my-site.com/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        post.url.should.eql('https://www.my-site.com/relative-links');
    });

    it('Can fix relative links when a URL with subdirectory is defined', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false,
            {
                url: `https://blog.my-site.com/news/`
            }
        );

        post.data.html.should.eql('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. <a href="https://blog.my-site.com/news/another-page">Pellentesque rutrum</a> ante in <a href="https://example.com">sapien ultrices</a>, sit amet auctor tellus iaculis.</p>\n' +
            '<p><img src="https://blog.my-site.com/news/images/photo.jpg" alt="A nice photo"></p>\n' +
            '<p>Duis efficitur nisl pharetra enim lobortis consequat. Curabitur vestibulum diam vel elit ultricies semper.</p>\n' +
            '<p><img src="http://example.com/images/photo.jpg" alt="Another nice photo"></p>\n' +
            '<p>Sed nec sagittis risus, vitae tempor mi. Suspendisse potenti.</p>');

        post.url.should.eql('https://blog.my-site.com/news/relative-links');
    });

    it('Can use a non-standard post date format', function () {
        const fakeName = '_posts/2021-9-1-alt-date-format.md';
        const fixture = testUtils.fixtures.readSync('2021-9-1-alt-date-format.md');
        const post = processPost(fakeName, fixture);

        post.data.created_at.toISOString().should.eql('2021-09-01T00:00:00.000Z');
        post.data.published_at.toISOString().should.eql('2021-09-01T00:00:00.000Z');
        post.data.updated_at.toISOString().should.eql('2021-09-01T00:00:00.000Z');
    });

    it('Can use a supplied email domain for auhtors', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            email: 'company.com'
        });

        post.data.author.data.email.should.eql('persons-name@company.com');
    });

    it('Can add specified tags to each post', function () {
        const fakeName = '_posts/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello,  #World'
        });

        post.data.tags.should.be.an.Array().with.lengthOf(3);

        post.data.tags[0].url.should.eql('migrator-added-tag');
        post.data.tags[0].data.slug.should.eql('hash-jekyll');
        post.data.tags[0].data.name.should.eql('#jekyll');

        post.data.tags[1].url.should.eql('migrator-added-tag-hello');
        post.data.tags[1].data.slug.should.eql('hello');
        post.data.tags[1].data.name.should.eql('Hello');

        post.data.tags[2].url.should.eql('migrator-added-tag-hash-world');
        post.data.tags[2].data.slug.should.eql('hash-world');
        post.data.tags[2].data.name.should.eql('#World');
    });

    it('Can process draft posts', function () {
        const fakeName = '_drafts/relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        post.data.type.should.eql('post');
        post.data.status.should.eql('draft');
    });

    it('Can process published:false frontmatter', function () {
        const fakeName = '_posts/2022-06-05-published-false.md';
        const fixture = testUtils.fixtures.readSync('2022-06-05-published-false.md');
        const post = processPost(fakeName, fixture);

        post.data.type.should.eql('post');
        post.data.status.should.eql('draft');
    });

    it('Can process non-standard post types and add related tag', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture);

        post.data.type.should.eql('post');
        post.data.status.should.eql('published');

        post.data.tags.should.be.an.Array().with.lengthOf(2);

        post.data.tags[0].url.should.eql('migrator-added-tag-hash-w31rd_type-here');
        post.data.tags[0].data.slug.should.eql('hash-w31rd_type-here');
        post.data.tags[0].data.name.should.eql('#w31rd_type-here');

        post.data.tags[1].url.should.eql('migrator-added-tag');
        post.data.tags[1].data.slug.should.eql('hash-jekyll');
        post.data.tags[1].data.name.should.eql('#jekyll');
    });

    it('Can process non-standard post types and add related tag, with additonal tags', function () {
        const fakeName = 'w31rd_type-here/2021-08-25-relative-links.md';
        const fixture = testUtils.fixtures.readSync('2021-08-25-relative-links.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Hello'
        });

        post.data.type.should.eql('post');
        post.data.status.should.eql('published');

        post.data.tags.should.be.an.Array().with.lengthOf(3);

        post.data.tags[0].url.should.eql('migrator-added-tag-hash-w31rd_type-here');
        post.data.tags[0].data.slug.should.eql('hash-w31rd_type-here');
        post.data.tags[0].data.name.should.eql('#w31rd_type-here');

        post.data.tags[1].url.should.eql('migrator-added-tag');
        post.data.tags[1].data.slug.should.eql('hash-jekyll');
        post.data.tags[1].data.name.should.eql('#jekyll');

        post.data.tags[2].url.should.eql('migrator-added-tag-hello');
        post.data.tags[2].data.slug.should.eql('hello');
        post.data.tags[2].data.name.should.eql('Hello');
    });

    it('Can process posts without a date in the file name', function () {
        const fakeName = '_posts/my-first-post.md';
        const fixture = testUtils.fixtures.readSync('my-first-post.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'NoFileDate'
        });

        post.data.type.should.eql('post');
        post.data.status.should.eql('published');

        post.data.created_at.toISOString().should.eql('2021-11-26T00:00:00.000Z');
        post.data.published_at.toISOString().should.eql('2021-11-26T00:00:00.000Z');
        post.data.updated_at.toISOString().should.eql('2021-11-26T00:00:00.000Z');

        post.data.tags[0].url.should.eql('migrator-added-tag');
        post.data.tags[0].data.slug.should.eql('hash-jekyll');
        post.data.tags[0].data.name.should.eql('#jekyll');

        post.data.tags[1].url.should.eql('migrator-added-tag-nofiledate');
        post.data.tags[1].data.slug.should.eql('nofiledate');
        post.data.tags[1].data.name.should.eql('NoFileDate');
    });

    it('Can process posts with unquoted date in frontmatter, using .markdown extension', function () {
        const fakeName = '_posts/unquoted-date.markdown';
        const fixture = testUtils.fixtures.readSync('unquoted-date.markdown');
        const post = processPost(fakeName, fixture, false);

        post.data.created_at.toISOString().should.eql('2022-06-06T00:00:00.000Z');
        post.data.published_at.toISOString().should.eql('2022-06-06T00:00:00.000Z');
        post.data.updated_at.toISOString().should.eql('2022-06-06T00:00:00.000Z');
    });

    it('Can process posts with tags and categories in YAML list format', function () {
        const fakeName = '_posts/2022-06-06-tag-list.md';
        const fixture = testUtils.fixtures.readSync('2022-06-06-tag-list.md');
        const post = processPost(fakeName, fixture, false);

        post.data.tags[0].data.name.should.eql('cat');
        post.data.tags[0].data.slug.should.eql('category-cat');
        post.data.tags[1].data.name.should.eql('photos');
        post.data.tags[1].data.slug.should.eql('category-photos');
        post.data.tags[2].data.slug.should.eql('some-word');
    });
    it('Can process posts that already include HTML', function () {
        const fakeName = '_posts/2022-03-10-has-html.md';
        const fixture = testUtils.fixtures.readSync('2022-03-10-has-html.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        post.data.html.should.eql('<p>Lorem ipsum dolor sit amet.</p>\n' +
        '<video width="320" height="240" controls>\n' +
        '  <source src="movie.mp4" type="video/mp4">\n' +
        '  <source src="movie.ogg" type="video/ogg">\n' +
        '</video>\n' +
        '<p>Dolor sit amet.</p>');
    });

    it('Can process lists that have spaced between list items', function () {
        const fakeName = '_posts/2022-03-11-has-spaced-lists.md';
        const fixture = testUtils.fixtures.readSync('2022-03-11-has-spaced-lists.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'Has HTML'
        });

        post.data.html.should.eql('<p>Lorem ipsum.</p>\n' +
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
        const fixture = testUtils.fixtures.readSync('2022-06-03-front-matter-tags-cats.md');
        const post = processPost(fakeName, fixture, false, {
            addTags: 'My Extra Tag'
        });

        post.data.tags.should.be.an.Array().with.lengthOf(8);
        post.data.tags.should.eql([
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
