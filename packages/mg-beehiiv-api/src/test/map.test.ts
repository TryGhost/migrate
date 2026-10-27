import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {ghostId, map} from '../index.js';
import type {BeehiivApiOptions} from '../index.js';
import {PUB, SITE, apiPost, events, memoryContext, stored, webTarget} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);

/** Run `test` against a fresh context holding `posts`. */
async function withPosts(posts: Record<string, any>[], test: (context: MigrateContext) => Promise<void>) {
    const context = await stored(posts);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

/** Map one post with these values and options. */
async function mappedPost(values: Record<string, any> = {}, options: BeehiivApiOptions = {}): Promise<PostContext> {
    let post: PostContext;
    await withPosts([apiPost('post_1', values)], async context => {
        await map(options, context);
        [post] = await context.getAllPosts();
    });
    return post!;
}

describe('Mapping beehiiv API posts', () => {
    it('maps post fields, authors, tags and links', async () => {
        await withPosts(
            [
                apiPost('post_1', {
                    thumbnail_url: 'https://example.com/image.jpg',
                    meta_default_title: 'OG Title',
                    meta_default_description: 'OG Description',
                    authors: ['John Doe', 'Jane Smith', ' '],
                    content_tags: ['Tech', 'News', '']
                }),
                apiPost('post_2', {authors: ['John Doe'], content_tags: ['News']})
            ],
            async context => {
                const summary = await map({}, context);
                assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
                const [post, second] = await context.getAllPosts();
                assert.equal(post.lookupKey, 'post_1');
                assert.equal(post.ghostId, ghostId(PUB, 'post', 'post_1'));
                assert.equal(post.get('comment_id'), 'post_1');
                assert.equal(post.get('slug'), 'post_1');
                assert.equal(post.get('title'), 'Title post_1');
                assert.equal(post.get('type'), 'post');
                assert.equal(post.get('status'), 'published');
                assert.equal(post.get('visibility'), 'public');
                assert.equal(post.get('custom_excerpt'), 'Subtitle post_1');
                assert.equal(post.get('feature_image'), 'https://example.com/image.jpg');
                assert.equal(post.get('og_title'), 'OG Title');
                assert.equal(post.get('og_description'), 'OG Description');
                assert.equal(post.get('html'), '<p>Body post_1</p>');
                assert.equal(post.get('published_at').getTime(), 1700000000 * 1000);
                assert.equal(post.get('updated_at').getTime(), 1700000000 * 1000);
                assert.equal(post.get('created_at').getTime(), 1699900000 * 1000);
                assert.deepEqual(
                    post.data.authors.map((author: any) => [author.data.name, author.data.slug, author.data.email]),
                    [
                        ['John Doe', 'john-doe', 'john-doe@example.com'],
                        ['Jane Smith', 'jane-smith', 'jane-smith@example.com']
                    ]
                );
                assert.equal(post.data.authors[0].ghostId, ghostId(PUB, 'author', 'slug:john-doe'));
                assert.deepEqual(names(post.data.tags), ['Tech', 'News', '#beehiiv']);
                assert.equal(post.data.tags[0].ghostId, ghostId(PUB, 'tag', 'slug:tech'));
                // Authors and tags are shared between posts.
                assert.equal(second.data.authors[0].dbId, post.data.authors[0].dbId);
                assert.equal((context.db.stmts.countUsedAuthors.get() as any).count, 2);
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/post_1`)), '/post_1/');
            }
        );
    });

    it('maps platform and status to Ghost status', async () => {
        await withPosts(
            [
                apiPost('both', {platform: 'both', status: 'confirmed'}),
                apiPost('web', {platform: 'web', status: 'confirmed'}),
                apiPost('draft', {platform: 'web', status: 'draft'}),
                apiPost('email', {platform: 'email', status: 'confirmed'})
            ],
            async context => {
                await map({}, context);
                assert.deepEqual(
                    (await context.getAllPosts()).map(post => post.get('status')),
                    ['published', 'published', 'draft', 'draft']
                );
            }
        );
    });

    it('maps web targets to visibility', async () => {
        await withPosts(
            [
                apiPost('free', {audience: 'premium', web_targets: [webTarget('free')]}),
                apiPost('premium', {audience: 'free', web_targets: [webTarget('premium')]}),
                apiPost('both', {web_targets: [webTarget('free'), webTarget('premium')]}),
                apiPost('none', {web_targets: undefined})
            ],
            async context => {
                await map({}, context);
                assert.deepEqual(
                    (await context.getAllPosts()).map(post => post.get('visibility')),
                    ['public', 'paid', 'members', 'public']
                );
            }
        );
    });

    it('leaves optional fields empty when beehiiv has none', async () => {
        const post = await mappedPost({
            subtitle: null,
            thumbnail_url: '',
            meta_default_title: null,
            meta_default_description: null,
            authors: undefined,
            content_tags: undefined
        });
        assert.equal(post.get('custom_excerpt'), null);
        assert.equal(post.get('feature_image'), null);
        assert.equal(post.get('og_title'), null);
        assert.equal(post.get('og_description'), null);
        assert.deepEqual(post.data.authors, []);
        assert.deepEqual(names(post.data.tags), ['#beehiiv']);
    });

    it('adds --addTag before the internal #beehiiv tag', async () => {
        const post = await mappedPost({content_tags: ['News']}, {addTag: ' From beehiiv '});
        assert.deepEqual(names(post.data.tags), ['News', 'From beehiiv', '#beehiiv']);
        assert.equal(post.data.tags[1].data.slug, 'from-beehiiv');
    });

    it('converts the web HTML with the content options and removes a duplicate feature image', async () => {
        const thumbnail = 'https://media.beehiiv.com/uploads/asset/file/1/image.png';
        const html = `<div id="content-blocks"><div><img src="https://cdn.example.com/uploads/asset/file/1/image.png"></div><p><a href="${SITE}/subscribe">Join</a> <a href="${SITE}/p/post_1?comments=true">Comment</a></p></div>`;
        let post = await mappedPost(
            {thumbnail_url: thumbnail, content: {premium: {web: html}}},
            {subscribeLink: '/join', comments: true, commentLink: '#comments'}
        );
        assert.equal(post.get('html'), '<p><a href="/join">Join</a> <a href="#comments">Comment</a></p>');
        post = await mappedPost({content: {premium: {web: html}}}, {comments: false});
        assert.match(post.get('html'), /^<figure class="kg-card kg-image-card">/);
        assert.match(post.get('html'), /<p><a href="https:\/\/example.beehiiv.com\/subscribe">Join<\/a> <\/p>$/);
    });

    it('uses the free web content when there is no premium content, and no content otherwise', async () => {
        let post = await mappedPost({content: {free: {web: '<div id="content-blocks"><p>Free</p></div>'}}});
        assert.equal(post.get('html'), '<p>Free</p>');
        post = await mappedPost({content: undefined});
        assert.equal(post.get('html'), '');
    });

    it('falls back to the title and ID for slugs', async () => {
        await withPosts(
            [apiPost('post_1', {slug: '', title: 'A Title'}), apiPost('post_2', {slug: '', title: undefined})],
            async context => {
                await map({}, context);
                assert.deepEqual(
                    (await context.getAllPosts()).map(post => post.get('slug')),
                    ['a-title', 'post_2']
                );
            }
        );
    });

    it('dates unpublished posts when they were created, and skips posts without dates or IDs', async () => {
        await withPosts(
            [
                apiPost('unpublished', {publish_date: null}),
                apiPost('uncreated', {created: null}),
                apiPost('undated', {publish_date: null, created: null}),
                {...apiPost(''), id: undefined, web_url: 'not a url'}
            ],
            async context => {
                const summary = await map({}, context);
                assert.deepEqual(summary, {selected: 4, imported: 2, skipped: 2});
                const [unpublished, uncreated] = await context.getAllPosts();
                assert.equal(unpublished.get('published_at').getTime(), 1699900000 * 1000);
                assert.equal(unpublished.get('updated_at').getTime(), 1699900000 * 1000);
                assert.equal(uncreated.get('created_at').getTime(), 1700000000 * 1000);
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    ['Invalid beehiiv post dates', 'Post has no ID']
                );
            }
        );
    });

    it('skips posts over Ghost’s relationship limits', async () => {
        const many = Array.from({length: 501}, (_, index) => `Name ${index}`);
        await withPosts([apiPost('authors', {authors: many}), apiPost('tags', {content_tags: many})], async context => {
            assert.deepEqual(await map({}, context), {selected: 2, imported: 0, skipped: 2});
            assert.equal(
                events(context, 'record:skipped')[0].details.reason,
                'Post exceeds Ghost author/tag relationship limits'
            );
        });
    });

    it('filters by publish date at map time', async () => {
        const day = 86400;
        await withPosts(
            [
                apiPost('before', {publish_date: Date.parse('2024-01-01') / 1000 - 1}),
                apiPost('first', {publish_date: Date.parse('2024-01-01') / 1000}),
                apiPost('last', {publish_date: Date.parse('2024-01-31') / 1000}),
                apiPost('after', {publish_date: Date.parse('2024-01-31') / 1000 + day}),
                apiPost('unpublished', {publish_date: null})
            ],
            async context => {
                const slugs = async (options: BeehiivApiOptions) => {
                    await map(options, context);
                    return (await context.getAllPosts()).map(post => post.get('slug'));
                };
                assert.deepEqual(await slugs({postsAfter: '2024-01-01', postsBefore: '2024-01-31'}), ['first', 'last']);
                assert.deepEqual(await slugs({postsAfter: '2024-01-01'}), ['first', 'last', 'after']);
                assert.deepEqual(await slugs({postsBefore: '2024-01-31'}), ['before', 'first', 'last', 'unpublished']);
                assert.equal((await slugs({})).length, 5);
                await assert.rejects(map({postsAfter: 'soon'}, context), /Invalid postsAfter date: soon/);
            }
        );
    });

    it('matches authors to Ghost users by email', async () => {
        await withPosts([apiPost('post_1')], async context => {
            await map({}, context, {
                ghostUsers: [
                    {id: '0123456789abcdef01234567', slug: 'jane', name: 'Jane', email: 'jane-doe@example.com'} as any
                ]
            });
            const [post] = await context.getAllPosts();
            assert.equal(post.data.authors[0].ghostId, '0123456789abcdef01234567');
            assert.equal(post.data.authors[0].data.slug, 'jane');
        });
    });

    it('needs completed source data', async () => {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest complete beehiiv API source data/);
        } finally {
            await context.close();
        }
    });
});
