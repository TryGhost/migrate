import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {
    applyScrapedData,
    createSlug,
    fullImageURL,
    ghostId,
    map,
    namedTag,
    publicFirst,
    rememberGhostUsers
} from '../index.js';
import type {BeehiivOptions} from '../index.js';
import {CSV_HEADER, SITE, cleanUp, events, ingested, memoryContext, row} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);

/** Map with `options` and return the mapped posts in record order. */
async function mapped(context: MigrateContext, options: Partial<BeehiivOptions> = {}): Promise<PostContext[]> {
    await map({url: SITE, ...options}, context);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding the fixture CSV, or the given rows. */
async function withExport(
    test: (context: MigrateContext) => Promise<void>,
    rows?: Record<string, string>[],
    columns?: string[]
): Promise<void> {
    const context = await ingested(rows, columns);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

describe('beehiiv mapping utilities', function () {
    it('takes the slug from the post URL, or the title when there is no URL', function () {
        assert.equal(createSlug({url: 'https://example.beehiiv.com/p/hello-world'}), 'hello-world');
        assert.equal(createSlug({url: 'https://example.com/p/hello-world'}), 'hello-world');
        assert.equal(createSlug({url: '', title: '👋 This! Is a post title.'}), 'this-is-a-post-title');
        assert.equal(createSlug({url: 'https://example.com/about'}), '');
    });

    it('makes beehiiv upload paths absolute', function () {
        const full = 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/my-path.jpg';
        assert.equal(fullImageURL('uploads/my-path.jpg'), full);
        assert.equal(fullImageURL('/uploads/my-path.jpg'), full);
        assert.equal(fullImageURL(full), full);
    });

    it('names internal tags with a hash- slug and orders them last', function () {
        const id = (kind: string, key: string) => `${kind}:${key}`;
        const tags = [namedTag('#Secret', id), namedTag('News', id), namedTag('#beehiiv', id, 'hash-beehiiv')];
        assert.deepEqual(
            tags.map(tag => [tag.data.slug, tag.ghostId]),
            [
                ['hash-secret', 'tag:slug:hash-secret'],
                ['news', 'tag:slug:news'],
                ['hash-beehiiv', 'tag:slug:hash-beehiiv']
            ]
        );
        assert.deepEqual(names(publicFirst(tags)), ['News', '#Secret', '#beehiiv']);
    });
});

describe('Mapping a beehiiv posts CSV', function () {
    after(cleanUp);

    it('maps the fixture posts with their fields, tags and links', async function () {
        await withExport(async context => {
            const summary = await map({url: `${SITE}/`}, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => post.get('slug')),
                ['sample-post', 'another-post']
            );
            const [post] = posts;
            assert.equal(post.lookupKey, 'abcd1234-1505-4fbf-9576-f3d1bd3034cc');
            assert.equal(post.ghostId, ghostId('example.beehiiv.com', 'post', 'abcd1234-1505-4fbf-9576-f3d1bd3034cc'));
            assert.equal(post.get('title'), 'Sample Post');
            assert.equal(post.get('type'), 'post');
            assert.equal(post.get('status'), 'published');
            assert.equal(post.get('visibility'), 'public');
            assert.equal(post.get('custom_excerpt'), 'A website subtitle');
            assert.equal(
                post.get('feature_image'),
                'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/asset/file/12345678/image.png'
            );
            assert.equal(post.get('html'), '<p>Sample HTML here</p>');
            for (const field of ['published_at', 'updated_at', 'created_at']) {
                assert.equal(post.get(field).toISOString(), '2023-01-18T21:25:27.000Z');
            }
            assert.deepEqual(names(post.data.tags), [
                'Lorem Ipsum',
                'Dolor Simet',
                '#beehiiv',
                '#beehiiv-visibility-free'
            ]);
            assert.deepEqual(post.data.authors, []);
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/sample-post`)), '/sample-post/');
            // Both posts share their tags.
            assert.equal((context.db.stmts.countUsedTags.get() as any).count, 4);
        });
    });

    it('gives drafts the default author, sharing one author between them', async function () {
        await withExport(
            async context => {
                let posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => [post.get('status'), names(post.data.authors)]),
                    [
                        ['published', []],
                        ['draft', ['Author']],
                        ['draft', ['Author']]
                    ]
                );
                assert.equal(posts[1].data.authors[0].data.email, 'author@example.com');
                assert.equal((context.db.stmts.countUsedAuthors.get() as any).count, 1);

                // Changing the default author replays the stored rows.
                posts = await mapped(context, {defaultAuthorName: 'Jane Doe'});
                assert.deepEqual(names(posts[1].data.authors), ['Jane Doe']);
                assert.equal(posts[1].data.authors[0].data.slug, 'jane-doe');
                assert.equal(
                    posts[1].data.authors[0].ghostId,
                    ghostId('example.beehiiv.com', 'author', 'slug:jane-doe')
                );
            },
            [row('one'), row('two', {status: 'draft'}), row('three', {status: 'archived'})]
        );
    });

    it('maps audiences to visibility and visibility tags', async function () {
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => [post.get('visibility'), names(post.data.tags).slice(-1)[0]]),
                    [
                        ['members', '#beehiiv-visibility-both'],
                        ['paid', '#beehiiv-visibility-premium'],
                        ['public', '#beehiiv-visibility-free'],
                        ['public', '#beehiiv']
                    ]
                );
            },
            [
                row('one', {audience: 'both'}),
                row('two', {audience: 'premium'}),
                row('three', {audience: 'free'}),
                row('four', {audience: ''})
            ]
        );
        const columns = CSV_HEADER.map(column => (column === 'audience' ? 'web_audiences' : column));
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => post.get('visibility')),
                    ['paid', 'paid', 'public']
                );
                assert.equal(
                    names(posts[2].data.tags).slice(-1)[0],
                    '#beehiiv-visibility-all-free-subscribers-all-premium-subscribers'
                );
            },
            [
                row('one', {web_audiences: 'All premium subscribers'}),
                row('two', {web_audiences: 'All paid subscribers'}),
                row('three', {web_audiences: 'All free subscribers, All premium subscribers'})
            ],
            columns
        );
    });

    it('orders content tags before internal tags and skips empty tag names', async function () {
        await withExport(
            async context => {
                const [post] = await mapped(context);
                assert.deepEqual(names(post.data.tags), [
                    'News',
                    'Tech',
                    '#Secret',
                    '#beehiiv',
                    '#beehiiv-visibility-free'
                ]);
                assert.equal(post.data.tags[2].data.slug, 'hash-secret');
            },
            [row('one', {content_tags: 'News; #Secret; ;Tech'})]
        );
    });

    it('skips rows with more tags than Ghost allows', async function () {
        const tags = Array.from({length: 499}, (_, index) => `Tag ${index}`).join(';');
        await withExport(
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 1, imported: 0, skipped: 1});
                assert.equal(
                    events(context, 'record:skipped')[0].details.reason,
                    'Post exceeds Ghost tag relationship limit'
                );
            },
            [row('one', {content_tags: tags})]
        );
    });

    it('falls back to the title and then the id for slugs, and to a placeholder title', async function () {
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => [post.get('slug'), post.get('title')]),
                    [
                        ['a-title-only', 'A Title Only'],
                        ['no-title-id', '(Untitled)']
                    ]
                );
                // Posts without a URL have no old URL to redirect.
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/a-title-only`)), null);
            },
            [row('one', {url: '', web_title: 'A Title Only'}), row('no-title-id', {url: '', web_title: ''})]
        );
    });

    it('maps rows from a CSV without the optional columns', async function () {
        await withExport(
            async context => {
                const [post] = await mapped(context);
                assert.deepEqual(
                    [post.get('slug'), post.get('title'), post.get('html'), post.get('status')],
                    ['one', '(Untitled)', '', 'draft']
                );
                assert.deepEqual(names(post.data.tags), ['#beehiiv']);
            },
            [{id: 'one', created_at: '2024-01-01 00:00:00'}],
            ['id', 'created_at']
        );
        await withExport(
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 1, imported: 0, skipped: 1});
            },
            [{id: 'one'}],
            ['id']
        );
    });

    it('reads zoneless dates as UTC and skips rows with an invalid date', async function () {
        await withExport(
            async context => {
                const summary = await map({url: SITE}, context);
                assert.deepEqual(summary, {selected: 4, imported: 2, skipped: 2});
                const posts = await context.getAllPosts();
                assert.deepEqual(
                    posts.map(post => post.get('published_at').toISOString()),
                    ['2023-05-06T07:08:09.000Z', '2023-05-06T09:08:09.000Z']
                );
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => [event.details.row, event.details.reason]),
                    [
                        [3, 'Invalid beehiiv post date'],
                        [4, 'Invalid beehiiv post date']
                    ]
                );
            },
            [
                row('one', {created_at: '2023-05-06 07:08:09'}),
                row('two', {created_at: '2023-05-06T11:08:09+02:00'}),
                row('three', {created_at: 'yesterday'}),
                row('four', {created_at: ''})
            ]
        );
    });

    it('converts the email HTML with the content options and removes a duplicate feature image', async function () {
        const image = 'uploads/asset/file/1/image.png';
        const html = `<body><table><tr id="content-blocks"><td><table><tr><td><img src="https://media.beehiiv.com/cdn-cgi/image/fit=scale-down,format=auto,onerror=redirect,quality=80/${image}"></td></tr></table></td><td><p><a href="${SITE}/p/two?utm_source=email&amp;id=1">Two</a> <a href="${SITE}/subscribe">Join</a> <a href="${SITE}/p/one?comments=true">Comment</a></p></td></tr></table></body>`;
        await withExport(
            async context => {
                let [post] = await mapped(context, {subscribeLink: '/join', comments: true, commentLink: '#comments'});
                assert.equal(
                    post.get('html'),
                    `<p><a href="${SITE}/p/two?id=1">Two</a> <a href="/join">Join</a> <a href="#comments">Comment</a></p>`
                );
                [post] = await mapped(context, {comments: false});
                assert.equal(
                    post.get('html'),
                    `<p><a href="${SITE}/p/two?id=1">Two</a> <a href="${SITE}/subscribe">Join</a> </p>`
                );
            },
            [row('one', {content_html: html, thumbnail_url: image})]
        );
    });

    it('matches authors to Ghost users by email and suffixes around their slugs', async function () {
        await withExport(
            async context => {
                await map({url: SITE, defaultAuthorName: 'Ghost Writer'}, context, {
                    ghostUsers: [
                        {
                            id: '0123456789abcdef01234567',
                            slug: 'gw',
                            name: 'G. Writer',
                            email: 'Ghost-Writer@example.com',
                            roles: [{name: 'Super Editor'}]
                        } as any
                    ]
                });
                let [post] = await context.getAllPosts();
                const [author] = post.data.authors;
                assert.equal(author.ghostId, '0123456789abcdef01234567');
                assert.equal(author.data.slug, 'gw');
                assert.deepEqual(author.data.roles, ['Contributor']);
                assert.equal(events(context, 'operation:warning')[0].details.author, 'slug:ghost-writer');

                await map({url: SITE}, context, {
                    ghostUsers: (async function* () {
                        yield {id: 'aaaaaaaaaaaaaaaaaaaaaaaa', slug: 'author', name: 'Owner'} as any;
                    })()
                });
                [post] = await context.getAllPosts();
                assert.equal(post.data.authors[0].data.slug, 'author-2');
                assert.equal(events(context, 'slug:renamed').length, 1);
            },
            [row('one', {status: 'draft'})]
        );
    });

    it('keeps a matched Ghost user’s supported roles', async function () {
        // Without users there is nothing to remember.
        await rememberGhostUsers({} as any);
        await withExport(
            async context => {
                await map({url: SITE, defaultAuthorName: '👋'}, context, {
                    ghostUsers: [
                        {
                            id: '0123456789abcdef01234567',
                            slug: 'editor',
                            name: 'Editor',
                            email: 'author@example.com',
                            roles: [{name: 'Editor'}]
                        } as any
                    ]
                });
                const [post] = await context.getAllPosts();
                assert.deepEqual(post.data.authors[0].data.roles, ['Editor']);
                assert.equal(events(context, 'operation:warning').length, 0);
            },
            [row('one', {status: 'draft'})]
        );
    });

    it('needs completed source data and an HTTP site URL', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, context), /Ingest a complete beehiiv posts CSV/);
        } finally {
            await context.close();
        }
        await withExport(async context => {
            await assert.rejects(map({url: 'ftp://example.com'}, context), /HTTP or HTTPS URL/);
            await assert.rejects(map({} as BeehiivOptions, context), /HTTP or HTTPS URL/);
        });
    });
});

