import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext} from '@tryghost/mg-context';
import {ghostId, map} from '../index.js';
import {SITE, cleanUp, events, ingested, memoryContext, row} from './helpers.js';

/** Run `test` against a fresh context holding the fixture CSV, or the given rows. */
async function withExport(test: (context: MigrateContext) => Promise<void>, rows?: Record<string, string>[]) {
    const context = await ingested(rows);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

const iso = (value: Date | null) => value?.toISOString() ?? null;

describe('Mapping a Wix posts CSV', function () {
    after(cleanUp);

    it('maps the fixture posts with their fields, author, tags and links', async function () {
        await withExport(async context => {
            const summary = await map({url: `${SITE}/`}, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});

            const [post, draft] = await context.getAllPosts();
            assert.equal(post.ghostId, ghostId('example.com', 'post', 'id:post-1'));
            assert.equal(post.lookupKey, 'id:post-1');
            assert.equal(post.get('title'), 'Hello Wix');
            assert.equal(post.get('slug'), 'hello-wix');
            assert.equal(post.get('status'), 'published');
            assert.equal(post.get('comment_id'), 'internal-1');
            assert.equal(post.get('custom_excerpt'), 'Custom excerpt');
            assert.equal(post.get('plaintext'), 'Plain text fallback');
            assert.equal(post.get('featured'), true);
            assert.equal(post.get('feature_image'), 'https://static.wixstatic.com/media/example_media_image~mv2.jpg');
            assert.equal(post.get('html'), '<p>Hello <strong>world</strong></p>');
            assert.equal(iso(post.get('created_at')), '2025-10-01T10:00:00.000Z');
            assert.equal(iso(post.get('published_at')), '2025-10-01T10:00:00.000Z');
            assert.equal(iso(post.get('updated_at')), '2025-10-02T10:00:00.000Z');

            const [author] = post.data.authors;
            assert.deepEqual(
                [author.data.name, author.data.slug, author.data.email, author.data.roles],
                ['Jane Writer', 'jane-writer', 'jane-writer@example.com', ['Contributor']]
            );
            assert.equal(author.ghostId, ghostId('example.com', 'author', 'slug:jane-writer'));
            assert.deepEqual(
                post.data.tags.map((tag: any) => [tag.data.name, tag.data.slug]),
                [
                    ['Market News', 'market-news'],
                    ['Tax Planning', 'tax-planning'],
                    ['tag-id', 'tag-id'],
                    ['#wix', 'hash-wix']
                ]
            );
            assert.equal(post.data.tags[3].ghostId, ghostId('example.com', 'tag', 'slug:hash-wix'));
            assert.equal(context.findLink('example.com/post/hello-wix'), '/hello-wix/');

            // The draft has no dates, so it is dated when the CSV was read.
            const readAt = context.sources.currentIngestion!.completedAt;
            assert.equal(draft.get('slug'), 'draft-wix');
            assert.equal(draft.get('status'), 'draft');
            assert.equal(iso(draft.get('created_at')), new Date(readAt).toISOString());
            assert.equal(iso(draft.get('updated_at')), new Date(readAt).toISOString());
            assert.equal(draft.get('published_at'), null);
            assert.deepEqual(
                draft.data.authors.map((item: any) => [item.data.name, item.data.email]),
                [['Author', 'author@example.com']]
            );

            // Remapping gives the same IDs and dates.
            await new Promise(resolve => setTimeout(resolve, 5));
            await map({url: SITE}, context);
            const remapped = await context.getAllPosts();
            assert.deepEqual(
                remapped.map(item => [item.ghostId, iso(item.get('created_at'))]),
                [
                    [post.ghostId, '2025-10-01T10:00:00.000Z'],
                    [draft.ghostId, new Date(readAt).toISOString()]
                ]
            );
        });
    });

    it('dates posts by Published Date, then Last Published Date, then the read time for drafts', async function () {
        await withExport(
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 5, imported: 4, skipped: 1});
                const readAt = new Date(context.sources.currentIngestion!.completedAt).toISOString();
                const posts = Object.fromEntries((await context.getAllPosts()).map(post => [post.lookupKey, post]));
                const dates = (key: string) => {
                    const post = posts[key];
                    return [
                        post.get('status'),
                        iso(post.get('created_at')),
                        iso(post.get('published_at')),
                        iso(post.get('updated_at'))
                    ];
                };
                assert.deepEqual(dates('id:zoneless'), [
                    'published',
                    '2025-01-02T03:04:05.000Z',
                    '2025-01-02T03:04:05.000Z',
                    '2025-01-02T03:04:05.000Z'
                ]);
                assert.deepEqual(dates('id:last-only'), [
                    'draft',
                    '2025-02-01T00:00:00.000Z',
                    null,
                    '2025-02-01T00:00:00.000Z'
                ]);
                assert.deepEqual(dates('id:invalid-published'), [
                    'published',
                    '2025-03-01T00:00:00.000Z',
                    '2025-03-01T00:00:00.000Z',
                    '2025-03-01T00:00:00.000Z'
                ]);
                assert.deepEqual(dates('id:undated-draft'), ['draft', readAt, null, readAt]);
                assert.equal(posts['id:undated'], undefined);
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => [event.details.row, event.details.reason]),
                    [[5, 'Published row has no valid Published Date or Last Published Date']]
                );
            },
            [
                row('zoneless', {'Published Date': '2025-01-02 03:04:05'}),
                row('last-only', {'Published Date': '', 'Last Published Date': '2025-02-01T00:00:00Z'}),
                row('invalid-published', {
                    'Published Date': 'yesterday',
                    'Last Published Date': '2025-03-01T00:00:00Z'
                }),
                row('undated-draft', {'Published Date': '', 'Last Published Date': ''}),
                row('undated', {'Published Date': 'never', 'Last Published Date': ''})
            ]
        );
    });

    it('applies mapping options to the stored rows without a new read', async function () {
        await withExport(
            async context => {
                await map({url: SITE}, context);
                let [post] = await context.getAllPosts();
                assert.deepEqual(
                    post.data.tags.map((tag: any) => tag.data.name),
                    ['Main', 'Category', 'Tag', '#wix']
                );
                assert.equal(post.data.authors[0].data.name, 'Author');

                await map(
                    {
                        url: 'https://www.example.org/blog/',
                        defaultAuthorName: 'Staff Writer',
                        includeMainCategory: false,
                        includeTags: false
                    },
                    context
                );
                [post] = await context.getAllPosts();
                assert.deepEqual(
                    post.data.tags.map((tag: any) => tag.data.name),
                    ['Category', '#wix']
                );
                assert.equal(post.data.authors[0].data.name, 'Staff Writer');
                assert.equal(post.ghostId, ghostId('www.example.org/blog', 'post', 'id:one'));
                assert.equal(context.findLink('www.example.org/blog/post/one'), '/one/');
                assert.equal(context.findLink('example.com/post/one'), null);
            },
            [row('one', {Author: '', 'Main Category': 'Main', Categories: 'Category', Tags: 'Tag'})]
        );
    });

    it('shares tags and authors by slug, and keeps posts that share a slug apart', async function () {
        await withExport(
            async context => {
                await map({url: SITE}, context);
                const posts = await context.getAllPosts();
                assert.deepEqual(
                    posts.map(post => post.get('slug')),
                    ['same', 'same-2']
                );
                assert.deepEqual(
                    posts.map(post => post.data.tags.map((tag: any) => [tag.data.name, tag.dbId])),
                    [
                        [
                            ['Tax Planning', posts[0].data.tags[0].dbId],
                            ['#wix', posts[0].data.tags[1].dbId]
                        ],
                        [
                            ['Tax Planning', posts[0].data.tags[0].dbId],
                            ['#wix', posts[0].data.tags[1].dbId]
                        ]
                    ]
                );
                assert.deepEqual(
                    posts.map(post => [post.data.authors[0].data.name, post.data.authors[0].dbId]),
                    [
                        ['Jane Writer', posts[0].data.authors[0].dbId],
                        ['Jane Writer', posts[0].data.authors[0].dbId]
                    ]
                );
                assert.equal(context.findLink('example.com/post/two'), '/same-2/');
            },
            [
                row('one', {Slug: 'same', Tags: 'Tax Planning'}),
                row('two', {Slug: 'same', Tags: 'tax planning', Author: 'jane writer'})
            ]
        );
    });

    it('names an author whose name has no slug `author`', async function () {
        await withExport(
            async context => {
                await map({url: SITE}, context);
                const [author] = (await context.getAllPosts())[0].data.authors;
                assert.deepEqual(
                    [author.data.name, author.data.slug, author.data.email],
                    ['🎉', 'author', 'author@example.com']
                );
            },
            [row('one', {Author: '🎉'})]
        );
    });

    it('does not register links for rows without a Post Page URL', async function () {
        await withExport(
            async context => {
                await map({url: SITE}, context);
                const stats = context.hasContent();
                assert.ok(stats);
                assert.equal(stats.links, 0);
            },
            [row('one', {'Post Page URL': ''})]
        );
    });

    it('matches authors to Ghost users by email', async function () {
        await withExport(
            async context => {
                await map({url: SITE}, context, {
                    ghostUsers: [
                        {
                            id: '0123456789abcdef01234567',
                            slug: 'jw',
                            name: 'J. Writer',
                            email: 'Jane-Writer@example.com',
                            roles: [{name: 'Editor'}, {name: 'Owner'}]
                        },
                        {id: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'author', name: 'Owner', email: ''}
                    ]
                });
                const authors = (await context.getAllPosts()).map(post => post.data.authors[0]);
                assert.deepEqual(
                    authors.map(author => [author.ghostId, author.data.slug, author.data.name, author.data.roles]),
                    [
                        ['0123456789abcdef01234567', 'jw', 'J. Writer', ['Editor']],
                        [ghostId('example.com', 'author', 'slug:author'), 'author-2', 'Author', ['Contributor']]
                    ]
                );
                assert.equal(events(context, 'slug:renamed').length, 1);
                assert.deepEqual(
                    events(context, 'operation:warning').map(event => event.details),
                    [{author: 'Jane Writer', reason: 'Unsupported author roles replaced by supported Ghost roles'}]
                );

                await map({url: SITE}, context, {
                    ghostUsers: (async function* () {
                        yield {
                            id: '0123456789abcdef01234567',
                            slug: 'jw',
                            name: 'J. Writer',
                            email: 'jane-writer@example.com',
                            roles: [{name: 'Owner'}]
                        };
                    })()
                });
                assert.deepEqual((await context.getAllPosts())[0].data.authors[0].data.roles, ['Contributor']);
            },
            [row('one'), row('two', {Author: ''})]
        );
    });

    it('skips posts over Ghost’s tag limit', async function () {
        const tags = JSON.stringify(Array.from({length: 500}, (_, index) => `Tag ${index}`));
        await withExport(
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 2, imported: 1, skipped: 1});
                assert.equal(
                    events(context, 'record:skipped')[0].details.reason,
                    'Post exceeds Ghost tag relationship limit'
                );
            },
            [row('many', {Tags: tags}), row('few', {Tags: 'One'})]
        );
    });

    it('needs completed source data and an HTTP site URL', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, context), /Ingest a complete Wix posts CSV/);
        } finally {
            await context.close();
        }
        await withExport(async other => {
            await assert.rejects(map({}, other), /--url/);
            await assert.rejects(map({url: 'ftp://example.com'}, other), /--url/);
        });
    });
});
