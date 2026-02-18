import toGhostJSON from '../lib/to-ghost-json/index.js';

import singlePostOnlyFixture from './fixtures/single-post-only.json';
import singlePostWithEmptyTagFixture from './fixtures/single-post-with-empty-tag.json';
import singlePostAuthorFixture from './fixtures/single-post-author.json';
import singlePostAuthorBadEmailFixture from './fixtures/single-post-author-bad-email.json';
import multiPostOnlyFixture from './fixtures/multi-post-only.json';
import singlePostWithBadTagOrderFixture from './fixtures/single-post-with-bad-tag-order.json';
import singlePostOnlyLongMetaFixture from './fixtures/single-post-only-long-meta.json';
import singlePostOnlyMetaFixture from './fixtures/single-post-only-meta.json';

expect.extend({
    toBeGhostJSON(received, expected) {
        const GhostPost = (post) => {
            expect(post).toBeObject();
            expect(post).not.toContainKeys(['url', 'data']);
            expect(post).toContainKeys(['slug', 'title', 'status']);
        };

        const GhostUser = (user) => {
            expect(user).toBeObject();
            expect(user).not.toContainKeys(['url', 'data']);
            expect(user).toContainKeys(['slug', 'name', 'email', 'roles']);
        };

        const GhostTag = (tag) => {
            expect(tag).toBeObject();
            expect(tag).not.toContainKeys(['url', 'data']);
            expect(tag).toContainKeys(['slug', 'name']);
        };

        const GhostJSON = (value) => {
            expect(value).toBeObject();
            expect(value).toHaveProperty('meta');
            expect(value).toHaveProperty('data');

            expect(value.meta).toBeObject();
            expect(value.meta).toHaveProperty('exported_on');
            expect(value.meta).toHaveProperty('version');

            expect(value.data).toContainAllKeys(['posts', 'posts_authors', 'posts_meta', 'posts_tags', 'tags', 'users']);

            // posts
            expect(value.data.posts).toBeArray();
            value.data.posts.forEach(post => GhostPost(post));

            // users
            expect(value.data.users).toBeArray();
            value.data.users.forEach(user => GhostUser(user));

            // tags
            if (value.data.tags) {
                expect(value.data.tags).toBeArray();
                value.data.tags.forEach(tag => GhostTag(tag));
            }

            // Relations...

            // Posts must have a valid relation in the posts_meta object
            expect(value.data.posts_meta).toBeArray();
            expect(value.data.posts_meta.length).toBeGreaterThanOrEqual(1);
            value.data.posts_meta.forEach((postMeta) => {
                expect(postMeta).toBeObject();
                expect(postMeta).toContainKey('post_id');
            });

            // Ghost posts must have at least one author, but we still convert to Ghost's expected multiauthor format
            expect(value.data.posts_authors).toBeArray();
            expect(value.data.posts_authors.length).toBeGreaterThanOrEqual(1);
            value.data.posts_authors.forEach((postAuthor) => {
                expect(postAuthor).toBeObject();
                expect(postAuthor).toContainKey('post_id');
                expect(postAuthor).toContainKey('author_id');
            });

            // there can be mutliple tags, but also no tags
            expect(value.data.posts_tags).toBeArray();
            if (value.data.posts_tags.length > 0) {
                value.data.posts_tags.forEach((postTag) => {
                    expect(postTag).toBeObject();
                    expect(postTag).toContainKey('post_id');
                    expect(postTag).toContainKey('tag_id');
                });
            }
        };

        // expected can either be an array or an object
        const expectedResult = GhostJSON(received);

        // equality check for received todo and expected todo
        const pass = this.equals(expected, expectedResult);

        if (pass) {
            return {
                message: () => `Expected: ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(received)}`,
                pass: true
            };
        }
        return {
            message: () => `Expected: ${this.utils.printExpected(expected)}\nReceived: ${this.utils.printReceived(received)}\n\n${this.utils.diff(expected, received)}`,
            pass: false
        };
    }
});

