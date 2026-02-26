import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {createRequire} from 'node:module';
import toGhostJSON from '../lib/to-ghost-json/index.js';

const require = createRequire(import.meta.url);
const singlePostOnlyFixture = require('./fixtures/single-post-only.json');
const singlePostWithEmptyTagFixture = require('./fixtures/single-post-with-empty-tag.json');
const singlePostAuthorFixture = require('./fixtures/single-post-author.json');
const singlePostAuthorBadEmailFixture = require('./fixtures/single-post-author-bad-email.json');
const multiPostOnlyFixture = require('./fixtures/multi-post-only.json');
const singlePostWithBadTagOrderFixture = require('./fixtures/single-post-with-bad-tag-order.json');
const singlePostOnlyLongMetaFixture = require('./fixtures/single-post-only-long-meta.json');
const singlePostOnlyMetaFixture = require('./fixtures/single-post-only-meta.json');

const assertGhostPost = (post) => {
    assert.equal(typeof post, 'object');
    assert.ok(post !== null);
    assert.ok(!('url' in post));
    assert.ok(!('data' in post));
    assert.ok('slug' in post);
    assert.ok('title' in post);
    assert.ok('status' in post);
};

const assertGhostUser = (user) => {
    assert.equal(typeof user, 'object');
    assert.ok(user !== null);
    assert.ok(!('url' in user));
    assert.ok(!('data' in user));
    assert.ok('slug' in user);
    assert.ok('name' in user);
    assert.ok('email' in user);
    assert.ok('roles' in user);
};

const assertGhostTag = (tag) => {
    assert.equal(typeof tag, 'object');
    assert.ok(tag !== null);
    assert.ok(!('url' in tag));
    assert.ok(!('data' in tag));
    assert.ok('slug' in tag);
    assert.ok('name' in tag);
};

const assertGhostJSON = (value) => {
    assert.equal(typeof value, 'object');
    assert.ok(value !== null);
    assert.ok('meta' in value);
    assert.ok('data' in value);

    assert.equal(typeof value.meta, 'object');
    assert.ok(value.meta !== null);
    assert.ok('exported_on' in value.meta);
    assert.ok('version' in value.meta);

    for (const key of ['posts', 'posts_authors', 'posts_meta', 'posts_tags', 'tags', 'users']) {
        assert.ok(key in value.data, `Expected data to contain key "${key}"`);
    }

    // posts
    assert.ok(Array.isArray(value.data.posts));
    value.data.posts.forEach(post => assertGhostPost(post));

    // users
    assert.ok(Array.isArray(value.data.users));
    value.data.users.forEach(user => assertGhostUser(user));

    // tags
    if (value.data.tags) {
        assert.ok(Array.isArray(value.data.tags));
        value.data.tags.forEach(tag => assertGhostTag(tag));
    }

    // Relations...

    // Posts must have a valid relation in the posts_meta object
    assert.ok(Array.isArray(value.data.posts_meta));
    assert.ok(value.data.posts_meta.length >= 1);
    value.data.posts_meta.forEach((postMeta) => {
        assert.equal(typeof postMeta, 'object');
        assert.ok(postMeta !== null);
        assert.ok('post_id' in postMeta);
    });

    // Ghost posts must have at least one author, but we still convert to Ghost's expected multiauthor format
    assert.ok(Array.isArray(value.data.posts_authors));
    assert.ok(value.data.posts_authors.length >= 1);
    value.data.posts_authors.forEach((postAuthor) => {
        assert.equal(typeof postAuthor, 'object');
        assert.ok(postAuthor !== null);
        assert.ok('post_id' in postAuthor);
        assert.ok('author_id' in postAuthor);
    });

    // there can be multiple tags, but also no tags
    assert.ok(Array.isArray(value.data.posts_tags));
    if (value.data.posts_tags.length > 0) {
        value.data.posts_tags.forEach((postTag) => {
            assert.equal(typeof postTag, 'object');
            assert.ok(postTag !== null);
            assert.ok('post_id' in postTag);
            assert.ok('tag_id' in postTag);
        });
    }
};

