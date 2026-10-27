import assert from 'node:assert/strict';
import {afterEach, beforeEach, describe, it} from 'node:test';
import {mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import nock from 'nock';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {ingest, map, ghostId} from '../index.js';
import {SITE, wordpress, post, user, term, memoryContext, reset, fixture} from './helpers.js';

async function setup(data: Record<string, any[]>, ingestOptions: Record<string, any> = {}): Promise<MigrateContext> {
    wordpress(data);
    const context = await memoryContext();
    await ingest(SITE, context, ingestOptions);
    return context;
}

const names = (items: any[]) => items.map(item => item.data.name);
const events = (context: MigrateContext, type: string) =>
    context.getMigrationReport().events.filter(event => event.type === type);
const link = (context: MigrateContext, url: string) => context.findLink(stringUtils.cleanURL(url));

describe('Mapping WordPress API records', function () {
    beforeEach(() => nock.disableNetConnect());
    afterEach(reset);

    it('maps posts, pages and custom post types with authors, tags and links', async function () {
        const context = await setup(
            {
                users: [
                    user(1, 'admin', {email: 'admin@example.com', description: '<p>Bio</p>'}),
                    user(2, 'writer'),
                    user(3, 'co-one')
                ],
                posts: [
                    post(1, {
                        _embedded: {
                            'wp:term': [
                                [term('category', 10, 'news', 'News')],
                                [
                                    term('post_tag', 20, 'news', 'News tag'),
                                    term('post_tag', 21, 'cafe', 'Café &amp; Co')
                                ]
                            ]
                        }
                    }),
                    post(2, {
                        author: 2,
                        _embedded: {
                            'wp:term': [[term('category', 10, 'news', 'News')], [term('country', 30, 'cz', 'Czechia')]]
                        }
                    }),
                    post(3, {
                        _embedded: {
                            'wp:term': [
                                [term('author', 40, 'co-one', 'Co One'), term('author', 41, 'guest', 'Guest Writer')]
                            ]
                        }
                    })
                ],
                pages: [
                    post(4, {
                        type: 'page',
                        author: 99,
                        _embedded: {author: [user(99, 'embedded')]}
                    })
                ],
                books: [post(5, {type: 'book', author: 77, _embedded: {}})]
            },
            {cpt: ['books']}
        );
        try {
            const summary = await map(
                {tags: true, customTaxonomies: ['country'], cpt: ['books'], addTag: 'Migrated', excerpt: true},
                context
            );
            assert.deepEqual(summary, {selected: 5, imported: 5, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(item => [item.lookupKey, item.get('type'), item.get('slug'), item.get('comment_id')]),
                [
                    ['post:id:1', 'post', 'post-1', '1'],
                    ['post:id:2', 'post', 'post-2', '2'],
                    ['post:id:3', 'post', 'post-3', '3'],
                    ['page:id:4', 'page', 'page-4', '4'],
                    ['book:id:5', 'post', 'book-5', '5']
                ]
            );
            const [first, second, third, page, book] = posts;
            assert.equal(first.ghostId, ghostId('example.com', 'post', 'post:id:1'));
            assert.equal(first.get('created_at').toISOString(), '2024-01-01T10:00:00.000Z');
            assert.equal(first.get('updated_at').toISOString(), '2024-01-02T10:00:00.000Z');
            assert.equal(first.get('custom_excerpt'), 'Excerpt 1');
            // With --cpt, regular posts get #wp-post and custom post types get #<type>.
            assert.deepEqual(names(first.data.tags), ['News', 'News tag', 'Café & Co', 'Migrated', '#wp', '#wp-post']);
            assert.deepEqual(
                first.data.tags.map((tag: any) => tag.data.slug),
                ['news', 'news-2', 'cafe', 'migrated', 'hash-wp', 'hash-wp-post']
            );
            assert.equal(second.data.tags[0].ghostId, first.data.tags[0].ghostId);
            assert.deepEqual(names(second.data.tags), ['News', 'Czechia', 'Migrated', '#wp', '#wp-post']);
            assert.deepEqual(names(first.data.authors), ['ADMIN']);
            assert.equal(first.data.authors[0].data.bio, 'Bio');
            assert.equal(first.data.authors[0].data.email, 'admin@example.com');
            assert.equal(first.data.authors[0].ghostId, ghostId('example.com', 'author', 'user:id:1'));
            assert.deepEqual(names(second.data.authors), ['WRITER']);
            assert.deepEqual(names(third.data.authors), ['CO-ONE', 'Guest Writer']);
            assert.equal(third.data.authors[1].data.email, 'guest@example.com');
            assert.deepEqual(names(page.data.authors), ['EMBEDDED']);
            assert.equal(page.data.tags.length, 1);
            // No author or embedded author: WordPress falls back to the first user, here the admin.
            assert.equal(book.data.authors[0].ghostId, first.data.authors[0].ghostId);
            assert.deepEqual(names(book.data.tags), ['Migrated', '#book']);

            assert.equal(link(context, `${SITE}/post-1/`), '/post-1/');
            assert.equal(link(context, `${SITE}/category/news/`), '/tag/news/');
            assert.equal(link(context, `${SITE}/tag/news/`), '/tag/news-2/');
            assert.equal(link(context, `${SITE}/author/admin/`), '/author/admin/');
            assert.equal(context.findLink('migrator-added-tag'), null);
            assert.equal(events(context, 'slug:renamed').length, 1);

            const sources = [];
            for await (const record of context.sources.recordsFor({type: 'author', id: first.data.authors[0].dbId!})) {
                sources.push(record.key);
            }
            assert.deepEqual(sources, ['post:id:1', 'book:id:5', 'user:id:1']);

            // Mapping again rebuilds the same identities.
            await map({tags: true, customTaxonomies: ['country'], cpt: ['books'], addTag: 'Migrated'}, context);
            assert.equal((await context.getAllPosts())[0].ghostId, first.ghostId);
        } finally {
            await context.close();
        }
    });

    it('applies post, page, draft, custom post type, maxPosts and URL filters without refetching', async function () {
        const directory = await mkdtemp(join(tmpdir(), 'wp-api-only-'));
        const context = await setup(
            {
                users: [user(1, 'admin')],
                posts: [post(1), post(2, {status: 'future'}), post(3), post(4)],
                pages: [post(5, {type: 'page'})],
                books: [post(6, {type: 'book'})]
            },
            {cpt: ['books']}
        );
        try {
            const keys = async () => (await context.getAllPosts()).map(item => item.lookupKey);
            assert.deepEqual(await map({}, context), {selected: 5, imported: 5, skipped: 0});
            assert.deepEqual(await keys(), ['post:id:1', 'post:id:2', 'post:id:3', 'post:id:4', 'page:id:5']);
            await map({posts: false, cpt: ['books']}, context);
            assert.deepEqual(await keys(), ['page:id:5', 'book:id:6']);
            await map({pages: false, drafts: false}, context);
            assert.deepEqual(await keys(), ['post:id:1', 'post:id:3', 'post:id:4']);
            assert.equal((await context.getAllPosts())[0].get('status'), 'published');
            await map({maxPosts: 2}, context);
            assert.deepEqual(await keys(), ['post:id:1', 'post:id:2', 'page:id:5']);
            const onlyURLs = join(directory, 'urls.csv');
            await writeFile(onlyURLs, `url\n${SITE}/post-3/\n${SITE}/page-5/\n${SITE}/missing/\n`);
            await map({onlyURLs}, context);
            assert.deepEqual(await keys(), ['post:id:3', 'page:id:5']);
        } finally {
            await context.close();
            await rm(directory, {recursive: true, force: true});
        }
    });

    it('merges authors with matching Ghost users and keeps their slugs reserved', async function () {
        const context = await setup({
            users: [
                user(1, 'admin', {email: 'Owner@Example.com'}),
                user(2, 'alias', {email: 'owner@example.com'}),
                user(3, 'editor')
            ],
            posts: [post(1), post(2, {author: 2}), post(3, {author: 3})]
        });
        try {
            const ghostUsers = [
                {id: 'ghost-owner', slug: 'owner', name: 'Owner', email: 'owner@example.com', roles: [{name: 'Owner'}]},
                {id: 'ghost-editor', slug: 'editor', name: 'Ghost Editor', email: 'other@example.com'},
                {id: 'ghost-no-email', slug: 'nobody', name: 'Nobody'}
            ];
            await map({}, context, {ghostUsers: ghostUsers as any});
            const [first, second, third] = await context.getAllPosts();
            assert.equal(first.data.authors[0].ghostId, 'ghost-owner');
            assert.equal(first.data.authors[0].data.slug, 'owner');
            assert.deepEqual(first.data.authors[0].data.roles, ['Contributor']);
            assert.equal(second.data.authors[0].dbId, first.data.authors[0].dbId);
            assert.equal(third.data.authors[0].data.slug, 'editor-2');
            assert.equal(
                (events(context, 'operation:warning')[0].details as any).reason,
                'Unsupported author roles replaced by supported Ghost roles'
            );
            const sources = [];
            for await (const record of context.sources.recordsFor({type: 'author', id: first.data.authors[0].dbId!})) {
                sources.push(record.key);
            }
            assert.deepEqual(sources, ['post:id:1', 'post:id:2', 'user:id:1', 'user:id:2']);
        } finally {
            await context.close();
        }
    });

    it('keeps supported Ghost roles from a matched user', async function () {
        const context = await setup({
            users: [user(1, 'admin', {email: 'admin@example.com'})],
            posts: [post(1)]
        });
        try {
            await map({}, context, {
                ghostUsers: [
                    {id: 'ghost-admin', slug: 'admin', name: 'Admin', email: 'admin@example.com', roles: ['Editor']}
                ] as any
            });
            const [first] = await context.getAllPosts();
            assert.deepEqual(first.data.authors[0].data.roles, ['Editor']);
            assert.equal(events(context, 'operation:warning').length, 0);
        } finally {
            await context.close();
        }
    });

    it('skips records with invalid dates, URLs or too many tags and reports them', async function () {
        const tags = Array.from({length: 501}, (_, index) => term('post_tag', 100 + index, `tag-${index}`));
        const context = await setup({
            users: [user(1, 'admin')],
            posts: [
                post(1, {date_gmt: null}),
                post(2, {link: 'not a url'}),
                post(3, {_embedded: {'wp:term': [tags]}}),
                post(4)
            ]
        });
        try {
            assert.deepEqual(await map({tags: true}, context), {selected: 4, imported: 1, skipped: 3});
            assert.deepEqual(
                events(context, 'record:skipped').map(event => (event.details as any).reason),
                [
                    'Invalid WordPress publication date',
                    'Invalid WordPress post URL',
                    'Post exceeds Ghost author/tag relationship limits'
                ]
            );
            assert.equal(context.countWarnings(), 3);
        } finally {
            await context.close();
        }
    });

    it('maps dated permalinks, Parse.ly authors, hashtag tags and posts without authors', async function () {
        const context = await setup({
            posts: [
                post(1, {link: `${SITE}/2024/01/02/dated/`, parsely: {meta: {author: [{name: 'Parsely Person'}]}}}),
                post(2, {
                    link: `${SITE}/news/2024/03/month/`,
                    author: 5,
                    _embedded: {'wp:term': [[term('post_tag', 50, '', '#Hash'), term('post_tag', 51, 'blank', '  ')]]}
                })
            ]
        });
        try {
            await map({datedPermalinks: '/yyyy/mm/dd/', tags: true}, context);
            assert.equal(link(context, `${SITE}/2024/01/02/dated/`), '/2024/01/02/post-1/');
            await map({datedPermalinks: '/*/yyyy/mm/', tags: true}, context);
            assert.equal(link(context, `${SITE}/news/2024/03/month/`), '/2024/03/post-2/');
            const [first, second] = await context.getAllPosts();
            assert.deepEqual(names(first.data.authors), ['Parsely Person']);
            assert.equal(first.data.authors[0].data.slug, 'parsely-person');
            assert.deepEqual(second.data.authors, []);
            assert.deepEqual(
                second.data.tags.map((tag: any) => [tag.data.name, tag.data.slug]),
                [
                    ['#Hash', 'hash-hash'],
                    ['#wp', 'hash-wp']
                ]
            );
        } finally {
            await context.close();
        }
    });

    it('reuses an author across posts and indexes only users with slugs', async function () {
        const context = await setup(
            {
                posts: [
                    post(1, {author: 1, _embedded: {'wp:term': [[term('author', 9, 'two', 'Two')]]}}),
                    post(2, {author: 1, _embedded: {'wp:term': [[term('author', 9, 'two', 'Two')]]}})
                ]
            },
            {usersJSON: [{name: 'No Slug'}, {id: 2, slug: 'two', name: 'Two User', email: 'two@example.com'}]}
        );
        try {
            await map({}, context);
            const [first, second] = await context.getAllPosts();
            assert.equal(first.data.authors[0].data.email, 'two@example.com');
            assert.equal(second.data.authors[0].dbId, first.data.authors[0].dbId);
            // Users from a file have no profile URL; they still merge with a matching Ghost user.
            await map({}, context, {
                ghostUsers: [{id: 'ghost-two', slug: 'two', name: 'Two', email: 'two@example.com'}] as any
            });
            assert.equal((await context.getAllPosts())[0].data.authors[0].ghostId, 'ghost-two');
        } finally {
            await context.close();
        }
    });

    it('accepts zoned and missing dates and names anonymous users', async function () {
        const context = await setup(
            {posts: [post(1, {date_gmt: '2024-01-01T10:00:00+02:00', modified_gmt: null, author: 3})]},
            {usersJSON: [{id: 3}]}
        );
        try {
            await map({}, context);
            const [first] = await context.getAllPosts();
            assert.equal(first.get('created_at').toISOString(), '2024-01-01T08:00:00.000Z');
            assert.equal(first.get('updated_at'), null);
            assert.deepEqual(
                [first.data.authors[0].data.name, first.data.authors[0].data.slug],
                ['Example User', 'example-user']
            );
        } finally {
            await context.close();
        }
    });

    it('maps the original single-post fixture', async function () {
        const single = fixture('./fixtures/single-post.json');
        const context = await setup({posts: [single], users: [fixture('./fixtures/single-user.json')]});
        try {
            await map({tags: true, featureImage: 'featuredmedia', scrape: ['none']}, context);
            const [mapped] = await context.getAllPosts();
            assert.ok(mapped instanceof PostContext);
            assert.equal(mapped.get('feature_image'), single._embedded['wp:featuredmedia'][0].source_url);
            assert.equal(mapped.get('title'), 'My Awesome Post');
            assert.deepEqual(
                mapped.data.tags.map((tag: any) => tag.data.slug),
                ['boop', 'foo', 'bar-baz', 'boop-2', 'beep', 'hash-wp']
            );
        } finally {
            await context.close();
        }
    });

    it('requires completed source data', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest complete WordPress API source data/);
        } finally {
            await context.close();
        }
    });
});
