import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mapPost, mapPostsTasks} from '../lib/mapper.js';

describe('beehiiv API Mapper', () => {
    describe('mapPost', () => {
        const createMockPostData = (overrides = {}): any => ({
            id: 'post-123',
            title: 'Test Post Title',
            subtitle: 'Test subtitle',
            slug: 'test-post-title',
            web_url: 'https://example.beehiiv.com/p/test-post-title',
            status: 'confirmed',
            audience: 'free',
            publish_date: 1700000000, // Unix timestamp
            created: 1699900000,
            thumbnail_url: 'https://example.com/image.jpg',
            meta_default_title: 'OG Title',
            meta_default_description: 'OG Description',
            authors: ['John Doe', 'Jane Smith'],
            content_tags: ['Tech', 'News'],
            content: {
                premium: {
                    web: '<div id="content-blocks"><p>Test content</p></div>'
                }
            },
            ...overrides
        });

        it('maps basic post fields correctly', () => {
            const postData = createMockPostData();
            const result = mapPost({postData});

            assert.equal(result.url, 'https://example.beehiiv.com/p/test-post-title');
            assert.equal(result.data.comment_id, 'post-123');
            assert.equal(result.data.slug, 'test-post-title');
            assert.equal(result.data.title, 'Test Post Title');
            assert.equal(result.data.type, 'post');
            assert.equal(result.data.custom_excerpt, 'Test subtitle');
        });

        it('converts timestamps to Date objects', () => {
            const postData = createMockPostData();
            const result = mapPost({postData});

            assert.ok(result.data.published_at instanceof Date);
            assert.ok(result.data.updated_at instanceof Date);
            assert.ok(result.data.created_at instanceof Date);

            // Check the dates are converted correctly (Unix timestamp * 1000)
            assert.equal(result.data.published_at.getTime(), 1700000000 * 1000);
            assert.equal(result.data.created_at.getTime(), 1699900000 * 1000);
        });

        it('sets status to published for confirmed posts', () => {
            const postData = createMockPostData({status: 'confirmed'});
            const result = mapPost({postData});
            assert.equal(result.data.status, 'published');
        });

        it('sets status to draft for non-confirmed posts', () => {
            const postData = createMockPostData({status: 'draft'});
            const result = mapPost({postData});
            assert.equal(result.data.status, 'draft');
        });

        it('sets visibility to paid for premium audience', () => {
            const postData = createMockPostData({audience: 'premium'});
            const result = mapPost({postData});
            assert.equal(result.data.visibility, 'paid');
        });

        it('sets visibility to public for free audience', () => {
            const postData = createMockPostData({audience: 'free'});
            const result = mapPost({postData});
            assert.equal(result.data.visibility, 'public');
        });

        it('sets feature_image when thumbnail_url exists', () => {
            const postData = createMockPostData({thumbnail_url: 'https://example.com/thumb.jpg'});
            const result = mapPost({postData});
            assert.equal(result.data.feature_image, 'https://example.com/thumb.jpg');
        });

        it('does not set feature_image when thumbnail_url is empty', () => {
            const postData = createMockPostData({thumbnail_url: ''});
            const result = mapPost({postData});
            assert.equal(result.data.feature_image, undefined);
        });

        it('sets og_title when meta_default_title exists', () => {
            const postData = createMockPostData({meta_default_title: 'Custom OG Title'});
            const result = mapPost({postData});
            assert.equal(result.data.og_title, 'Custom OG Title');
        });

        it('does not set og_title when meta_default_title is falsy', () => {
            const postData = createMockPostData({meta_default_title: null});
            const result = mapPost({postData});
            assert.equal(result.data.og_title, undefined);
        });

        it('sets og_description when meta_default_description exists', () => {
            const postData = createMockPostData({meta_default_description: 'Custom OG Desc'});
            const result = mapPost({postData});
            assert.equal(result.data.og_description, 'Custom OG Desc');
        });

        it('does not set og_description when meta_default_description is falsy', () => {
            const postData = createMockPostData({meta_default_description: null});
            const result = mapPost({postData});
            assert.equal(result.data.og_description, undefined);
        });

        it('maps authors correctly', () => {
            const postData = createMockPostData({authors: ['John Doe', 'Jane Smith']});
            const result = mapPost({postData});

            assert.equal(result.data.authors.length, 2);

            assert.equal(result.data.authors[0].data.name, 'John Doe');
            assert.equal(result.data.authors[0].data.slug, 'john-doe');
            assert.equal(result.data.authors[0].data.email, 'john-doe@example.com');
            assert.ok(result.data.authors[0].url.includes('john-doe'));

            assert.equal(result.data.authors[1].data.name, 'Jane Smith');
            assert.equal(result.data.authors[1].data.slug, 'jane-smith');
        });

        it('maps content_tags correctly', () => {
            const postData = createMockPostData({content_tags: ['Tech', 'News']});
            const result = mapPost({postData});

            // Should have 3 tags: 2 content tags + 1 beehiiv source tag
            assert.equal(result.data.tags.length, 3);

            assert.equal(result.data.tags[0].data.name, 'Tech');
            assert.equal(result.data.tags[0].data.slug, 'tech');

            assert.equal(result.data.tags[1].data.name, 'News');
            assert.equal(result.data.tags[1].data.slug, 'news');
        });

        it('always adds #beehiiv source tag', () => {
            const postData = createMockPostData({content_tags: []});
            const result = mapPost({postData});

            const beehiivTag = result.data.tags.find((t: any) => t.data.slug === 'hash-beehiiv');
            assert.ok(beehiivTag);
            assert.equal(beehiivTag.data.name, '#beehiiv');
        });

        it('handles null subtitle', () => {
            const postData = createMockPostData({subtitle: null});
            const result = mapPost({postData});
            assert.equal(result.data.custom_excerpt, null);
        });

        it('processes HTML through processHTML', () => {
            const postData = createMockPostData({
                content: {
                    premium: {
                        web: '<div id="content-blocks"><p>Processed content</p></div>'
                    }
                }
            });
            const result = mapPost({postData});
            assert.ok(result.data.html.includes('Processed content'));
        });
    });

    describe('mapPostsTasks', () => {
        it('creates tasks for each post', async () => {
            const ctx = {
                result: {
                    posts: [
                        {
                            id: 'post-1',
                            title: 'Post 1',
                            subtitle: null,
                            slug: 'post-1',
                            web_url: 'https://example.com/p/post-1',
                            status: 'confirmed',
                            audience: 'free',
                            publish_date: 1700000000,
                            created: 1699900000,
                            thumbnail_url: '',
                            meta_default_title: null,
                            meta_default_description: null,
                            authors: ['Author'],
                            content_tags: [],
                            content: {premium: {web: '<div id="content-blocks"><p>Content 1</p></div>'}}
                        },
                        {
                            id: 'post-2',
                            title: 'Post 2',
                            subtitle: null,
                            slug: 'post-2',
                            web_url: 'https://example.com/p/post-2',
                            status: 'confirmed',
                            audience: 'free',
                            publish_date: 1700000000,
                            created: 1699900000,
                            thumbnail_url: '',
                            meta_default_title: null,
                            meta_default_description: null,
                            authors: ['Author'],
                            content_tags: [],
                            content: {premium: {web: '<div id="content-blocks"><p>Content 2</p></div>'}}
                        }
                    ]
                }
            };

            const tasks = await mapPostsTasks({}, ctx);

            assert.equal(tasks.length, 2);
            assert.equal(tasks[0].title, 'Mapping post: Post 1');
            assert.equal(tasks[1].title, 'Mapping post: Post 2');
        });

        it('task maps post and updates context', async () => {
            const ctx = {
                result: {
                    posts: [
                        {
                            id: 'post-1',
                            title: 'Post 1',
                            subtitle: 'Subtitle',
                            slug: 'post-1',
                            web_url: 'https://example.com/p/post-1',
                            status: 'confirmed',
                            audience: 'free',
                            publish_date: 1700000000,
                            created: 1699900000,
                            thumbnail_url: '',
                            meta_default_title: null,
                            meta_default_description: null,
                            authors: ['Author'],
                            content_tags: ['Tag1'],
                            content: {premium: {web: '<div id="content-blocks"><p>Content</p></div>'}}
                        }
                    ]
                }
            };

            const tasks = await mapPostsTasks({}, ctx);

            // Execute the task
            await tasks[0].task({}, {output: ''});

            // Check that the post was mapped
            const mappedPost = ctx.result.posts[0] as any;
            assert.equal(mappedPost.url, 'https://example.com/p/post-1');
            assert.ok(mappedPost.data);
            assert.equal(mappedPost.data.title, 'Post 1');
        });

        it('task throws error on mapping failure', async () => {
            const ctx = {
                result: {
                    posts: [
                        {
                            // Missing required fields to cause an error
                            id: 'post-1',
                            title: 'Post 1'
                        }
                    ]
                }
            };

            const tasks = await mapPostsTasks({}, ctx);
            const mockTask = {output: ''};

            await assert.rejects(async () => {
                await tasks[0].task({}, mockTask);
            });
        });
    });
});
