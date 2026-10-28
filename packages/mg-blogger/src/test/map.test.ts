import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {ghostId, map} from '../index.js';
import type {BloggerOptions, BloggerPost} from '../index.js';
import {BLOG, OTHER, apiPost, events, fixture, memoryContext, stored} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);
const slugs = (items: any[]) => items.map(item => item.data.slug);

/** Run `test` against a fresh context holding each blog's posts. */
async function withBlogs(blogs: Record<string, BloggerPost[]>, test: (context: MigrateContext) => Promise<void>) {
    const context = await stored(blogs);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

/** Map one post with these values and options. */
async function mappedPost(values: Record<string, any> = {}, options: BloggerOptions = {}): Promise<PostContext> {
    let post: PostContext;
    await withBlogs({[BLOG]: [apiPost('1', values)]}, async context => {
        await map(options, context);
        [post] = await context.getAllPosts();
    });
    return post!;
}

describe('Mapping Blogger posts', () => {
    it('maps the API response fixture to posts, tags, authors and links', async () => {
        await withBlogs({[BLOG]: fixture}, async context => {
            const summary = await map({}, context);
            assert.deepEqual(summary, {selected: 3, imported: 3, skipped: 0});
            const [lorem, ipsum, dolor] = await context.getAllPosts();

            assert.equal(lorem.lookupKey, 'post:id:1234563682306064159');
            assert.equal(lorem.ghostId, ghostId(BLOG, 'post', '1234563682306064159'));
            assert.equal(lorem.get('slug'), 'lorem');
            assert.equal(lorem.get('title'), 'Lorem');
            assert.equal(lorem.get('status'), 'published');
            assert.equal(lorem.get('type'), 'post');
            assert.equal(lorem.get('html'), '<p>Lorem content</p>');
            assert.deepEqual(lorem.get('published_at'), new Date('2017-06-20T04:32:00Z'));
            assert.deepEqual(lorem.get('created_at'), new Date('2017-06-20T04:32:00Z'));
            assert.deepEqual(lorem.get('updated_at'), new Date('2017-06-20T04:32:57Z'));
            assert.equal(lorem.get('feature_image'), null);
            assert.deepEqual(names(lorem.data.tags), [
                'books',
                'This & That',
                'Good & Bad',
                '#blogger-site-12345678',
                '#blogger'
            ]);
            assert.deepEqual(slugs(lorem.data.tags), [
                'books',
                'this-that',
                'good-bad',
                'hash-blogger-site-12345678',
                'hash-blogger'
            ]);
            assert.equal(lorem.data.tags[0].ghostId, ghostId('blogger.com', 'tag', 'slug:books'));

            // The three posts share one Blogger profile, so they share one author.
            const [author] = lorem.data.authors;
            assert.equal(author.data.name, 'Important Author & Co.');
            assert.equal(author.data.slug, 'important-author-co');
            assert.equal(author.data.email, 'important-author-co@example.com');
            assert.equal(author.ghostId, ghostId('blogger.com', 'author', 'id:19203947420298040620'));
            assert.equal(ipsum.data.authors[0].dbId, author.dbId);

            assert.equal(
                dolor.get('feature_image'),
                'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg'
            );
            assert.match(dolor.get('html'), /^<p>Lorem ipsum dolor sit amet/);

            for (const post of [lorem, ipsum, dolor]) {
                const record = context.sources.get('post', post.lookupKey!)!;
                assert.equal(
                    context.findLink(stringUtils.cleanURL(JSON.parse(record.content).url)),
                    `/${post.get('slug')}/`
                );
            }
        });
    });

    it('keeps IDs and links stable when mapping again', async () => {
        await withBlogs({[BLOG]: fixture}, async context => {
            await map({}, context);
            const first = (await context.getAllPosts()).map(post => [post.ghostId, post.get('slug')]);
            await map({addTag: 'Again'}, context);
            const second = await context.getAllPosts();
            assert.deepEqual(
                second.map(post => [post.ghostId, post.get('slug')]),
                first
            );
            assert.equal(context.findLink('example.blogspot.com/2017/06/lorem.html'), '/lorem/');
            assert.ok(names(second[0].data.tags).includes('Again'));
        });
    });

    it('adds --addTag before the internal tags and sorts internal labels last', async () => {
        const post = await mappedPost(
            {labels: ['#Internal', 'books', 'Books', ' ', 'Good &amp; Bad']},
            {addTag: ' Blog Posts '}
        );
        assert.deepEqual(names(post.data.tags), [
            'books',
            'Good & Bad',
            'Blog Posts',
            '#Internal',
            '#blogger-site-12345678',
            '#blogger'
        ]);
        assert.deepEqual(slugs(post.data.tags), [
            'books',
            'good-bad',
            'blog-posts',
            'hash-internal',
            'hash-blogger-site-12345678',
            'hash-blogger'
        ]);
    });

    it('keeps a leading image in the content without --firstImageAsFeatured', async () => {
        const post = await mappedPost(
            {content: '<img src="https://x.com/a.jpg"><p>Text</p>'},
            {firstImageAsFeatured: false}
        );
        assert.equal(post.get('feature_image'), null);
        assert.equal(post.get('html'), '<img src="https://x.com/a.jpg"><p>Text</p>');
    });

    it('maps only the selected stored blogs, and needs a new fetch for others', async () => {
        await withBlogs(
            {[BLOG]: [apiPost('1')], [OTHER]: [apiPost('2', {blog: {id: OTHER}}), apiPost('3', {blog: undefined})]},
            async context => {
                assert.deepEqual(await map({blogID: [OTHER]}, context), {selected: 2, imported: 2, skipped: 0});
                const posts = await context.getAllPosts();
                assert.deepEqual(
                    posts.map(post => post.get('slug')),
                    ['post-2', 'post-3']
                );
                // A post without a blog ID in the API object takes it from the page it was fetched with.
                assert.equal(posts[1].ghostId, ghostId(OTHER, 'post', '3'));
                assert.deepEqual(names(posts[1].data.tags), ['#blogger-site-87654321', '#blogger']);
                assert.deepEqual(await map({blogID: []}, context), {selected: 3, imported: 3, skipped: 0});
                await assert.rejects(
                    map({blogID: [BLOG, '999']}, context),
                    /does not include blog 999\. Fetch it again with --rereadSource/
                );
            }
        );
    });

    it('keeps distinct Blogger accounts with the same name as distinct authors', async () => {
        await withBlogs(
            {
                [BLOG]: [
                    apiPost('1'),
                    apiPost('2', {author: {id: 'author-2', displayName: 'Jane Doe'}}),
                    apiPost('3', {author: {displayName: 'Tom &amp; Jerry&#39;s'}}),
                    apiPost('4', {author: {displayName: "Tom & Jerry's"}}),
                    apiPost('5', {author: {id: 'author-3', displayName: ' '}}),
                    apiPost('6', {author: undefined}),
                    apiPost('7', {author: {id: 'author-4', displayName: '!!!'}})
                ]
            },
            async context => {
                await map({}, context);
                const posts = await context.getAllPosts();
                const authors = posts.map(post => post.data.authors.map((author: any) => author.data));
                assert.deepEqual(
                    authors.map(list => list.map((author: any) => [author.name, author.slug, author.email])),
                    [
                        [['Jane Doe', 'jane-doe', 'jane-doe@example.com']],
                        [['Jane Doe', 'jane-doe-2', 'jane-doe-2@example.com']],
                        [["Tom & Jerry's", 'tom-jerrys', 'tom-jerrys@example.com']],
                        [["Tom & Jerry's", 'tom-jerrys', 'tom-jerrys@example.com']],
                        [],
                        [],
                        [['!!!', 'author', 'author@example.com']]
                    ]
                );
                assert.equal(posts[1].data.authors[0].ghostId, ghostId('blogger.com', 'author', 'id:author-2'));
                assert.equal(posts[2].data.authors[0].ghostId, ghostId('blogger.com', 'author', 'name:tom-jerrys'));
                assert.deepEqual(
                    events(context, 'slug:renamed').map(event => [event.details.oldSlug, event.details.newSlug]),
                    [['jane-doe', 'jane-doe-2']]
                );
            }
        );
    });

    it('matches authors to Ghost users by email and keeps their slugs reserved', async () => {
        await withBlogs(
            {
                [BLOG]: [
                    apiPost('1'),
                    apiPost('2', {author: {id: 'author-2', displayName: 'Jane Doe'}}),
                    apiPost('3', {author: {id: 'author-3', displayName: 'John'}}),
                    apiPost('4', {author: {id: 'author-4', displayName: 'Editor'}}),
                    apiPost('5', {author: {id: 'author-5', displayName: 'Owner'}})
                ]
            },
            async context => {
                await map({}, context, {
                    ghostUsers: [
                        {id: '0123456789abcdef01234567', slug: 'jane', name: 'Jane', email: 'Jane-Doe@example.com'},
                        {id: '0123456789abcdef01234568', slug: 'john', name: 'John', email: 'john@ghost.org'},
                        {
                            id: '0123456789abcdef01234569',
                            slug: 'ed',
                            name: 'Ed',
                            email: 'editor@example.com',
                            roles: ['Editor', 'Super Editor']
                        },
                        {
                            id: '0123456789abcdef0123456a',
                            slug: 'own',
                            name: 'Own',
                            email: 'owner@example.com',
                            roles: ['Owner']
                        },
                        {id: '0123456789abcdef0123456b', slug: 'no-email', name: 'No email'}
                    ] as any
                });
                const authors = (await context.getAllPosts()).map(post => post.data.authors[0]);
                // Both Jane Doe accounts have Jane's placeholder email, so both are Jane.
                assert.deepEqual(
                    authors.map(author => [author.ghostId, author.data.slug, author.data.roles]),
                    [
                        ['0123456789abcdef01234567', 'jane', ['Contributor']],
                        ['0123456789abcdef01234567', 'jane', ['Contributor']],
                        [ghostId('blogger.com', 'author', 'id:author-3'), 'john-2', ['Contributor']],
                        ['0123456789abcdef01234569', 'ed', ['Editor']],
                        ['0123456789abcdef0123456a', 'own', ['Contributor']]
                    ]
                );
                assert.equal(authors[2].data.email, 'john-2@example.com');
                assert.deepEqual(
                    events(context, 'operation:warning').map(event => event.details.author),
                    ['id:author-4', 'id:author-5']
                );
            }
        );
    });

    it('dates posts by their published time, falling back to the updated time', async () => {
        const zoneless = await mappedPost({published: '2020-01-02T03:04:05', updated: undefined});
        assert.deepEqual(zoneless.get('published_at'), new Date('2020-01-02T03:04:05Z'));
        assert.deepEqual(zoneless.get('updated_at'), new Date('2020-01-02T03:04:05Z'));
        const fallback = await mappedPost({published: 'soon', updated: '2021-05-06T07:08:09+02:00'});
        assert.deepEqual(fallback.get('published_at'), new Date('2021-05-06T05:08:09Z'));
        assert.deepEqual(fallback.get('created_at'), new Date('2021-05-06T05:08:09Z'));
    });

    it('fills in missing titles, slugs and content', async () => {
        const untitled = await mappedPost({title: undefined, content: undefined, url: undefined});
        assert.equal(untitled.get('title'), '(Untitled)');
        assert.equal(untitled.get('slug'), 'untitled');
        assert.equal(untitled.get('html'), '');
        const decoded = await mappedPost({title: 'Caption &amp; links', url: 'http://example.blogspot.com/'});
        assert.equal(decoded.get('title'), 'Caption & links');
        assert.equal(decoded.get('slug'), 'caption-links');
        const symbols = await mappedPost({title: '!!!', url: ''});
        assert.equal(symbols.get('slug'), '1');
    });

    it('registers links only for absolute post URLs', async () => {
        await withBlogs(
            {[BLOG]: [apiPost('1', {url: 'example.blogspot.com/2020/01/relative.html'})]},
            async context => {
                await map({}, context);
                const [post] = await context.getAllPosts();
                assert.equal(post.get('slug'), 'relative');
                assert.equal(context.findLink('example.blogspot.com/2020/01/relative.html'), null);
            }
        );
    });

    it('skips posts without an ID, without a valid date, or over the tag limit', async () => {
        await withBlogs(
            {
                [BLOG]: [
                    apiPost(''),
                    apiPost('2', {published: '', updated: 'never'}),
                    apiPost('3', {published: 12, updated: null}),
                    apiPost('4', {labels: Array.from({length: 499}, (_, index) => `Label ${index}`)}),
                    apiPost('5')
                ]
            },
            async context => {
                assert.deepEqual(await map({}, context), {selected: 5, imported: 1, skipped: 4});
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    [
                        'Post has no ID',
                        'Invalid Blogger post dates',
                        'Invalid Blogger post dates',
                        'Post exceeds Ghost tag relationship limit'
                    ]
                );
                assert.equal((context.db.stmts.countUsedTags.get() as {count: number}).count, 2);
            }
        );
    });

    it('needs completed source data', async () => {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest complete Blogger source data/);
        } finally {
            await context.close();
        }
    });
});