describe('toGhostJSON', function () {
    it('Calculates relations when it only has a post', async function () {
        const output = await toGhostJSON(singlePostOnlyFixture);

        assertGhostJSON(output);
        assert.equal(output.data.posts.length, 1);
        assert.equal(output.data.tags.length, 2);

        assert.equal(output.data.users.length, 1);
        assert.equal(output.data.users[0].roles[0], 'Administrator');

        assert.equal(output.data.posts_authors.length, 1);
        assert.deepEqual(output.data.posts_authors[0].post_id, output.data.posts[0].id);
        assert.deepEqual(output.data.posts_authors[0].author_id, output.data.users[0].id);

        assert.equal(output.data.posts_tags.length, 2);
        assert.deepEqual(output.data.posts_tags[0].post_id, output.data.posts[0].id);
        assert.deepEqual(output.data.posts_tags[0].tag_id, output.data.tags[0].id);
        assert.deepEqual(output.data.posts_tags[1].post_id, output.data.posts[0].id);
        assert.deepEqual(output.data.posts_tags[1].tag_id, output.data.tags[1].id);
    });

    // @TODO: make it so that this test doesn't need a post slug or an author
    // Hydrator should be able to cope with absolutely minimal data
    it('Correctly decodes titles', async function () {
        const input = {
            posts: [{
                url: 'https://mysite.com',
                data: {
                    slug: 'cool-shit',
                    title: 'This shit&#8217;s cool',
                    author: {
                        url: 'https://mysite.com/me',
                        data: {
                            name: 'me',
                            roles: [
                                'Author'
                            ]
                        }
                    }
                }
            }]
        };
        const output = await toGhostJSON(input);

        assertGhostJSON(output);
        assert.equal(output.data.posts.length, 1);
        assert.equal(output.data.posts[0].title, 'This shit\u2019s cool');
    });

    it('Calculates relations with both post and users', async function () {
        const output = await toGhostJSON(singlePostAuthorFixture);

        assertGhostJSON(output);
    });

    it('Posts in output have no author field (only users + posts_authors)', async function () {
        const output = await toGhostJSON(singlePostOnlyFixture);

        assert.equal(output.data.posts.length, 1);
        assert.ok(!('author' in output.data.posts[0]));
        assert.ok(!('authors' in output.data.posts[0]));
    });

    it('Single Co-Author (authors: undefined, author: person) is processed and post is not orphaned', async function () {
        // Simulates wp-xml output for a post with one contributor from category domain="author"
        const input = {
            posts: [{
                url: 'https://example.com/post',
                data: {
                    title: 'Post by contributor',
                    slug: 'post-by-contributor',
                    status: 'published',
                    published_at: '2024-01-01T00:00:00.000Z',
                    authors: undefined,
                    author: {
                        url: 'contributor-1',
                        data: {slug: 'contributor-1', name: 'Contributor One'}
                    }
                }
            }],
            users: []
        };
        const output = await toGhostJSON(input);

        assertGhostJSON(output);
        assert.equal(output.data.posts.length, 1);
        assert.ok(!('author' in output.data.posts[0]));
        assert.ok(!('authors' in output.data.posts[0]));
        assert.equal(output.data.users.length, 1);
        assert.equal(output.data.users[0].slug, 'contributor-1');
        assert.equal(output.data.users[0].name, 'Contributor One');
        assert.equal(output.data.posts_authors.length, 1);
        assert.deepEqual(output.data.posts_authors[0].post_id, output.data.posts[0].id);
        assert.deepEqual(output.data.posts_authors[0].author_id, output.data.users[0].id);
    });

    it('Multiple co-authors are in users and posts_authors and linked correctly', async function () {
        // Use distinct slugs so they don't collide with single co-author test (module-level slug dedup state)
        const input = {
            posts: [{
                url: 'https://example.com/post',
                data: {
                    title: 'Post by two contributors',
                    slug: 'post-by-two',
                    status: 'published',
                    published_at: '2024-01-01T00:00:00.000Z',
                    authors: [
                        {url: 'multi-contributor-1', data: {slug: 'multi-contributor-1', name: 'Contributor One'}},
                        {url: 'multi-contributor-2', data: {slug: 'multi-contributor-2', name: 'Contributor Two'}}
                    ]
                }
            }],
            users: []
        };
        const output = await toGhostJSON(input);

        assert.equal(output.data.posts.length, 1);
        assert.ok(!('author' in output.data.posts[0]));
        assert.ok(!('authors' in output.data.posts[0]));
        assert.equal(output.data.users.length, 2);
        const slug = u => u.slug || (u.data && u.data.slug);
        const user1 = output.data.users.find(u => slug(u) === 'multi-contributor-1');
        const user2 = output.data.users.find(u => slug(u) === 'multi-contributor-2');
        assert.ok(user1 !== undefined);
        assert.ok(user2 !== undefined);
        const name = u => u.name || (u.data && u.data.name);
        assert.equal(name(user1), 'Contributor One');
        assert.equal(name(user2), 'Contributor Two');
        assert.equal(output.data.posts_authors.length, 2);
        const postAuthors = output.data.posts_authors.filter(pa => pa.post_id.equals(output.data.posts[0].id));
        assert.equal(postAuthors.length, 2);
        const userId = u => u.id || (u.data && u.data.id);
        const authorIds = postAuthors.map(pa => pa.author_id.toString()).sort();
        assert.deepEqual(authorIds, [userId(user1), userId(user2)].map(id => id.toString()).sort());
    });

    it('Calculates relations across multiple posts', async function () {
        const output = await toGhostJSON(multiPostOnlyFixture);

        assertGhostJSON(output);
    });

    it('Ensures internal tags are listed last', async function () {
        const output = await toGhostJSON(singlePostWithBadTagOrderFixture);

        assert.equal(output.data.tags.length, 3);
        assert.equal(output.data.tags[0].name, 'Things');
        assert.equal(output.data.tags[1].name, 'Stuff');
        assert.equal(output.data.tags[2].name, '#internal');
    });

    it('Filters out empty tags ', async function () {
        const output = await toGhostJSON(singlePostWithEmptyTagFixture);

        assert.equal(output.data.tags.length, 2);
        assert.equal(output.data.tags[0].name, 'Things');
        assert.equal(output.data.tags[1].name, 'Stuff');
    });

    it('Trims strings that are too long', async function () {
        const output = await toGhostJSON(singlePostOnlyLongMetaFixture);

        assert.ok(output.data.posts[0].custom_excerpt.length <= 300);
        assert.ok(output.data.posts_meta[0].meta_description.length <= 500);
        assert.ok(output.data.posts_meta[0].feature_image_alt.length <= 125);

        assert.ok(output.data.tags[2].name.length <= 185);
        assert.ok(output.data.tags[2].slug.length <= 185);
    });

    it('Moves meta data to posts_meta object', async function () {
        const output = await toGhostJSON(singlePostOnlyMetaFixture);

        // Data should be in `posts_meta[0]`
        assert.equal(output.data.posts_meta[0].meta_title, 'This is my Blog Post Title');
        assert.equal(output.data.posts_meta[0].meta_description, 'Morbi lectus purus, blandit eu tristique nec, sollicitudin vel odio.');
        assert.equal(output.data.posts_meta[0].feature_image_alt, 'Lorem ipsum dolor sit amet');
        assert.equal(output.data.posts_meta[0].feature_image_caption, 'Caption text');

        // Data should not exist in `posts[0]`
        assert.equal(output.data.posts[0].meta_title, undefined);
        assert.equal(output.data.posts[0].meta_description, undefined);
        assert.equal(output.data.posts[0].feature_image_alt, undefined);
        assert.equal(output.data.posts[0].feature_image_caption, undefined);
    });

    it('Falls back to fake email if provided email is not valid', async function () {
        const output = await toGhostJSON(singlePostAuthorBadEmailFixture);

        assert.equal(output.data.users[0].email, 'joe@example.com');
    });

    it('Keeps deduplicated slugs within Ghost 191-char limit', async function () {
        // Two posts with the same long slug: dedupe truncates the base to 166 chars,
        // then appends -<ObjectID> (25 chars), keeping the total <= 191
        const longSlug = 'a'.repeat(200);
        const input = {
            posts: [
                {
                    url: 'https://example.com/p/first',
                    data: {
                        slug: longSlug,
                        title: 'First',
                        status: 'published',
                        published_at: '2018-08-11T11:23:34.123Z',
                        html: '<p>One</p>',
                        author: {url: 'https://example.com/me', data: {name: 'Me', slug: 'me', roles: ['Author']}}
                    }
                },
                {
                    url: 'https://example.com/p/second',
                    data: {
                        slug: longSlug,
                        title: 'Second',
                        status: 'published',
                        published_at: '2018-08-11T11:23:34.123Z',
                        html: '<p>Two</p>',
                        author: {url: 'https://example.com/me', data: {name: 'Me', slug: 'me', roles: ['Author']}}
                    }
                }
            ]
        };
        const output = await toGhostJSON(input);

        assertGhostJSON(output);
        assert.equal(output.data.posts.length, 2);

        const slug0 = output.data.posts[0].slug;
        const slug1 = output.data.posts[1].slug;

        assert.ok(slug0.length <= 191);
        assert.ok(slug1.length <= 191);
        assert.notEqual(slug1, slug0);
        assert.match(slug1, /^[a-z0-9-]+-[0-9a-f]{24}$/i);
    });
});
