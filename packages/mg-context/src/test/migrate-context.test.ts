import assert from 'node:assert/strict';
import {describe, it, before, after, mock} from 'node:test';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readFile, unlink, rm} from 'node:fs/promises';
import errors from '@tryghost/errors';
import {MigrateContext, PostContext, TagContext, AuthorContext, type PostFilter} from '../index.js';
import {withTransaction} from '../lib/db-helpers.js';

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
        });

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts.length, 2);
        assert.equal(allPosts[0].data.status, 'published');
        assert.equal(allPosts[1].data.status, 'published');

        await instance.close();
    });

    it('Can loop over posts with progress option', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const post1 = await instance.addPost();
        post1.set('title', 'Post A');
        post1.set('slug', 'post-a');
        post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
        await post1.save(instance.db);

        const post2 = await instance.addPost();
        post2.set('title', 'Post B');
        post2.set('slug', 'post-b');
        post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
        await post2.save(instance.db);

        const progressCalls: [number, number][] = [];

        await instance.forEachPost(async (post: PostContext) => {
            post.set('status', 'published');
        }, {
            batchSize: 1,
            progress(processed: number, total: number) {
                progressCalls.push([processed, total]);
            }
        });

        const allPosts = await instance.getAllPosts();
        assert.equal(allPosts[0].data.status, 'published');
        assert.equal(allPosts[1].data.status, 'published');
        assert.deepEqual(progressCalls, [[1, 2], [2, 2]]);

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

    describe('forEachGhostPost', () => {
        it('Iterates all posts with valid Ghost JSON', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Ghost Post 1');
            post1.set('slug', 'ghost-post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Tag A', slug: 'tag-a'});
            post1.addAuthor({name: 'Author A', slug: 'author-a', email: 'a@example.com'});
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Ghost Post 2');
            post2.set('slug', 'ghost-post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'Tag B', slug: 'tag-b'});
            post2.addAuthor({name: 'Author B', slug: 'author-b', email: 'b@example.com'});
            await post2.save(instance.db);

            const collected: {json: any; post: PostContext}[] = [];

            await instance.forEachGhostPost(async (json: any, post: PostContext) => {
                collected.push({json, post});
            });

            assert.equal(collected.length, 2);

            // Each call receives a flat post object with tags and authors inline
            for (const {json} of collected) {
                assert.ok(json.title);
                assert.ok(json.slug);
                assert.ok(Array.isArray(json.tags));
                assert.ok(Array.isArray(json.authors));
            }

            // Correct post data
            assert.equal(collected[0].json.title, 'Ghost Post 1');
            assert.equal(collected[1].json.title, 'Ghost Post 2');

            // Tags and authors are flat objects (no data wrapper)
            assert.equal(collected[0].json.tags[0].slug, 'tag-a');
            assert.equal(collected[0].json.authors[0].email, 'a@example.com');

            // PostContext is also passed
            assert.equal(collected[0].post.data.title, 'Ghost Post 1');
            assert.equal(collected[1].post.data.title, 'Ghost Post 2');

            await instance.close();
        });

        it('Fires progress callback', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            for (let i = 1; i <= 3; i++) {
                const post = await instance.addPost();
                post.set('title', `Progress Post ${i}`);
                post.set('slug', `progress-post-${i}`);
                post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                await post.save(instance.db);
            }

            const progressCalls: [number, number][] = [];

            await instance.forEachGhostPost(async () => {}, {
                batchSize: 2,
                progress(processed: number, total: number) {
                    progressCalls.push([processed, total]);
                }
            });

            assert.deepEqual(progressCalls, [[2, 3], [3, 3]]);

            await instance.close();
        });

        it('Does not persist callback mutations', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Original Title');
            post.set('slug', 'original-title');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            await instance.forEachGhostPost(async (_json: any, p: PostContext) => {
                p.set('title', 'Mutated Title');
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Original Title');

            await instance.close();
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
        post1.set('meta_title', 'SEO Title');
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

        const writtenFiles = await instance.writeGhostJson(tmpdir());

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].posts, 2);
        assert.ok(writtenFiles[0].size > 0);
        assert.equal(writtenFiles[0].name, 'posts.json');
        const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

        assert.deepEqual(Object.keys(ghostJSON), ['meta', 'data']);
        assert.deepEqual(Object.keys(ghostJSON.data), ['posts', 'users', 'tags', 'posts_authors', 'posts_tags', 'posts_meta']);
        assert.deepEqual(ghostJSON.data.posts.length, 2);
        assert.equal(ghostJSON.data.posts_meta.length, 1);
        assert.equal(ghostJSON.data.posts_meta[0].meta_title, 'SEO Title');

        await unlink(writtenFiles[0].path);
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

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'file-test'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].name, 'file-test.json');
        const fileContent = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        assert.deepEqual(Object.keys(fileContent), ['meta', 'data']);
        assert.deepEqual(fileContent.data.posts.length, 1);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Can write batched Ghost JSON files', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        // Create 3 posts with different tags/authors
        for (let i = 1; i <= 3; i++) {
            const post = await instance.addPost();
            post.set('title', `Batch Post ${i}`);
            post.set('slug', `batch-post-${i}`);
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.addTag({name: 'Shared Tag', slug: 'shared-tag'});
            post.addTag({name: `Tag ${i}`, slug: `tag-${i}`});
            post.addAuthor({name: 'Shared Author', slug: 'shared-author', email: 'shared@example.com'});
            await post.save(instance.db);
        }

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {batchSize: 2, filename: 'batch-test'});

        assert.equal(writtenFiles.length, 2);
        assert.equal(writtenFiles[0].name, 'batch-test-1.json');
        assert.equal(writtenFiles[1].name, 'batch-test-2.json');
        assert.equal(writtenFiles[0].posts, 2);
        assert.equal(writtenFiles[1].posts, 1);

        const batch1 = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        const batch2 = JSON.parse(await readFile(writtenFiles[1].path, 'utf-8'));

        // Batch 1 has 2 posts, batch 2 has 1 post
        assert.equal(batch1.data.posts.length, 2);
        assert.equal(batch2.data.posts.length, 1);

        // Each batch includes the tags for its posts
        assert.ok(batch1.data.tags.length >= 2);
        assert.ok(batch2.data.tags.length >= 1);

        // Shared tag appears in both batches with the same ID
        const batch1SharedTag = batch1.data.tags.find((t: any) => t.slug === 'shared-tag');
        const batch2SharedTag = batch2.data.tags.find((t: any) => t.slug === 'shared-tag');
        assert.ok(batch1SharedTag);
        assert.ok(batch2SharedTag);
        assert.equal(batch1SharedTag.id, batch2SharedTag.id);

        // Shared author appears in both batches with the same ID
        const batch1SharedAuthor = batch1.data.users.find((u: any) => u.slug === 'shared-author');
        const batch2SharedAuthor = batch2.data.users.find((u: any) => u.slug === 'shared-author');
        assert.ok(batch1SharedAuthor);
        assert.ok(batch2SharedAuthor);
        assert.equal(batch1SharedAuthor.id, batch2SharedAuthor.id);

        for (const f of writtenFiles) {
            await unlink(f.path);
        }
        await instance.close();
    });

    it('Strips .json extension from filename option', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'export.json'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].name, 'export.json');
        assert.ok(!writtenFiles[0].name.includes('.json.json'));

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    it('Creates output directory if it does not exist', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const topDir = join(tmpdir(), `mg-context-mkdir-test-${Date.now()}`);
        const nestedDir = join(topDir, 'sub', 'dir');
        const writtenFiles = await instance.writeGhostJson(nestedDir);

        assert.equal(writtenFiles.length, 1);
        assert.ok(writtenFiles[0].path.startsWith(nestedDir));

        await rm(topDir, {recursive: true});
        await instance.close();
    });

    it('Can write Ghost JSON with empty context', async () => {
        const instance: any = new MigrateContext();
        await instance.init();

        const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'empty-test'});

        assert.equal(writtenFiles.length, 1);
        assert.equal(writtenFiles[0].posts, 0);
        assert.equal(writtenFiles[0].name, 'empty-test.json');
        const content = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));
        assert.deepEqual(Object.keys(content), ['meta', 'data']);
        assert.equal(content.data.posts.length, 0);

        await unlink(writtenFiles[0].path);
        await instance.close();
    });

    describe('Ghost JSON content formats', () => {
        it('Can export with HTML only', async () => {
            const instance: any = new MigrateContext({contentFormat: 'html'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'HTML Only Post');
            post.set('slug', 'html-only-post');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post.set('html', '<p>Hello world</p>');
            post.addAuthor({name: 'Test Author', slug: 'test-author', email: 'test@example.com'});
            await post.save(instance.db);

            const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'html-test'});
            const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, '<p>Hello world</p>');
            assert.equal(ghostJSON.data.posts[0].mobiledoc, null);
            assert.equal(ghostJSON.data.posts[0].lexical, null);

            await unlink(writtenFiles[0].path);
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

            const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'lexical-test'});
            const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, null);
            assert.ok(ghostJSON.data.posts[0].lexical);
            assert.equal(typeof ghostJSON.data.posts[0].lexical, 'string');
            assert.ok(JSON.parse(ghostJSON.data.posts[0].lexical).root);
            assert.equal(ghostJSON.data.posts[0].mobiledoc, null);

            await unlink(writtenFiles[0].path);
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

            const writtenFiles = await instance.writeGhostJson(tmpdir(), {filename: 'mobiledoc-test'});
            const ghostJSON = JSON.parse(await readFile(writtenFiles[0].path, 'utf-8'));

            assert.equal(ghostJSON.data.posts.length, 1);
            assert.equal(ghostJSON.data.posts[0].html, null);
            assert.ok(ghostJSON.data.posts[0].mobiledoc);
            assert.equal(typeof ghostJSON.data.posts[0].mobiledoc, 'string');
            assert.ok(JSON.parse(ghostJSON.data.posts[0].mobiledoc).version);
            assert.equal(ghostJSON.data.posts[0].lexical, null);

            await unlink(writtenFiles[0].path);
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

            const tag = new TagContext({name: 'No Slug Tag'});
            await tag.save(instance.db);
            assert.ok(tag.dbId);

            await instance.close();
        });

        it('Can save an author without a slug', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const author = new AuthorContext({name: 'No Slug Author'});
            await author.save(instance.db);
            assert.ok(author.dbId);

            await instance.close();
        });
    });

    describe('Post lookup_key deduplication', () => {
        it('Silently skips insert when lookup_key already exists', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'First Post');
            post1.set('slug', 'first-post');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post2.set('title', 'Duplicate Post');
            post2.set('slug', 'duplicate-post');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'First Post');
            assert.equal(post2.dbId, post1.dbId);

            await instance.close();
        });

        it('Posts without lookup_key always insert normally', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost();
            post1.set('title', 'Post A');
            post1.set('slug', 'post-a');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost();
            post2.set('title', 'Post B');
            post2.set('slug', 'post-b');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 2);

            await instance.close();
        });

        it('Different lookup_keys create separate posts', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/post-1'});
            post1.set('title', 'Post 1');
            post1.set('slug', 'post-1');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/post-2'});
            post2.set('title', 'Post 2');
            post2.set('slug', 'post-2');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 2);
            assert.notEqual(post1.dbId, post2.dbId);

            await instance.close();
        });

        it('Can get and set lookupKey and warnOnLookupKeyDuplicate on PostContext', () => {
            const post = new PostContext({lookupKey: 'https://example.com/initial'});
            assert.equal(post.lookupKey, 'https://example.com/initial');
            assert.equal(post.warnOnLookupKeyDuplicate, false);

            post.lookupKey = 'https://example.com/updated';
            assert.equal(post.lookupKey, 'https://example.com/updated');

            post.warnOnLookupKeyDuplicate = true;
            assert.equal(post.warnOnLookupKeyDuplicate, true);
        });

        it('lookup_key round-trips through save/load', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost({lookupKey: 'https://example.com/round-trip'});
            post.set('title', 'Round Trip Key');
            post.set('slug', 'round-trip-key');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            assert.equal(loaded[0].lookupKey, 'https://example.com/round-trip');

            await instance.close();
        });

        it('No warning logged when warnOnLookupKeyDuplicate is false', async () => {
            const warnMock = mock.method(console, 'warn', () => {});

            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/no-warn'});
            post1.set('title', 'First');
            post1.set('slug', 'first');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/no-warn'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            assert.equal(warnMock.mock.calls.length, 0);

            warnMock.mock.restore();
            await instance.close();
        });

        it('Warning logged when warnOnLookupKeyDuplicate is true', async () => {
            const warnMock = mock.method(console, 'warn', () => {});

            const instance: any = new MigrateContext({warnOnLookupKeyDuplicate: true});
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/warn-me'});
            post1.set('title', 'First');
            post1.set('slug', 'first');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/warn-me'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db);

            assert.equal(warnMock.mock.calls.length, 1);
            assert.ok((warnMock.mock.calls[0].arguments[0] as string).includes('https://example.com/warn-me'));

            warnMock.mock.restore();
            await instance.close();
        });

        it('Duplicate skip does not modify existing post tags/authors', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/tags-test'});
            post1.set('title', 'Original');
            post1.set('slug', 'original');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            post1.addTag({name: 'Original Tag', slug: 'original-tag'});
            post1.addAuthor({name: 'Original Author', slug: 'original-author', email: 'orig@example.com'});
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/tags-test'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            post2.addTag({name: 'New Tag', slug: 'new-tag'});
            post2.addAuthor({name: 'New Author', slug: 'new-author', email: 'new@example.com'});
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.tags.length, 1);
            assert.equal(allPosts[0].data.tags[0].data.slug, 'original-tag');
            assert.equal(allPosts[0].data.authors.length, 1);
            assert.equal(allPosts[0].data.authors[0].data.slug, 'original-author');

            await instance.close();
        });

        it('lookup_key persists on update', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost({lookupKey: 'https://example.com/update-key'});
            post.set('title', 'Before Update');
            post.set('slug', 'update-key');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            post.set('title', 'After Update');
            await post.save(instance.db);

            const loaded = await instance.getAllPosts();
            assert.equal(loaded.length, 1);
            assert.equal(loaded[0].data.title, 'After Update');
            assert.equal(loaded[0].lookupKey, 'https://example.com/update-key');

            await instance.close();
        });
    });

    describe('transaction', () => {
        it('Wraps operations in a single transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await instance.transaction(async () => {
                const post = await instance.addPost();
                post.set('title', 'Transaction Post');
                post.set('slug', 'txn-post');
                post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                post.addTag({name: 'Txn Tag', slug: 'txn-tag'});
                post.addAuthor({name: 'Txn Author', slug: 'txn-author', email: 'txn@example.com'});
                await post.save(instance.db);
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'Transaction Post');
            assert.equal(allPosts[0].data.tags.length, 1);
            assert.equal(allPosts[0].data.authors.length, 1);

            await instance.close();
        });

        it('Rolls back on error', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await assert.rejects(async () => {
                await instance.transaction(async () => {
                    const post = await instance.addPost();
                    post.set('title', 'Will Rollback');
                    post.set('slug', 'will-rollback');
                    post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
                    await post.save(instance.db);
                    throw new errors.InternalServerError({message: 'forced rollback'});
                });
            }, {message: 'forced rollback', name: 'InternalServerError'});

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 0);

            await instance.close();
        });

        it('withTransaction rolls back on sync error', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Before Rollback');
            post.set('slug', 'before-rollback');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            assert.throws(() => {
                withTransaction(instance.db, () => {
                    instance.db.stmts.updatePost.run(
                        JSON.stringify({title: 'Rolled Back', slug: 'before-rollback'}),
                        '{}', '{}', 'lexical', null, post.ghostId,
                        '2023-11-23T00:00:00.000Z', null, null,
                        post.dbId
                    );
                    throw new errors.InternalServerError({message: 'sync rollback'});
                });
            }, {message: 'sync rollback'});

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Before Rollback');

            await instance.close();
        });

        it('withTransaction is a no-op wrapper when already in a transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Nested TX');
            post.set('slug', 'nested-tx');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            // Outer transaction via ctx.transaction, inner via withTransaction
            await instance.transaction(async () => {
                withTransaction(instance.db, () => {
                    instance.db.stmts.updatePost.run(
                        JSON.stringify({title: 'Updated In Nested', slug: 'nested-tx'}),
                        '{}', '{}', 'lexical', null, post.ghostId,
                        '2023-11-23T00:00:00.000Z', null, null,
                        post.dbId
                    );
                });
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Updated In Nested');

            await instance.close();
        });
    });

    describe('nested transaction', () => {
        it('ctx.transaction() passes through when already in a transaction', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Outer TX');
            post.set('slug', 'outer-tx');
            post.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post.save(instance.db);

            await instance.transaction(async () => {
                // Nested transaction should not issue BEGIN
                await instance.transaction(async () => {
                    const posts = await instance.getAllPosts();
                    posts[0].set('title', 'Nested Update');
                    await posts[0].save(instance.db);
                });
            });

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts[0].data.title, 'Nested Update');

            await instance.close();
        });
    });

    describe('init guard', () => {
        it('Throws when init() is called twice without close()', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            await assert.rejects(
                () => instance.init(),
                {message: 'MigrateContext is already initialized. Call close() before reinitializing.'}
            );

            await instance.close();
        });
    });

    describe('Cache bypass paths', () => {
        it('Tag existing.update branch when slug exists in DB but not cache', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // Insert tag directly into DB, bypassing the cache
            instance.db.stmts.insertTag.run(
                JSON.stringify({name: 'Pre-existing', slug: 'pre-tag'}),
                'pre-tag', 'Pre-existing', null
            );

            // Save a TagContext with the same slug — should hit the existing.update branch
            const tag = new TagContext({name: 'Updated Pre-existing', slug: 'pre-tag'});
            await tag.save(instance.db);

            assert.ok(tag.dbId);
            const found = await instance.findTags({slug: 'pre-tag'});
            assert.equal(found!.length, 1);
            assert.equal(found![0].data.name, 'Updated Pre-existing');

            await instance.close();
        });

        it('Author existing.update branch when slug exists in DB but not cache', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            // Insert author directly into DB, bypassing the cache
            instance.db.stmts.insertAuthor.run(
                JSON.stringify({name: 'Pre-existing', slug: 'pre-author', email: 'pre@example.com'}),
                'pre-author', 'Pre-existing', 'pre@example.com', null
            );

            // Save an AuthorContext with the same slug — should hit the existing.update branch
            const author = new AuthorContext({name: 'Updated Pre-existing', slug: 'pre-author', email: 'pre@example.com'});
            await author.save(instance.db);

            assert.ok(author.dbId);
            const found = await instance.findAuthors({slug: 'pre-author'});
            assert.equal(found!.length, 1);
            assert.equal(found![0].data.name, 'Updated Pre-existing');

            await instance.close();
        });
    });

    describe('Duplicate skip guard', () => {
        it('Second save on a duplicate-skipped post is a no-op', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post1 = await instance.addPost({lookupKey: 'https://example.com/dup-guard'});
            post1.set('title', 'Original');
            post1.set('slug', 'original');
            post1.set('created_at', new Date('2023-11-23T12:00:00.000Z'));
            await post1.save(instance.db);

            const post2 = await instance.addPost({lookupKey: 'https://example.com/dup-guard'});
            post2.set('title', 'Duplicate');
            post2.set('slug', 'duplicate');
            post2.set('created_at', new Date('2023-11-24T12:00:00.000Z'));
            await post2.save(instance.db); // Sets duplicateSkipped = true

            // Call save again — should hit the #duplicateSkipped guard and return early
            await post2.save(instance.db);

            const allPosts = await instance.getAllPosts();
            assert.equal(allPosts.length, 1);
            assert.equal(allPosts[0].data.title, 'Original');

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

    describe('Conversion caching', () => {
        it('writeGhostJson caches converted content back to DB', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Cache Test');
            post.set('slug', 'cache-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');
            await post.save(instance.db);

            // Before write: no cached lexical
            const rowBefore = instance.db.stmts.findPostById.get(post.dbId) as any;
            assert.equal(JSON.parse(rowBefore.data).lexical, null);

            // Write JSON — converts and caches
            const dir = join(tmpdir(), `mg-cache-${Date.now()}`);
            await instance.writeGhostJson(dir);

            // After write: lexical cached in DB
            const rowAfter = instance.db.stmts.findPostById.get(post.dbId) as any;
            const stored = JSON.parse(rowAfter.data);
            assert.ok(stored.lexical, 'lexical should be cached after writeGhostJson');
            assert.ok(JSON.parse(stored.lexical).root);
            assert.equal(stored.html, '<p>Hello</p>', 'html should be preserved');

            await rm(dir, {recursive: true, force: true});
            await instance.close();
        });

        it('Second writeGhostJson skips conversion (uses cache)', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Skip Test');
            post.set('slug', 'skip-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Hello</p>');
            await post.save(instance.db);

            const dir = join(tmpdir(), `mg-skip-${Date.now()}`);

            // First write: converts
            await instance.writeGhostJson(dir);
            const file1 = JSON.parse(await readFile(join(dir, 'posts.json'), 'utf-8'));

            // Second write: uses cached content (same output)
            await instance.writeGhostJson(dir);
            const file2 = JSON.parse(await readFile(join(dir, 'posts.json'), 'utf-8'));

            assert.equal(file1.data.posts[0].lexical, file2.data.posts[0].lexical);

            await rm(dir, {recursive: true, force: true});
            await instance.close();
        });

        it('Cache is invalidated when HTML changes via forEachPost', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Invalidate Test');
            post.set('slug', 'invalidate-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Original</p>');
            await post.save(instance.db);

            const dir = join(tmpdir(), `mg-invalidate-${Date.now()}`);

            // First write: converts and caches
            await instance.writeGhostJson(dir);
            const row1 = instance.db.stmts.findPostById.get(post.dbId) as any;
            const lexical1 = JSON.parse(row1.data).lexical;
            assert.ok(lexical1);

            // Modify HTML → clears cached lexical
            await instance.forEachPost(async (p: PostContext) => {
                p.set('html', '<p>Updated</p>');
            });

            const rowAfterUpdate = instance.db.stmts.findPostById.get(post.dbId) as any;
            assert.equal(JSON.parse(rowAfterUpdate.data).lexical, null, 'lexical should be cleared after HTML change');

            // Second write: re-converts with new HTML
            await instance.writeGhostJson(dir);
            const row2 = instance.db.stmts.findPostById.get(post.dbId) as any;
            const lexical2 = JSON.parse(row2.data).lexical;
            assert.ok(lexical2);
            assert.notEqual(lexical1, lexical2);

            await rm(dir, {recursive: true, force: true});
            await instance.close();
        });

        it('set html invalidates cached conversion', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Invalidate Test');
            post.set('slug', 'invalidate-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Original</p>');
            post.convertContent();
            assert.ok(post.data.lexical);

            // Setting HTML should clear cached lexical
            post.set('html', '<p>New HTML</p>');
            assert.equal(post.data.lexical, null);
            assert.equal(post.htmlDirty, true);

            await instance.close();
        });

        it('Mobiledoc conversion is cached', async () => {
            const instance: any = new MigrateContext({contentFormat: 'mobiledoc'});
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Mobiledoc Test');
            post.set('slug', 'mobiledoc-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Mobiledoc</p>');
            await post.save(instance.db);

            const dir = join(tmpdir(), `mg-mobiledoc-cache-${Date.now()}`);
            await instance.writeGhostJson(dir);

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const stored = JSON.parse(row.data);
            assert.ok(stored.mobiledoc);
            assert.ok(JSON.parse(stored.mobiledoc).version);
            assert.equal(stored.lexical, null);

            await rm(dir, {recursive: true, force: true});
            await instance.close();
        });

        it('convertContent can be called manually', async () => {
            const instance: any = new MigrateContext();
            await instance.init();

            const post = await instance.addPost();
            post.set('title', 'Manual Test');
            post.set('slug', 'manual-test');
            post.set('created_at', new Date('2023-01-01T00:00:00.000Z'));
            post.set('html', '<p>Manual</p>');

            post.convertContent();
            assert.ok(post.data.lexical);
            assert.equal(post.htmlDirty, false);

            await post.save(instance.db);

            const row = instance.db.stmts.findPostById.get(post.dbId) as any;
            const stored = JSON.parse(row.data);
            assert.ok(stored.lexical);

            await instance.close();
        });
    });

    describe('PostFilter', () => {
        let ctx: any;

        // 5 posts:
        // A: tag=news, author=alice, created=2023-01-15, published=2023-02-01
        // B: tag=news, author=bob,   created=2023-03-15, published=2023-04-01
        // C: tag=tech, author=alice,  created=2023-06-15, published=2023-07-01
        // D: tag=tech, author=bob,    created=2023-09-15, published=null (draft)
        // E: no tag,   author=alice,  created=2023-12-15, published=2023-12-20

        before(async () => {
            ctx = new MigrateContext();
            await ctx.init();

            const postA = await ctx.addPost();
            postA.set('title', 'Post A');
            postA.set('slug', 'post-a');
            postA.set('created_at', new Date('2023-01-15T00:00:00.000Z'));
            postA.set('published_at', new Date('2023-02-01T00:00:00.000Z'));
            postA.set('status', 'published');
            postA.addTag({name: 'News', slug: 'news'});
            postA.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postA.save(ctx.db);

            const postB = await ctx.addPost();
            postB.set('title', 'Post B');
            postB.set('slug', 'post-b');
            postB.set('created_at', new Date('2023-03-15T00:00:00.000Z'));
            postB.set('published_at', new Date('2023-04-01T00:00:00.000Z'));
            postB.set('status', 'published');
            postB.addTag({name: 'News', slug: 'news'});
            postB.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await postB.save(ctx.db);

            const postC = await ctx.addPost();
            postC.set('title', 'Post C');
            postC.set('slug', 'post-c');
            postC.set('created_at', new Date('2023-06-15T00:00:00.000Z'));
            postC.set('published_at', new Date('2023-07-01T00:00:00.000Z'));
            postC.set('status', 'published');
            postC.addTag({name: 'Tech', slug: 'tech'});
            postC.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postC.save(ctx.db);

            const postD = await ctx.addPost();
            postD.set('title', 'Post D');
            postD.set('slug', 'post-d');
            postD.set('created_at', new Date('2023-09-15T00:00:00.000Z'));
            postD.addTag({name: 'Tech', slug: 'tech'});
            postD.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await postD.save(ctx.db);

            const postE = await ctx.addPost();
            postE.set('title', 'Post E');
            postE.set('slug', 'post-e');
            postE.set('created_at', new Date('2023-12-15T00:00:00.000Z'));
            postE.set('published_at', new Date('2023-12-20T00:00:00.000Z'));
            postE.set('status', 'published');
            postE.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            await postE.save(ctx.db);
        });

        after(async () => {
            await ctx.close();
        });

        async function collectTitles(filter: PostFilter): Promise<string[]> {
            const titles: string[] = [];
            await ctx.forEachPost(async (post: PostContext) => {
                titles.push(post.data.title);
            }, {filter});
            return titles;
        }

        describe('forEachPost', () => {
            it('No filter returns all 5 posts', async () => {
                const titles = await collectTitles({});
                assert.equal(titles.length, 5);
            });

            it('Tag slug filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}});
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Author slug filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}, author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('Author slug filter alone returns matching posts', async () => {
                const titles = await collectTitles({author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A', 'Post C', 'Post E']);
            });

            it('createdAt after filter', async () => {
                const titles = await collectTitles({createdAt: {after: new Date('2023-06-01T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post C', 'Post D', 'Post E']);
            });

            it('createdAt before filter (strict)', async () => {
                const titles = await collectTitles({createdAt: {before: new Date('2023-03-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('createdAt onOrBefore filter (inclusive)', async () => {
                const titles = await collectTitles({createdAt: {onOrBefore: new Date('2023-03-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('createdAt onOrAfter filter (inclusive)', async () => {
                const titles = await collectTitles({createdAt: {onOrAfter: new Date('2023-06-15T00:00:00.000Z')}});
                assert.deepEqual(titles, ['Post C', 'Post D', 'Post E']);
            });

            it('publishedAt range excludes drafts', async () => {
                const titles = await collectTitles({
                    publishedAt: {
                        after: new Date('2023-01-01T00:00:00.000Z'),
                        before: new Date('2023-05-01T00:00:00.000Z')
                    }
                });
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Combined tag + date filter', async () => {
                const titles = await collectTitles({
                    tag: {slug: 'news'},
                    createdAt: {after: new Date('2023-02-01T00:00:00.000Z')}
                });
                assert.deepEqual(titles, ['Post B']);
            });

            it('Combined tag + author filter', async () => {
                const titles = await collectTitles({tag: {slug: 'news'}, author: {slug: 'alice'}});
                assert.deepEqual(titles, ['Post A']);
            });

            it('Tag name filter returns matching posts', async () => {
                const titles = await collectTitles({tag: {name: 'Tech'}});
                assert.deepEqual(titles, ['Post C', 'Post D']);
            });

            it('Author name filter returns matching posts', async () => {
                const titles = await collectTitles({author: {name: 'Bob'}});
                assert.deepEqual(titles, ['Post B', 'Post D']);
            });

            it('Author email filter returns matching posts', async () => {
                const titles = await collectTitles({author: {email: 'bob@example.com'}});
                assert.deepEqual(titles, ['Post B', 'Post D']);
            });

            it('publishedAt after excludes earlier posts', async () => {
                const titles = await collectTitles({
                    publishedAt: {after: new Date('2023-06-01T00:00:00.000Z')}
                });
                // A (Feb), B (Apr) excluded by after; D excluded by null; C (Jul) and E (Dec) pass
                assert.deepEqual(titles, ['Post C', 'Post E']);
            });

            it('publishedAt onOrAfter includes boundary', async () => {
                const titles = await collectTitles({
                    publishedAt: {onOrAfter: new Date('2023-07-01T00:00:00.000Z')}
                });
                // C (Jul 01) included at boundary; D excluded by null; E (Dec 20) included
                assert.deepEqual(titles, ['Post C', 'Post E']);
            });

            it('publishedAt onOrBefore includes boundary', async () => {
                const titles = await collectTitles({
                    publishedAt: {onOrBefore: new Date('2023-04-01T00:00:00.000Z')}
                });
                // A (Feb 01), B (Apr 01) included; D excluded by null
                assert.deepEqual(titles, ['Post A', 'Post B']);
            });

            it('Non-matching filter returns 0 posts', async () => {
                const titles = await collectTitles({tag: {slug: 'nonexistent'}});
                assert.equal(titles.length, 0);
            });

            it('Progress reports correct filtered total', async () => {
                const progressCalls: [number, number][] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachPost(async (_post: PostContext) => {}, {
                    filter: {tag: {slug: 'news'}},
                    progress(processed: number, total: number) {
                        progressCalls.push([processed, total]);
                    }
                });
                assert.ok(progressCalls.length > 0);
                const lastCall = progressCalls[progressCalls.length - 1];
                assert.equal(lastCall[0], 2);
                assert.equal(lastCall[1], 2);
            });
        });

        describe('forEachGhostPost', () => {
            it('Tag filter works read-only', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(async (json: any, _post: PostContext) => {
                    titles.push(json.title);
                }, {filter: {tag: {slug: 'tech'}}});
                assert.deepEqual(titles, ['Post C', 'Post D']);
            });

            it('Tag filter with progress reports correct total', async () => {
                const progressCalls: [number, number][] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(async (_json: any, _post: PostContext) => {}, {
                    filter: {tag: {slug: 'news'}},
                    progress(processed: number, total: number) {
                        progressCalls.push([processed, total]);
                    }
                });
                assert.ok(progressCalls.length > 0);
                const lastCall = progressCalls[progressCalls.length - 1];
                assert.equal(lastCall[0], 2);
                assert.equal(lastCall[1], 2);
            });

            it('Date-only filter works without tag/author', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(async (json: any, _post: PostContext) => {
                    titles.push(json.title);
                }, {filter: {createdAt: {after: new Date('2023-09-01T00:00:00.000Z')}}});
                assert.deepEqual(titles, ['Post D', 'Post E']);
            });

            it('Tag + date filter skips date-excluded posts', async () => {
                const titles: string[] = [];
                // eslint-disable-next-line no-unused-vars
                await ctx.forEachGhostPost(async (json: any, _post: PostContext) => {
                    titles.push(json.title);
                }, {filter: {tag: {slug: 'tech'}, createdAt: {after: new Date('2023-08-01T00:00:00.000Z')}}});
                assert.deepEqual(titles, ['Post D']);
            });
        });

        describe('writeGhostJson', () => {
            it('Tag filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-write-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'news'}}});
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 2);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                const postTitles = content.data.posts.map((p: any) => p.title);
                assert.deepEqual(postTitles, ['Post A', 'Post B']);

                await rm(dir, {recursive: true, force: true});
            });

            it('onWrite callback fires for each file', async () => {
                const dir = join(tmpdir(), `mg-filter-onwrite-${Date.now()}`);
                const written: any[] = [];
                const files = await ctx.writeGhostJson(dir, {
                    filter: {tag: {slug: 'news'}},
                    batchSize: 1,
                    onWrite(f: any) {
                        written.push(f);
                    }
                });
                assert.equal(written.length, 2);
                assert.deepEqual(written, files);

                await rm(dir, {recursive: true, force: true});
            });

            it('Batched output with filter produces correct file count', async () => {
                const dir = join(tmpdir(), `mg-filter-batch-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'news'}}, batchSize: 1});
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 1);
                assert.equal(files[1].posts, 1);

                await rm(dir, {recursive: true, force: true});
            });

            it('Tag + date filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-tagdate-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {tag: {slug: 'news'}, createdAt: {after: new Date('2023-02-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                assert.equal(content.data.posts[0].title, 'Post B');

                await rm(dir, {recursive: true, force: true});
            });

            it('Date-only filter outputs only matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-dateonly-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {createdAt: {onOrBefore: new Date('2023-03-15T00:00:00.000Z')}}
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 1);
                assert.equal(files[1].posts, 1);

                await rm(dir, {recursive: true, force: true});
            });

            it('Empty result produces single empty JSON file', async () => {
                const dir = join(tmpdir(), `mg-filter-empty-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {filter: {tag: {slug: 'nonexistent'}}});
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 0);

                const content = JSON.parse(await readFile(files[0].path, 'utf-8'));
                assert.equal(content.data.posts.length, 0);

                await rm(dir, {recursive: true, force: true});
            });

            it('Uneven batch remainder gets numbered filename (tag filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-remainder-tag-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 2,
                    filter: {author: {slug: 'alice'}} // 3 matches: A, C, E
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 2);
                assert.equal(files[1].posts, 1);
                assert.ok(files[1].name.includes('-2'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Uneven batch remainder gets numbered filename (date filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-remainder-date-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 3,
                    filter: {createdAt: {onOrBefore: new Date('2023-09-15T00:00:00.000Z')}} // 4 matches: A, B, C, D
                });
                assert.equal(files.length, 2);
                assert.equal(files[0].posts, 3);
                assert.equal(files[1].posts, 1);
                assert.ok(files[1].name.includes('-2'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Single match with batchSize 1 produces single file (tag filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-single-tag-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {tag: {slug: 'news'}, author: {slug: 'alice'}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);
                assert.ok(!files[0].name.includes('-1'));

                await rm(dir, {recursive: true, force: true});
            });

            it('Single match with batchSize 1 produces single file (date filter)', async () => {
                const dir = join(tmpdir(), `mg-filter-single-date-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    batchSize: 1,
                    filter: {createdAt: {after: new Date('2023-12-14T00:00:00.000Z'), before: new Date('2023-12-16T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 1);
                assert.ok(!files[0].name.includes('-1'));

                await rm(dir, {recursive: true, force: true});
            });

            it('publishedAt-only filter outputs matching posts', async () => {
                const dir = join(tmpdir(), `mg-filter-pubonly-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {publishedAt: {after: new Date('2023-06-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 2); // C (Jul) and E (Dec), D excluded (null)

                await rm(dir, {recursive: true, force: true});
            });

            it('Date-only filter with no matches produces single empty JSON file', async () => {
                const dir = join(tmpdir(), `mg-filter-dateempty-${Date.now()}`);
                const files = await ctx.writeGhostJson(dir, {
                    filter: {createdAt: {after: new Date('2099-01-01T00:00:00.000Z')}}
                });
                assert.equal(files.length, 1);
                assert.equal(files[0].posts, 0);

                await rm(dir, {recursive: true, force: true});
            });
        });
    });

    describe('writeGhostTagsJson', () => {
        it('Writes all tags to a single JSON file', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Alpha', slug: 'alpha'});
            post.addTag({name: 'Beta', slug: 'beta'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-json-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            assert.equal(file.name, 'tags.json');
            assert.equal(file.posts, 0);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.tags.length, 2);
            assert.equal(content.data.tags[0].name, 'Alpha');
            assert.equal(content.data.tags[1].name, 'Beta');
            assert.ok(content.data.tags[0].id);
            assert.ok(content.meta.exported_on);
            assert.ok(!content.data.posts);
            assert.ok(!content.data.posts_tags);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Supports custom filename', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Gamma', slug: 'gamma'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-custom-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir, {filename: 'my-tags'});

            assert.equal(file.name, 'my-tags.json');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Writes empty tags array when no tags exist', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const dir = join(tmpdir(), `mg-tags-empty-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.deepEqual(content.data.tags, []);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Excludes orphan tags not assigned to any post', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addTag({name: 'Used', slug: 'used'});
            post.addTag({name: 'Orphan', slug: 'orphan'});
            await post.save(ctx.db);

            // Remove one tag so it becomes orphaned in the Tags table
            post.removeTag('orphan');
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-tags-orphan-${Date.now()}`);
            const file = await ctx.writeGhostTagsJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.tags.length, 1);
            assert.equal(content.data.tags[0].name, 'Used');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });
    });

    describe('writeGhostUsersJson', () => {
        it('Writes all users to a single JSON file', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
            post.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-json-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            assert.equal(file.name, 'users.json');
            assert.equal(file.posts, 0);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.users.length, 2);
            assert.equal(content.data.users[0].name, 'Alice');
            assert.equal(content.data.users[1].name, 'Bob');
            assert.ok(content.data.users[0].id);
            assert.ok(content.meta.exported_on);
            assert.ok(!content.data.posts);
            assert.ok(!content.data.posts_authors);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Supports custom filename', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Carol', slug: 'carol', email: 'carol@example.com'});
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-custom-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir, {filename: 'my-users'});

            assert.equal(file.name, 'my-users.json');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Writes empty users array when no authors exist', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const dir = join(tmpdir(), `mg-users-empty-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.deepEqual(content.data.users, []);

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });

        it('Excludes orphan authors not assigned to any post', async () => {
            const ctx: any = new MigrateContext();
            await ctx.init();

            const post = await ctx.addPost();
            post.set('title', 'Test');
            post.set('slug', 'test');
            post.addAuthor({name: 'Used', slug: 'used', email: 'used@example.com'});
            post.addAuthor({name: 'Orphan', slug: 'orphan', email: 'orphan@example.com'});
            await post.save(ctx.db);

            // Remove one author so it becomes orphaned in the Authors table
            post.removeAuthor('orphan');
            await post.save(ctx.db);

            const dir = join(tmpdir(), `mg-users-orphan-${Date.now()}`);
            const file = await ctx.writeGhostUsersJson(dir);

            const content = JSON.parse(await readFile(file.path, 'utf-8'));
            assert.equal(content.data.users.length, 1);
            assert.equal(content.data.users[0].name, 'Used');

            await rm(dir, {recursive: true, force: true});
            await ctx.close();
        });
    });
});
