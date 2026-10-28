import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {ghostId, map} from '../index.js';
import type {LetterdropOptions, LetterdropPost} from '../index.js';
import {SITE, apiPost, events, fixture, memoryContext, stored} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);
const slugs = (items: any[]) => items.map(item => item.data.slug);

/** Run `test` against a fresh context holding the posts. */
async function withPosts(posts: LetterdropPost[], test: (context: MigrateContext) => Promise<void>) {
    const context = await stored(posts);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

/** Map one post with these values and options. */
async function mappedPost(values: Record<string, any> = {}, options: LetterdropOptions = {}): Promise<PostContext> {
    let post: PostContext;
    await withPosts([apiPost('1', values)], async context => {
        await map({url: SITE, ...options}, context);
        [post] = await context.getAllPosts();
    });
    return post!;
}

describe('Mapping Letterdrop posts', () => {
    it('maps the API response fixture to posts, tags, authors and links', async () => {
        await withPosts(fixture(), async context => {
            const summary = await map({url: `${SITE}/`, addPrimaryTag: 'Newsletter'}, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
            const [lorem, dolor] = await context.getAllPosts();

            assert.equal(lorem.lookupKey, 'post:id:1234cb8b4f83360067f27ae0');
            assert.equal(lorem.ghostId, ghostId('example.com', 'post', '1234cb8b4f83360067f27ae0'));
            assert.equal(lorem.get('slug'), 'lorem-ipsum');
            assert.equal(lorem.get('title'), 'Lorem ipsum');
            assert.equal(lorem.get('status'), 'published');
            assert.equal(lorem.get('visibility'), 'public');
            assert.equal(lorem.get('type'), 'post');
            assert.equal(lorem.get('custom_excerpt'), 'Lorem ipsum dolor sit amet consectetur adipiscing elit');
            assert.equal(lorem.get('meta_title'), 'Meta title lorem ipsum dolor sit amet consectetur adipiscing elit');
            assert.equal(
                lorem.get('meta_description'),
                'Meta description lorem ipsum dolor sit amet consectetur adipiscing elit'
            );
            assert.equal(lorem.get('feature_image'), 'https://example.com/lorem-ipsum-cover.webp');
            assert.deepEqual(lorem.get('published_at'), new Date('2023-02-03T09:49:30.272Z'));
            assert.deepEqual(lorem.get('created_at'), new Date('2023-02-03T09:49:30.272Z'));
            assert.deepEqual(lorem.get('updated_at'), new Date('2023-02-03T09:49:30.207Z'));
            assert.match(lorem.get('html'), /<a href="https:\/\/example\.com\/p\/dolor-simet">Aenean<\/a>/);
            assert.deepEqual(names(lorem.data.tags), ['Newsletter', 'Lorem', 'Ipsum', '#letterdrop']);
            assert.deepEqual(slugs(lorem.data.tags), ['newsletter', 'lorem', 'ipsum', 'hash-letterdrop']);
            assert.equal(lorem.data.tags[1].ghostId, ghostId('example.com', 'tag', 'slug:lorem'));
            // Both posts are tagged Lorem: one tag.
            assert.equal(dolor.data.tags[1].dbId, lorem.data.tags[1].dbId);

            const [author] = lorem.data.authors;
            assert.equal(author.data.name, 'John Smith');
            assert.equal(author.data.slug, 'john-smith');
            assert.equal(author.data.email, 'john-smith@example.com');
            assert.deepEqual(author.data.roles, ['Contributor']);
            assert.equal(author.ghostId, ghostId('example.com', 'author', 'name:John Smith'));
            assert.equal(dolor.data.authors[0].dbId, author.dbId);

            assert.equal(context.findLink(stringUtils.cleanURL('https://example.com/p/lorem-ipsum')), '/lorem-ipsum/');
            assert.equal(context.findLink(stringUtils.cleanURL('https://example.com/p/dolor-simet')), '/dolor-simet/');
            for (const post of [lorem, dolor]) {
                const record = context.sources.get('post', post.lookupKey!)!;
                const linked: string[] = [];
                for await (const entity of context.sources.entitiesFor(record.id)) {
                    linked.push(entity.type);
                }
                assert.deepEqual(linked.sort(), ['author', 'post', 'tag', 'tag', 'tag', 'tag']);
            }
        });
    });

    it('needs completed source data and an HTTP(S) site URL', async () => {
        const context = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, context), /Ingest complete Letterdrop source data/);
        } finally {
            await context.close();
        }
        await withPosts([apiPost('1')], async stored => {
            await assert.rejects(map({}, stored), /need the site URL \(--url\)/);
            await assert.rejects(map({url: 'ftp://example.com'}, stored), /HTTP or HTTPS/);
            await assert.rejects(map({url: 'not a url'}, stored), /HTTP or HTTPS/);
        });
    });

    it('applies options to the stored posts on every mapping', async () => {
        await withPosts(
            [apiPost('1', {body: '<iframe name="letterdrop-subscribe-input"></iframe>'})],
            async context => {
                await map({url: SITE}, context);
                let [post] = await context.getAllPosts();
                assert.deepEqual(names(post.data.tags), ['News', '#letterdrop']);
                assert.match(post.get('html'), /href="#\/portal\/signup" class="kg-btn kg-btn-accent">Subscribe</);
                const firstId = post.ghostId;

                await map({url: SITE, addPrimaryTag: 'Rerun', subscribeLink: '/join', subscribeText: 'Join'}, context);
                [post] = await context.getAllPosts();
                assert.deepEqual(names(post.data.tags), ['Rerun', 'News', '#letterdrop']);
                assert.match(post.get('html'), /href="\/join" class="kg-btn kg-btn-accent">Join</);
                assert.equal(post.ghostId, firstId);
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/post-1`)), '/post-1/');
            }
        );
    });

    it('scopes Ghost IDs to the site URL', async () => {
        const post = await mappedPost({}, {url: 'https://Example.com/blog/'});
        assert.equal(post.ghostId, ghostId('example.com/blog', 'post', '1'));
        assert.equal(post.data.tags[0].ghostId, ghostId('example.com/blog', 'tag', 'slug:news'));
    });

    it('dates posts by publishedOn, then updated, reading zoneless dates as UTC', async () => {
        let post = await mappedPost({publishedOn: '', updated: '2023-05-06T07:08:09'});
        assert.deepEqual(post.get('published_at'), new Date('2023-05-06T07:08:09Z'));
        assert.deepEqual(post.get('updated_at'), new Date('2023-05-06T07:08:09Z'));
        post = await mappedPost({publishedOn: '2023-05-06T07:08:09+02:00', updated: null});
        assert.deepEqual(post.get('published_at'), new Date('2023-05-06T05:08:09Z'));
        assert.deepEqual(post.get('updated_at'), new Date('2023-05-06T05:08:09Z'));
        post = await mappedPost({publishedOn: 'not a date', updated: 12});
        assert.equal(post, undefined);
    });

    it('skips posts without an ID or a valid date, or with too many tags', async () => {
        await withPosts(
            [
                apiPost('1'),
                {...apiPost(''), id: ''},
                apiPost('3', {publishedOn: null, updated: 'never'}),
                apiPost('4', {tags: Array.from({length: 500}, (_, index) => `Tag ${index}`)})
            ],
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 4, imported: 1, skipped: 3});
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    ['Post has no ID', 'Invalid Letterdrop post dates', 'Post exceeds Ghost tag relationship limit']
                );
            }
        );
    });

    it('keeps blank fields empty and falls back to the post ID for a slug', async () => {
        const post = await mappedPost({
            title: '',
            slug: '',
            url: null,
            subtitle: '',
            metaTitle: null,
            metaDescription: ' ',
            coverImage: '',
            author: null
        });
        assert.equal(post.get('title'), '(Untitled)');
        assert.equal(post.get('slug'), '1');
        assert.equal(post.get('custom_excerpt'), null);
        assert.equal(post.get('meta_title'), null);
        assert.equal(post.get('meta_description'), null);
        assert.equal(post.get('feature_image'), null);
        assert.deepEqual(post.data.authors, []);
    });

    it('de-duplicates post slugs and registers links only for valid URLs', async () => {
        await withPosts(
            [apiPost('1'), apiPost('2', {slug: 'post-1'}), apiPost('3', {url: 'not a url'})],
            async context => {
                await map({url: SITE}, context);
                assert.deepEqual(
                    (await context.getAllPosts()).map(post => post.get('slug')),
                    ['post-1', 'post-1-2', 'post-3']
                );
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/post-2`)), '/post-1-2/');
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/post-3`)), null);
            }
        );
    });

    it('keeps differently named authors apart when their slugs collide', async () => {
        await withPosts(
            [
                apiPost('1', {author: {name: 'José Smith'}}),
                apiPost('2', {author: {name: 'Jose Smith'}}),
                apiPost('3', {author: {name: 'José Smith'}}),
                apiPost('4', {author: {name: '???'}})
            ],
            async context => {
                await map({url: SITE}, context);
                const authors = (await context.getAllPosts()).map(post => post.data.authors[0]);
                assert.deepEqual(
                    authors.map(author => [author.data.name, author.data.slug, author.data.email]),
                    [
                        ['José Smith', 'jose-smith', 'jose-smith@example.com'],
                        ['Jose Smith', 'jose-smith-2', 'jose-smith-2@example.com'],
                        ['José Smith', 'jose-smith', 'jose-smith@example.com'],
                        ['???', 'author', 'author@example.com']
                    ]
                );
                assert.equal(authors[2].dbId, authors[0].dbId);
                assert.deepEqual(
                    events(context, 'slug:renamed').map(event => [event.details.oldSlug, event.details.newSlug]),
                    [['jose-smith', 'jose-smith-2']]
                );
            }
        );
    });

    it('matches authors to Ghost users by email and keeps their slugs reserved', async () => {
        await withPosts(
            [
                apiPost('1'),
                apiPost('2', {author: {name: 'Jane-Doe'}}),
                apiPost('3', {author: {name: 'John'}}),
                apiPost('4', {author: {name: 'Editor'}}),
                apiPost('5', {author: {name: 'Owner'}})
            ],
            async context => {
                await map({url: SITE}, context, {
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
                // Jane Doe and Jane-Doe share Jane's placeholder email, so both are Jane.
                assert.deepEqual(
                    authors.map(author => [author.ghostId, author.data.slug, author.data.roles]),
                    [
                        ['0123456789abcdef01234567', 'jane', ['Contributor']],
                        ['0123456789abcdef01234567', 'jane', ['Contributor']],
                        [ghostId('example.com', 'author', 'name:John'), 'john-2', ['Contributor']],
                        ['0123456789abcdef01234569', 'ed', ['Editor']],
                        ['0123456789abcdef0123456a', 'own', ['Contributor']]
                    ]
                );
                assert.equal(authors[2].data.email, 'john-2@example.com');
                assert.deepEqual(
                    events(context, 'operation:warning').map(event => event.details.author),
                    ['Editor', 'Owner']
                );
            }
        );
    });

    it('accepts Ghost users as an async iterable', async () => {
        async function* users() {
            yield {id: '0123456789abcdef01234567', slug: 'jane', name: 'Jane', email: 'jane-doe@example.com'};
        }
        await withPosts([apiPost('1')], async context => {
            await map({url: SITE}, context, {ghostUsers: users()});
            const [post] = await context.getAllPosts();
            assert.equal(post.data.authors[0].ghostId, '0123456789abcdef01234567');
        });
    });
});
