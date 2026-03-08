import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile, unlink} from 'node:fs/promises';
import {MigrateContext, PostContext} from '../index.js';

describe('MigrateContext', () => {
    it('Is instance of', () => {
        const instance: any = new MigrateContext();

        assert.equal(instance instanceof MigrateContext, true);
    });

    it('Throws when accessing db before init', () => {
        const instance: any = new MigrateContext();

        assert.throws(() => instance.db, {
            name: 'InternalServerError',
            message: 'Database not initialized. Call init() first.'
        });
    });

    it('Can init and close', async () => {
        const instance: any = new MigrateContext();
        await instance.init();
        assert.ok(instance.db);
        await instance.close();
    });

    it('Can use file-based DB with dbPath', async () => {
        const filePath = join(tmpdir(), `mg-context-db-test-${Date.now()}.sqlite`);
        const instance: any = new MigrateContext({dbPath: filePath});
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'File DB Post');
        post.set('slug', 'file-db-post');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        await post.save(instance.db);

        const posts = await instance.getAllPosts();
        assert.equal(posts.length, 1);
        assert.equal(posts[0].data.title, 'File DB Post');

        await instance.close();
        await unlink(filePath);
    });

    it('Can add posts', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.title, 'Test Post');
        assert.equal(allPosts[1].data.title, 'Another Post');

        await instance.close();
    });

    it('Can add existing PostContext to list of posts', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = new PostContext();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await instance.addPost(post1);

        const post2 = new PostContext();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await instance.addPost(post2);

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.title, 'Test Post');
        assert.equal(allPosts[1].data.title, 'Another Post');

        await instance.close();
    });

    it('Can loop over posts async', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        await instance.forEachPost(async (post: PostContext) => {
            post.set('status', 'published');
            await post.save(instance.db);
        });

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.status, 'published');
        assert.equal(allPosts[1].data.status, 'published');

        await instance.close();
    });

    describe('findPosts', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const reusedPost1 = await reusedInstance.addPost({
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
            await reusedPost1.save(reusedInstance.db);

            const reusedPost2 = await reusedInstance.addPost({
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
            await reusedPost2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find posts by slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                slug: 'another-post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by title', async () => {
            const foundPosts = await reusedInstance.findPosts({
                title: 'Another Post'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by source', async () => {
            const foundPosts = await reusedInstance.findPosts({
                sourceAttr: {
                    key: 'url',
                    value: 'https://example.com/blog/2023/11/26/test-post/'
                }
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Test Post');
        });

        it('Can find posts by tag slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                tagSlug: 'second-tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by tag name', async () => {
            const foundPosts = await reusedInstance.findPosts({
                tagName: 'Second Tag'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author slug', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorSlug: 'second-author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author name', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorName: 'Second Author'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Can find posts by author email', async () => {
            const foundPosts = await reusedInstance.findPosts({
                authorEmail: 'second@example.com'
            });

            assert.equal(foundPosts.length, 1);
            assert.equal(foundPosts[0].data.title, 'Another Post');
        });

        it('Returns null if no filter provided', async () => {
            const foundPosts = await reusedInstance.findPosts({});

            assert.equal(foundPosts, null);
        });

        it('Returns empty array for non-existent tag slug', async () => {
            const found = await reusedInstance.findPosts({tagSlug: 'nonexistent-tag'});
            assert.deepEqual(found, []);
        });

        it('Returns empty array for non-existent author slug', async () => {
            const found = await reusedInstance.findPosts({authorSlug: 'nonexistent-author'});
            assert.deepEqual(found, []);
        });

        it('Returns empty array for non-existent author email', async () => {
            const found = await reusedInstance.findPosts({authorEmail: 'nonexistent@example.com'});
            assert.deepEqual(found, []);
        });
    });

    describe('findTags', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const post1 = await reusedInstance.addPost();
            post1.set('title', 'Test Post');
            post1.set('slug', 'test-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Test Tag', slug: 'test-tag'});
            post1.addTag({name: 'First Tag', slug: 'first-tag'});
            await post1.save(reusedInstance.db);

            const post2 = await reusedInstance.addPost();
            post2.set('title', 'Another Post');
            post2.set('slug', 'another-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Test Tag', slug: 'test-tag'});
            post2.addTag({name: 'Second Tag', slug: 'second-tag'});
            await post2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find tags by slug', async () => {
            const foundTags = await reusedInstance.findTags({
                slug: 'second-tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        it('Can find tags by name', async () => {
            const foundTags = await reusedInstance.findTags({
                name: 'Second Tag'
            });

            assert.equal(foundTags.length, 1);
            assert.equal(foundTags[0].data.name, 'Second Tag');
        });

        it('Returns null if no filter provided', async () => {
            const foundTags = await reusedInstance.findTags({});

            assert.equal(foundTags, null);
        });
    });

    describe('findAuthors', () => {
        let reusedInstance: any;

        before(async () => {
            reusedInstance = new MigrateContext();
            await reusedInstance.init();

            const post1 = await reusedInstance.addPost();
            post1.set('title', 'Test Post');
            post1.set('slug', 'test-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            post1.addAuthor({name: 'First Author', slug: 'first-author', email: 'first@example.com'});
            await post1.save(reusedInstance.db);

            const post2 = await reusedInstance.addPost();
            post2.set('title', 'Another Post');
            post2.set('slug', 'another-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            post2.addAuthor({name: 'Second Author', slug: 'second-author', email: 'second@example.com'});
            await post2.save(reusedInstance.db);
        });

        after(async () => {
            await reusedInstance.close();
        });

        it('Can find authors by slug', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                slug: 'second-author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Can find authors by name', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                name: 'Second Author'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Can find authors by email', async () => {
            const foundAuthors = await reusedInstance.findAuthors({
                email: 'second@example.com'
            });

            assert.equal(foundAuthors.length, 1);
            assert.equal(foundAuthors[0].data.name, 'Second Author');
        });

        it('Returns null if no filter provided', async () => {
            const foundTags = await reusedInstance.findAuthors({});

            assert.equal(foundTags, null);
        });
    });

    it('Can return Ghost JSON', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost({
            source: {url: 'https://example.com/blog/2023/11/26/test-post/'}
        });
        post1.set('title', 'Test Post');
        post1.set('slug', 'test-post');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('updated_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.set('published_at', new Date('2023-11-23T12:00:00.000Z'));
        post1.addTag({name: 'Test Tag', slug: 'test-tag'});
        post1.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post1.save(instance.db);

        const post2 = await instance.addPost({
            source: {url: 'https://example.com/blog/2023/11/26/another-post/'}
        });
        post2.set('title', 'Another Post');
        post2.set('slug', 'another-post');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.set('published_at', new Date('2023-11-24T12:00:00.000Z'));
        post2.addTag({name: 'Test Tag', slug: 'test-tag'});
        post2.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post2.save(instance.db);

        const ghostJSON = await instance.ghostJson;

        assert.deepEqual(Object.keys(ghostJSON), ['meta', 'data']);
        assert.deepEqual(Object.keys(ghostJSON.data), ['posts', 'users', 'tags', 'posts_authors', 'posts_tags', 'posts_meta']);
        assert.deepEqual(ghostJSON.data.posts.length, 2);

        await instance.close();
    });

    it('Can write Ghost JSON to file', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post = await instance.addPost();
        post.set('title', 'File Test Post');
        post.set('slug', 'file-test-post');
        post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
        await post.save(instance.db);

        const filePath = join(tmpdir(), `mg-context-test-${Date.now()}.json`);
        const result = await instance.writeGhostJson(filePath);

        const fileContent = JSON.parse(await readFile(filePath, 'utf-8'));
        assert.deepEqual(Object.keys(fileContent), ['meta', 'data']);
        assert.deepEqual(fileContent.data.posts.length, 1);
        assert.deepEqual(Object.keys(result), ['meta', 'data']);

        await unlink(filePath);
        await instance.close();
    });

    describe('Ghost JSON content formats', () => {
        it('Can export with HTML only', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'HTML Only Post');
            post.set('slug', 'html-only-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('html', '<p>Hello world</p>');
            post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            await post.save(instance.db);

            const ghostJSON = await instance.ghostJson;

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, '<p>Hello world</p>');
            assert.equal(ghostJSON.data.posts[0].mobiledoc, null);
            assert.equal(ghostJSON.data.posts[0].lexical, null);

            await instance.close();
        });

        it('Can export with Lexical only', async () => {
            const instance: any = new MigrateContext({contentFormat: 'lexical'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Lexical Only Post');
            post.set('slug', 'lexical-only-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('html', '<p>Hello world</p>');
            post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            await post.save(instance.db);

            const ghostJSON = await instance.ghostJson;

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, null);
            assert.ok(ghostJSON.data.posts[0].lexical);
            assert.equal(typeof ghostJSON.data.posts[0].lexical, 'object');
            assert.equal(ghostJSON.data.posts[0].mobiledoc, null);

            await instance.close();
        });

        it('Can export with Mobiledoc only', async () => {
            const instance: any = new MigrateContext({contentFormat: 'mobiledoc'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Mobiledoc Only Post');
            post.set('slug', 'mobiledoc-only-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('html', '<p>Hello world</p>');
            post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            await post.save(instance.db);

            const ghostJSON = await instance.ghostJson;

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, null);
            assert.ok(ghostJSON.data.posts[0].mobiledoc);
            assert.equal(typeof ghostJSON.data.posts[0].mobiledoc, 'object');
            assert.equal(ghostJSON.data.posts[0].lexical, null);

            await instance.close();
        });
    });

    describe('Standalone save', () => {
        it('Can update a tag with existing dbId', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Tag Update Test');
            post.set('slug', 'tag-update-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'Original Name', slug: 'update-tag'});
            await post.save(instance.db);

            // Load the tag from DB, modify it, and save again (covers dbId UPDATE branch)
            const tags = await instance.findTags({slug: 'update-tag'});
            assert.equal(tags!.length, 1);
            tags![0].set('name', 'Updated Name');
            await tags![0].save(instance.db);

            const updatedTags = await instance.findTags({slug: 'update-tag'});
            assert.equal(updatedTags![0].data.name, 'Updated Name');

            await instance.close();
        });

        it('Can update an author with existing dbId', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Author Update Test');
            post.set('slug', 'author-update-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addAuthor({name: 'Original Author', slug: 'update-author', email: 'update@example.com'});
            await post.save(instance.db);

            // Load the author from DB, modify it, and save again (covers dbId UPDATE branch)
            const authors = await instance.findAuthors({slug: 'update-author'});
            assert.equal(authors!.length, 1);
            authors![0].set('name', 'Updated Author');
            await authors![0].save(instance.db);

            const updatedAuthors = await instance.findAuthors({slug: 'update-author'});
            assert.equal(updatedAuthors![0].data.name, 'Updated Author');

            await instance.close();
        });

        it('Can save a tag without a slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const {TagContext} = await import('../index.js');
            const tag = new TagContext({name: 'No Slug Tag'});
            await tag.save(instance.db);
            assert.ok(tag.dbId);

            await instance.close();
        });

        it('Can save an author without a slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const {AuthorContext} = await import('../index.js');
            const author = new AuthorContext({name: 'No Slug Author'});
            await author.save(instance.db);
            assert.ok(author.dbId);

            await instance.close();
        });
    });

    describe('DB round-trip', () => {
        it('Preserves post data through save and load', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Round Trip');
            post.set('slug', 'round-trip');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('updated_at', new Date('2023-11-24T12:00:00.000Z'));
            post.set('published_at', new Date('2023-11-25T12:00:00.000Z'));
            post.set('status', 'published');
            post.set('featured', true);
            post.set('html', '<p>Content</p>');
            post.addTag({name: 'Tag One', slug: 'tag-one'});
            post.addTag({name: 'Tag Two', slug: 'tag-two'});
            post.addAuthor({name: 'Author One', slug: 'author-one', email: 'one@example.com'});
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            const p = loaded[0];
            assert.equal(p.data.title, 'Round Trip');
            assert.equal(p.data.slug, 'round-trip');
            assert.equal(p.data.status, 'published');
            assert.equal(p.data.featured, true);
            assert.equal(p.data.html, '<p>Content</p>');
            assert.deepEqual(p.data.created_at, new Date('2023-11-23T12:00:00.000Z'));
            assert.deepEqual(p.data.updated_at, new Date('2023-11-24T12:00:00.000Z'));
            assert.deepEqual(p.data.published_at, new Date('2023-11-25T12:00:00.000Z'));
            assert.equal(p.data.tags.length, 2);
            assert.equal(p.data.tags[0].data.name, 'Tag One');
            assert.equal(p.data.tags[1].data.name, 'Tag Two');
            assert.equal(p.data.authors.length, 1);
            assert.equal(p.data.authors[0].data.name, 'Author One');

            await instance.close();
        });

        it('Tags are shared across posts', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Post 1');
            post1.set('slug', 'post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Post 2');
            post2.set('slug', 'post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            await post2.save(instance.db);

            // Both posts should reference the same tag in the DB
            const tags = await instance.findTags({slug: 'shared-tag'});
            assert.equal(tags.length, 1);

            await instance.close();
        });

        it('Mutable find results persist back to DB', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original Title');
            post.set('slug', 'mutable-test');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'News', slug: 'news'});
            await post.save(instance.db);

            const posts = await instance.findPosts({tagSlug: 'news'});
            assert.equal(posts!.length, 1);
            posts![0].addTag({name: 'Breaking', slug: 'breaking'});
            await posts![0].save(instance.db);

            const updated = await instance.findPosts({slug: 'mutable-test'});
            assert.equal(updated![0].data.tags.length, 2);
            assert.equal(updated![0].data.tags[1].data.slug, 'breaking');

            await instance.close();
        });
    });
});
