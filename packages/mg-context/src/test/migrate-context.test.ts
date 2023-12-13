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

    test('Can return Ghost JSON', async () => {
        const ghostJSON = reusedInstance.ghostJson;

        assert.deepEqual(Object.keys(ghostJSON), ['meta', 'data']);
        assert.deepEqual(Object.keys(ghostJSON.data), ['posts', 'users', 'tags', 'posts_authors', 'posts_tags', 'posts_meta']);
        assert.deepEqual(ghostJSON.data.posts.length, 2);
    });

    describe('findPosts', () => {
        const findPostsInstance: any = new MigrateContext();

        const post1 = findPostsInstance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.addTag({name: 'First Post Tag', slug: 'first-post-tag'});
        post1.addTag({name: 'Common Tag', slug: 'common-tag'});
        post1.addAuthor({name: 'Unique Author', slug: 'unique-author', email: 'unique@example.com'});
        post1.addAuthor({name: 'Common Author', slug: 'common-author', email: 'common@example.com'});

        const post2 = findPostsInstance.addPost({
            source: {
                url: 'https://example.com/blog/2023/11/26/another-post/'
            }
        });
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.addTag({name: 'Second Post Tag', slug: 'second-post-tag'});
        post2.addTag({name: 'Common Tag', slug: 'common-tag'});
        post2.addAuthor({name: 'Common Author', slug: 'common-author', email: 'common@example.com'});
        post2.addAuthor({name: 'Other Author', slug: 'other-author', email: 'other@example.com'});

        test('Can find posts by slug', async () => {
            const posts = findPostsInstance.findPosts({slug: 'another-post'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Returns if no index match found', async () => {
            const posts = findPostsInstance.findPosts({slug: 'does-not-exist'});

            assert.deepEqual(posts, []);
        });

        test('Can find posts by title', async () => {
            const posts = findPostsInstance.findPosts({title: 'Another Post'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Returns if no title match found', async () => {
            const posts = findPostsInstance.findPosts({title: 'Does Not Exist'});

            assert.deepEqual(posts, []);
        });

        test('Can find posts by source attribute', async () => {
            const posts = findPostsInstance.findPosts({sourceAttr: {
                key: 'url',
                value: 'https://example.com/blog/2023/11/26/another-post/'
            }});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Returns if no source attribute match found', async () => {
            const posts = findPostsInstance.findPosts({sourceAttr: {
                key: 'url',
                value: 'https://example.com/blog/2023/11/26/does-not-exist/'
            }});

            assert.deepEqual(posts, []);
        });

        test('Can find posts by tag slug', async () => {
            const posts = findPostsInstance.findPosts({tagSlug: 'second-post-tag'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Can find posts by tag name', async () => {
            const posts = findPostsInstance.findPosts({tagName: 'Second Post Tag'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Can find posts by author slug', async () => {
            const posts = findPostsInstance.findPosts({authorSlug: 'other-author'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Can find posts by author name', async () => {
            const posts = findPostsInstance.findPosts({authorName: 'Other Author'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Can find posts by author email', async () => {
            const posts = findPostsInstance.findPosts({authorEmail: 'other@example.com'});

            assert.equal(Array.isArray(posts), true);
            assert.equal(posts.length, 1);
            assert.equal(posts[0].data.title, 'Another Post');
            assert.equal(posts[0].data.slug, 'another-post');
        });

        test('Returns null matcher supplied', async () => {
            const posts = findPostsInstance.findPosts();

            assert.equal(posts, null);
        });
    });

    describe('findTags', () => {
        const findTagsInstance: any = new MigrateContext();

        const post1 = findTagsInstance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.addTag({name: 'First Post Tag', slug: 'first-post-tag'});
        post1.addTag({name: 'Common Tag', slug: 'common-tag'});

        const post2 = findTagsInstance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.addTag({name: 'Second Post Tag', slug: 'second-post-tag'});
        post2.addTag({name: 'Common Tag', slug: 'common-tag'});

        test('Can find tags by slug', async () => {
            const tags = findTagsInstance.findTags({slug: 'common-tag'});

            assert.equal(Array.isArray(tags), true);
            assert.equal(tags.length, 2);
            assert.equal(tags[0].data.name, 'Common Tag');
            assert.equal(tags[0].data.slug, 'common-tag');
            assert.equal(tags[1].data.name, 'Common Tag');
            assert.equal(tags[1].data.slug, 'common-tag');
        });

        test('Can find tags by name', async () => {
            const tags = findTagsInstance.findTags({name: 'Common Tag'});

            assert.equal(Array.isArray(tags), true);
            assert.equal(tags.length, 2);
            assert.equal(tags[0].data.name, 'Common Tag');
            assert.equal(tags[0].data.slug, 'common-tag');
            assert.equal(tags[1].data.name, 'Common Tag');
            assert.equal(tags[1].data.slug, 'common-tag');
        });

        test('Can update all found tags', async () => {
            const tags = findTagsInstance.findTags({slug: 'common-tag'});

            tags.forEach((tag: any) => {
                tag.set('name', 'Common Tag Updated').set('slug', 'common-tag-updated');
            });

            assert.equal(findTagsInstance.allPosts[0].data.tags[0].data.name, 'First Post Tag');
            assert.equal(findTagsInstance.allPosts[0].data.tags[1].data.name, 'Common Tag Updated');
            assert.equal(findTagsInstance.allPosts[1].data.tags[0].data.name, 'Second Post Tag');
            assert.equal(findTagsInstance.allPosts[1].data.tags[1].data.name, 'Common Tag Updated');
        });

        test('Returns null matcher supplied', async () => {
            const tags = findTagsInstance.findTags();

            assert.equal(tags, null);
        });
    });

    describe('findAuthors', () => {
        const findAuthorsInstance: any = new MigrateContext();

        const post1 = findAuthorsInstance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.addAuthor({name: 'Unique Author', slug: 'unique-author', email: 'unique@example.com'});
        post1.addAuthor({name: 'Common Author', slug: 'common-author', email: 'common@example.com'});

        const post2 = findAuthorsInstance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.addAuthor({name: 'Common Author', slug: 'common-author', email: 'common@example.com'});

        test('Can find authors by slug', async () => {
            const authors = findAuthorsInstance.findAuthors({slug: 'common-author'});

            assert.equal(Array.isArray(authors), true);
            assert.equal(authors.length, 2);
            assert.equal(authors[0].data.name, 'Common Author');
            assert.equal(authors[0].data.slug, 'common-author');
            assert.equal(authors[1].data.name, 'Common Author');
            assert.equal(authors[1].data.slug, 'common-author');
        });

        test('Can find authors by name', async () => {
            const authors = findAuthorsInstance.findAuthors({name: 'Common Author'});

            assert.equal(Array.isArray(authors), true);
            assert.equal(authors.length, 2);
            assert.equal(authors[0].data.name, 'Common Author');
            assert.equal(authors[0].data.slug, 'common-author');
            assert.equal(authors[1].data.name, 'Common Author');
            assert.equal(authors[1].data.slug, 'common-author');
        });

        test('Can find authors by email', async () => {
            const authors = findAuthorsInstance.findAuthors({email: 'common@example.com'});

            assert.equal(Array.isArray(authors), true);
            assert.equal(authors.length, 2);
            assert.equal(authors[0].data.name, 'Common Author');
            assert.equal(authors[0].data.slug, 'common-author');
            assert.equal(authors[1].data.name, 'Common Author');
            assert.equal(authors[1].data.slug, 'common-author');
        });

        test('Can update all found authors', async () => {
            const authors = findAuthorsInstance.findAuthors({slug: 'common-author'});

            authors.forEach((tag: any) => {
                tag.set('name', 'Common Author Updated').set('slug', 'common-author-updated');
            });

            assert.equal(findAuthorsInstance.allPosts[0].data.authors[0].data.name, 'Unique Author');
            assert.equal(findAuthorsInstance.allPosts[0].data.authors[1].data.name, 'Common Author Updated');
            assert.equal(findAuthorsInstance.allPosts[1].data.authors[0].data.name, 'Common Author Updated');
        });

        test('Returns null matcher supplied', async () => {
            const authors = findAuthorsInstance.findAuthors();

            assert.equal(authors, null);
        });
    });
});