describe('Applying scraped beehiiv data', function () {
    it('sets scraped schema fields and adds the page’s authors', async function () {
        const context = await memoryContext();
        try {
            const post = new PostContext();
            post.set('title', 'Post');
            post.set('slug', 'post');
            post.set('created_at', new Date('2024-01-01T00:00:00Z'));
            applyScrapedData(
                post,
                {
                    meta_description: 'Description',
                    og_title: '',
                    twitter_title: null,
                    unknown: 'ignored',
                    authors: [
                        {data: {name: 'Jane Doe', slug: 'jane-doe', email: 'jane-doe@example.com'}},
                        {data: {name: 'John Smith'}}
                    ]
                },
                {url: `${SITE}/`}
            );
            assert.equal(post.get('meta_description'), 'Description');
            assert.equal(post.get('og_title'), null);
            assert.deepEqual(
                post.data.authors.map((author: any) => [author.data.slug, author.data.email, author.ghostId]),
                [
                    ['jane-doe', 'jane-doe@example.com', ghostId('example.beehiiv.com', 'author', 'slug:jane-doe')],
                    [
                        'john-smith',
                        'john-smith@example.com',
                        ghostId('example.beehiiv.com', 'author', 'slug:john-smith')
                    ]
                ]
            );
            applyScrapedData(post, {authors: [{data: {name: '👋'}}]}, {url: SITE});
            assert.equal(post.data.authors[2].data.slug, 'author');
            applyScrapedData(post, {}, {url: SITE});
            assert.equal(post.data.authors.length, 3);
        } finally {
            await context.close();
        }
    });
});
