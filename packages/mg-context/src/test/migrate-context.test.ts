import assert from 'node:assert/strict';
import {MigrateContext, PostContext} from '../index.js';

const reusedInstance: any = new MigrateContext();

const reusedPost1 = reusedInstance.addPost({
    source: {
        url: 'https://example.com/blog/2023/11/26/test-post/'
    }
});

reusedPost1.set('title', 'Test Post');
reusedPost1.set('slug', 'test-post');
reusedPost1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
reusedPost1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
reusedPost1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
reusedPost1.addTag({name: 'Test Tag', slug: 'test-tag'});
reusedPost1.addTag({name: 'First Tag', slug: 'first-tag'});
reusedPost1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
reusedPost1.addAuthor({name: 'First Author', slug: 'first-author', email: 'first@example.com'});

const reusedPost2 = reusedInstance.addPost({
    source: {
        url: 'https://example.com/blog/2023/11/26/another-post/'
    }
});
reusedPost2.set('title', 'Another Post');
reusedPost2.set('slug', 'another-post');
reusedPost2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
reusedPost2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
reusedPost2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
reusedPost2.addTag({name: 'Test Tag', slug: 'test-tag'});
reusedPost2.addTag({name: 'Second Tag', slug: 'second-tag'});
reusedPost2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
reusedPost2.addAuthor({name: 'Second Author', slug: 'second-author', email: 'second@example.com'});

describe('MigrateContext', () => {
    test('Is instance of', () => {
        const instance: any = new MigrateContext();

        assert.equal(instance instanceof MigrateContext, true);
    });

    test('Can add posts', () => {
        const instance: any = new MigrateContext();

        const post1 = instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));

        const post2 = instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

        assert.equal(instance.allPosts.length, 2);
        assert.equal(instance.allPosts[0].data.title, 'Test Post');
        assert.equal(instance.allPosts[1].data.title, 'Another Post');
    });

    test('Can add existing PostContext to list of posts', () => {
        const instance: any = new MigrateContext();

        const post1 = new PostContext();
        instance.addPost(post1);
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));

        const post2 = new PostContext();
        instance.addPost(post2);
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

        assert.equal(instance.allPosts.length, 2);
        assert.equal(instance.allPosts[0].data.title, 'Test Post');
        assert.equal(instance.allPosts[1].data.title, 'Another Post');
    });

    test('Can loop over posts async', async () => {
        const instance: any = new MigrateContext();

        const post1 = instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));

        const post2 = instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

        await instance.forEachPost((post: PostContext) => {
            post.set('status', 'published');
        });

        assert.equal(instance.allPosts.length, 2);
        assert.equal(instance.allPosts[0].data.status, 'published');
        assert.equal(instance.allPosts[1].data.status, 'published');
    });

    test('Can loop over posts sync', () => {
        const instance: any = new MigrateContext();

        const post1 = instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));

        const post2 = instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));

        instance.forEachPostSync((post: PostContext) => {
            post.set('status', 'published');
        });

        assert.equal(instance.allPosts.length, 2);
        assert.equal(instance.allPosts[0].data.status, 'published');
        assert.equal(instance.allPosts[1].data.status, 'published');
    });

    describe('findPosts', () => {
        test('Can find posts by slug', () => {
            const foundPosts = reusedInstance.findPosts({
                slug: 'another-post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by title', () => {
            const foundPosts = reusedInstance.findPosts({
                title: 'Another Post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by source', () => {
            const foundPosts = reusedInstance.findPosts({
                sourceAttr: {
                    key: 'url',
                    value: 'https://example.com/blog/2023/11/26/test-post/'
                }
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Test Post');
        });

        test('Can find posts by tag slug', () => {
            const foundPosts = reusedInstance.findPosts({
                tagSlug: 'second-tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by tag name', () => {
            const foundPosts = reusedInstance.findPosts({
                tagName: 'Second Tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by author slug', () => {
            const foundPosts = reusedInstance.findPosts({
                authorSlug: 'second-author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by author name', () => {
            const foundPosts = reusedInstance.findPosts({
                authorName: 'Second Author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Can find posts by author email', () => {
            const foundPosts = reusedInstance.findPosts({
                authorEmail: 'second@example.com'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        test('Returns null if no filter provided', () => {
            const foundPosts = reusedInstance.findPosts({});

            assert.equal(foundPosts, null);
        });
    });

    describe('findTags', () => {
        test('Can find tags by slug', () => {
            const foundTags = reusedInstance.findTags({
                slug: 'second-tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        test('Can find tags by name', () => {
            const foundTags = reusedInstance.findTags({
                name: 'Second Tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        test('Returns null if no filter provided', () => {
            const foundTags = reusedInstance.findTags({});

            assert.equal(foundTags, null);
        });
    });

    describe('findAuthors', () => {
        test('Can find authors by slug', () => {
            const foundAuthors = reusedInstance.findAuthors({
                slug: 'second-author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        test('Can find authors by name', () => {
            const foundAuthors = reusedInstance.findAuthors({
                name: 'Second Author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        test('Can find authors by email', () => {
            const foundAuthors = reusedInstance.findAuthors({
                email: 'second@example.com'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        test('Returns null if no filter provided', () => {
            const foundTags = reusedInstance.findAuthors({});

            assert.equal(foundTags, null);
        });
    });

    test('Can return Ghost JSON', async () => {
        const ghostJSON = await reusedInstance.ghostJson;

        assert.deepEqual(Object.keys(ghostJSON), ['meta', 'data']);
        assert.deepEqual(Object.keys(ghostJSON.data), ['posts', 'users', 'tags', 'posts_authors', 'posts_tags', 'posts_meta']);
        assert.deepEqual(ghostJSON.data.posts.length, 2);
    });
});
