/* eslint no-undef: 0 */
const toGhostJSON = require('../lib/to-ghost-json');

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
    test('Calculates relations when it only has a post', function () {
        const input = require('./fixtures/single-post-only.json');
        const output = toGhostJSON(input);

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
    test('Correctly decodes titles', function () {
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
        const output = toGhostJSON(input);

        expect(output).toBeGhostJSON();
        expect(output.data.posts).toBeArrayOfSize(1);
        expect(output.data.posts[0].title).toEqual('This shit’s cool');
    });

    test('Calculates relations with both post and users', function () {
        const input = require('./fixtures/single-post-author.json');

        const output = toGhostJSON(input);

        expect(output).toBeGhostJSON();
    });

    test('Calculates relations across multiple posts', function () {
        const input = require('./fixtures/multi-post-only.json');

        const output = toGhostJSON(input);

        expect(output).toBeGhostJSON();
    });

    test('Ensures internal tags are listed last', function () {
        const input = require('./fixtures/single-post-with-bad-tag-order.json');
        const output = toGhostJSON(input);

        expect(output.data.tags).toBeArrayOfSize(3);
        expect(output.data.tags[0].name).toEqual('Things');
        expect(output.data.tags[1].name).toEqual('Stuff');
        expect(output.data.tags[2].name).toEqual('#internal');
    });

    test('Trims strings that are too long', function () {
        const input = require('./fixtures/single-post-only-long-meta.json');
        const output = toGhostJSON(input);

        expect(output.data.posts[0].custom_excerpt.length).toBeLessThanOrEqual(300);
        expect(output.data.posts_meta[0].meta_description.length).toBeLessThanOrEqual(500);
        expect(output.data.posts_meta[0].feature_image_alt.length).toBeLessThanOrEqual(125);
    });

    test('Moves meta data to posts_meta object', function () {
        const input2 = require('./fixtures/single-post-only-meta.json');
        const output = toGhostJSON(input2);

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
});