describe('toGhostJSON', function () {
    test('Calculates relations when it only has a post', async function () {
        const output = await toGhostJSON(singlePostOnlyFixture);

        expect(output).toBeGhostJSON();
        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.tags).toBeArrayOfSize(2);

        expect(output.data.users).toBeArrayOfSize(1);
        expect(output.data.users[0].roles[0]).toEqual('Administrator');

        expect(output.data.posts_authors).toBeArrayOfSize(1);
        expect(output.data.posts_authors[0].post_id).toEqual(output.data.posts[0].id);
        expect(output.data.posts_authors[0].author_id).toEqual(output.data.users[0].id);

        expect(output.data.posts_tags).toBeArrayOfSize(2);
        expect(output.data.posts_tags[0].post_id).toEqual(output.data.posts[0].id);
        expect(output.data.posts_tags[0].tag_id).toEqual(output.data.tags[0].id);
        expect(output.data.posts_tags[1].post_id).toEqual(output.data.posts[0].id);
        expect(output.data.posts_tags[1].tag_id).toEqual(output.data.tags[1].id);
    });

    // @TODO: make it so that this test doesn't need a post slug or an author
    // Hydrator should be able to cope with absolutely minimal data
    test('Correctly decodes titles', async function () {
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

        expect(output).toBeGhostJSON();
        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.posts[0].title).toEqual('This shit’s cool');
    });

    test('Calculates relations with both post and users', async function () {
        const output = await toGhostJSON(singlePostAuthorFixture);

        expect(output).toBeGhostJSON();
    });

    test('Posts in output have no author field (only users + posts_authors)', async function () {
        const output = await toGhostJSON(singlePostOnlyFixture);

        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.posts[0]).not.toHaveProperty('author');
        expect(output.data.posts[0]).not.toHaveProperty('authors');
    });

    test('Single Co-Author (authors: undefined, author: person) is processed and post is not orphaned', async function () {
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

        expect(output).toBeGhostJSON();
        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.posts[0]).not.toHaveProperty('author');
        expect(output.data.posts[0]).not.toHaveProperty('authors');
        expect(output.data.users).toBeArrayOfSize(1);
        expect(output.data.users[0].slug).toEqual('contributor-1');
        expect(output.data.users[0].name).toEqual('Contributor One');
        expect(output.data.posts_authors).toBeArrayOfSize(1);
        expect(output.data.posts_authors[0].post_id).toEqual(output.data.posts[0].id);
        expect(output.data.posts_authors[0].author_id).toEqual(output.data.users[0].id);
    });

    test('Multiple co-authors are in users and posts_authors and linked correctly', async function () {
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

        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.posts[0]).not.toHaveProperty('author');
        expect(output.data.posts[0]).not.toHaveProperty('authors');
        expect(output.data.users).toBeArrayOfSize(2);
        const slug = u => u.slug || (u.data && u.data.slug);
        const user1 = output.data.users.find(u => slug(u) === 'multi-contributor-1');
        const user2 = output.data.users.find(u => slug(u) === 'multi-contributor-2');
        expect(user1).toBeDefined();
        expect(user2).toBeDefined();
        const name = u => u.name || (u.data && u.data.name);
        expect(name(user1)).toEqual('Contributor One');
        expect(name(user2)).toEqual('Contributor Two');
        expect(output.data.posts_authors).toBeArrayOfSize(2);
        const postAuthors = output.data.posts_authors.filter(pa => pa.post_id.equals(output.data.posts[0].id));
        expect(postAuthors).toBeArrayOfSize(2);
        const userId = u => u.id || (u.data && u.data.id);
        const authorIds = postAuthors.map(pa => pa.author_id.toString()).sort();
        expect(authorIds).toEqual([userId(user1), userId(user2)].map(id => id.toString()).sort());
    });

    test('Calculates relations across multiple posts', async function () {
        const output = await toGhostJSON(multiPostOnlyFixture);

        expect(output).toBeGhostJSON();
    });

    test('Ensures internal tags are listed last', async function () {
        const output = await toGhostJSON(singlePostWithBadTagOrderFixture);

        expect(output.data.tags).toBeArrayOfSize(3);
        expect(output.data.tags[0].name).toEqual('Things');
        expect(output.data.tags[1].name).toEqual('Stuff');
        expect(output.data.tags[2].name).toEqual('#internal');
    });

    test('Filters out empty tags ', async function () {
        const output = await toGhostJSON(singlePostWithEmptyTagFixture);

        expect(output.data.tags).toBeArrayOfSize(2);
        expect(output.data.tags[0].name).toEqual('Things');
        expect(output.data.tags[1].name).toEqual('Stuff');
    });

    test('Trims strings that are too long', async function () {
        const output = await toGhostJSON(singlePostOnlyLongMetaFixture);

        expect(output.data.posts[0].custom_excerpt.length).toBeLessThanOrEqual(300);
        expect(output.data.posts_meta[0].meta_description.length).toBeLessThanOrEqual(500);
        expect(output.data.posts_meta[0].feature_image_alt.length).toBeLessThanOrEqual(125);

        expect(output.data.tags[2].name.length).toBeLessThanOrEqual(185);
        expect(output.data.tags[2].slug.length).toBeLessThanOrEqual(185);
    });

    test('Moves meta data to posts_meta object', async function () {
        const output = await toGhostJSON(singlePostOnlyMetaFixture);

        // Data should be in `posts_meta[0]`
        expect(output.data.posts_meta[0].meta_title).toEqual('This is my Blog Post Title');
        expect(output.data.posts_meta[0].meta_description).toEqual('Morbi lectus purus, blandit eu tristique nec, sollicitudin vel odio.');
        expect(output.data.posts_meta[0].feature_image_alt).toEqual('Lorem ipsum dolor sit amet');
        expect(output.data.posts_meta[0].feature_image_caption).toEqual('Caption text');

        // Data should not exist in `posts[0]`
        // should.not.exist(output.data.posts[0].meta_title);
        expect(output.data.posts[0].meta_title).not.toBeDefined();
        // should.not.exist(output.data.posts[0].meta_description);
        expect(output.data.posts[0].meta_description).not.toBeDefined();
        // should.not.exist(output.data.posts[0].feature_image_alt);
        expect(output.data.posts[0].feature_image_alt).not.toBeDefined();
        // should.not.exist(output.data.posts[0].feature_image_caption);
        expect(output.data.posts[0].feature_image_caption).not.toBeDefined();
    });

    test('Falls back to fake email if provided email is not valid', async function () {
        const output = await toGhostJSON(singlePostAuthorBadEmailFixture);

        expect(output.data.users[0].email).toEqual('joe@example.com');
    });

    test('Keeps deduplicated slugs within Ghost 191-char limit', async function () {
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

        expect(output).toBeGhostJSON();
        expect(output.data.posts).toBeArrayOfSize(2);

        const slug0 = output.data.posts[0].slug;
        const slug1 = output.data.posts[1].slug;

        expect(slug0.length).toBeLessThanOrEqual(191);
        expect(slug1.length).toBeLessThanOrEqual(191);
        expect(slug1).not.toEqual(slug0);
        expect(slug1).toMatch(/^[a-z0-9-]+-[0-9a-f]{24}$/i);
    });
});
