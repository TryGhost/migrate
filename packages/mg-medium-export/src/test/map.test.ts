import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext} from '@tryghost/mg-context';
import type {PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {applyScrapedData, ghostId, map} from '../index.js';
import type {MediumOptions} from '../index.js';
import {
    cleanUp,
    events,
    fixture,
    ingested,
    makeZip,
    memoryContext,
    postPage,
    profilePage,
    tempDirectory
} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);
const link = (context: MigrateContext, url: string) => context.findLink(stringUtils.cleanURL(url));

async function fixtureExport(): Promise<Record<string, string>> {
    return {
        'profile/profile.html': profilePage(),
        'posts/2018-08-11_Basic-efefef121212.html': await fixture('posts/basic-post.html'),
        'posts/2024-06-03_Comment-a1b2c3d4e5f6.html': await fixture('posts/comment.html'),
        'posts/draft_Blog-Post-Title-ababab121212.html': await fixture('posts/draft-post.html')
    };
}

/** Map with `options` and return the mapped posts in record order. */
async function mapped(context: MigrateContext, options: MediumOptions = {}, services = {}): Promise<PostContext[]> {
    await map(options, context, services);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding the ingested export at `input`, or a zip of these files. */
async function withExport(
    input: string | Record<string, string>,
    test: (context: MigrateContext) => Promise<void>
): Promise<void> {
    const context = await ingested(input);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

describe('Mapping a Medium export', function () {
    after(cleanUp);

    it('requires completed source data', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest a complete Medium export before mapping/);
        } finally {
            await context.close();
        }
    });

    it('maps posts, drafts and possible comments with their fields, tags, authors and links', async function () {
        await withExport(await fixtureExport(), async context => {
            const summary = await map({}, context);
            assert.deepEqual(summary, {selected: 3, imported: 3, skipped: 0});
            const readAt = new Date(context.sources.currentIngestion!.completedAt);
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => [post.get('slug'), post.get('status'), post.lookupKey]),
                [
                    ['testpost', 'published', 'posts/2018-08-11_Basic-efefef121212.html'],
                    ['and-this-is-what-a-comment-looks-like', 'draft', 'posts/2024-06-03_Comment-a1b2c3d4e5f6.html'],
                    ['blog-post-title', 'draft', 'posts/draft_Blog-Post-Title-ababab121212.html']
                ]
            );

            const [post, comment, draft] = posts;
            assert.equal(post.ghostId, ghostId('post', 'efefef12121212'));
            assert.equal(post.get('title'), 'Basic Post Title');
            assert.equal(post.get('custom_excerpt'), 'This is a subtitle of some sort');
            assert.equal(post.get('comment_id'), 'efefef12121212');
            assert.equal(post.get('canonical_url'), null);
            assert.match(post.get('html'), /^<section name="007"/);
            for (const field of ['created_at', 'updated_at', 'published_at']) {
                assert.equal(post.get(field).toISOString(), '2018-08-11T11:23:34.123Z');
            }
            assert.deepEqual(names(post.data.tags), ['Things', 'Stuff', '#medium']);
            assert.deepEqual(
                post.data.tags.map((tag: any) => tag.ghostId),
                [ghostId('tag', 'things'), ghostId('tag', 'stuff'), ghostId('tag', 'hash-medium')]
            );
            assert.deepEqual(names(comment.data.tags), ['#medium', '#Medium Possible Comment']);
            assert.equal(comment.get('published_at').toISOString(), '2024-06-03T09:41:57.629Z');

            // Drafts are dated when the export was read.
            assert.equal(draft.get('created_at').toISOString(), readAt.toISOString());
            assert.equal(draft.get('updated_at').toISOString(), readAt.toISOString());
            assert.equal(draft.get('published_at'), null);

            // The profile shares the posts' author handle, so it is one author with the profile's details, and
            // it also writes the draft, which names no author.
            for (const item of posts) {
                assert.deepEqual(names(item.data.authors), ['Joe Bloggs']);
            }
            const [author] = post.data.authors;
            assert.equal(author.ghostId, ghostId('author', 'handle:joebloggs'));
            assert.deepEqual(
                [
                    author.data.slug,
                    author.data.email,
                    author.data.profile_image,
                    author.data.twitter,
                    author.data.roles
                ],
                [
                    'joebloggs',
                    'joe@example.org',
                    'https://cdn-images-1.medium.com/joe.jpeg',
                    '@JoeBloggs',
                    ['Contributor']
                ]
            );
            assert.equal((context.db.stmts.countUsedAuthors.get() as {count: number}).count, 1);
            const profile = context.sources.get('profile', 'export.zip')!;
            const linked = [];
            for await (const record of context.sources.recordsFor({type: 'author', id: author.dbId!})) {
                linked.push(record.id);
            }
            assert.ok(linked.includes(profile.id));

            assert.equal(link(context, 'https://medium.com/@JoeBloggs/testpost-efefef12121212'), '/testpost/');
            assert.equal(link(context, 'https://medium.com/p/efefef12121212'), '/testpost/');
            assert.equal(link(context, 'https://medium.com/p/ababab121212'), '/blog-post-title/');
            assert.equal(link(context, 'https://medium.com/tag/things'), '/tag/things/');
            assert.equal(link(context, 'https://medium.com/@JoeBloggs'), '/author/joebloggs/');
            assert.equal(link(context, 'migrator-added-platform-tag'), null);

            // Remapping keeps the same Ghost IDs and dates.
            const again = await mapped(context);
            assert.deepEqual(
                again.map(item => [item.ghostId, item.get('created_at').toISOString()]),
                posts.map(item => [item.ghostId, item.get('created_at').toISOString()])
            );
        });
    });

    it('applies tag, canonical and email options when remapping stored records', async function () {
        await withExport(
            {
                'posts/2020-01-01_One-abc123.html': postPage({
                    canonical: 'https://medium.com/@writer/one-abc123',
                    author: {name: 'A Writer', url: 'https://medium.com/@Writer'},
                    tags: ['Travel', '']
                }),
                'posts/2020-01-02_Two-def456.html': postPage({
                    canonical: 'https://medium.com/@writer/two-def456',
                    body: '<figure><img src="https://cdn-images-1.medium.com/top.jpeg" alt="Top"></figure><h3>Heading</h3>',
                    author: {name: 'Unlinked Writer', url: 'https://example.com/unlinked'}
                })
            },
            async context => {
                let [one, two] = await mapped(context);
                assert.deepEqual(names(one.data.tags), ['Travel', '#medium']);
                assert.deepEqual(names(two.data.tags), ['#medium', '#auto-feature-image']);
                assert.equal(two.get('feature_image'), 'https://cdn-images-1.medium.com/top.jpeg');
                assert.equal(two.get('feature_image_alt'), 'Top');
                assert.equal(two.get('feature_image_caption'), null);
                assert.deepEqual(
                    [one.data.authors[0].data.slug, one.data.authors[0].data.name, one.data.authors[0].data.email],
                    ['writer', 'A Writer', 'writer@example.com']
                );
                assert.deepEqual(
                    [two.data.authors[0].data.slug, two.data.authors[0].ghostId],
                    ['unlinked-writer', ghostId('author', 'name:Unlinked Writer')]
                );

                [one, two] = await mapped(context, {
                    addTag: 'My Tag',
                    addPlatformTag: false,
                    mediumAsCanonical: true,
                    email: 'mycompany.com'
                });
                assert.deepEqual(names(one.data.tags), ['My Tag', 'Travel']);
                assert.deepEqual(names(two.data.tags), ['My Tag']);
                assert.equal(one.get('canonical_url'), 'https://medium.com/@writer/one-abc123');
                assert.equal(one.data.authors[0].data.email, 'writer@mycompany.com');
            }
        );
    });

    it('authors posts without an author link from the profile in their zip, or the only profile', async function () {
        const draft = (title: string) => postPage({title, author: null});
        const directory = await tempDirectory();
        await makeZip(
            {'profile/profile.html': profilePage(), 'posts/draft_A-abc1.html': draft('A')},
            {directory, name: 'a.zip'}
        );
        await makeZip({'posts/draft_B-abc2.html': draft('B')}, {directory, name: 'b.zip'});
        await withExport(directory, async context => {
            const posts = await mapped(context);
            assert.deepEqual(
                posts.map(post => names(post.data.authors)),
                [['Joe Bloggs'], ['Joe Bloggs']]
            );
        });

        // With two profiles, a zip without one has no author to fall back on.
        await makeZip(
            {
                'profile/profile.html': profilePage({name: '', handle: null, email: null}),
                'posts/draft_C-abc3.html': draft('C')
            },
            {directory, name: 'c.zip'}
        );
        await withExport(directory, async context => {
            const posts = await mapped(context);
            assert.deepEqual(
                posts.map(post => post.data.authors.map((author: any) => [author.data.name, author.data.slug])),
                [[['Joe Bloggs', 'joebloggs']], [], [['Example User', 'example-user']]]
            );
            assert.equal(posts[2].data.authors[0].ghostId, ghostId('author', 'profile:c.zip'));
        });
    });

    it('names a profile author without a name after its handle, and ignores a second profile with the handle', async function () {
        const directory = await tempDirectory();
        await makeZip(
            {'profile/profile.html': profilePage({name: ''}), 'posts/draft_A-abc1.html': postPage({author: null})},
            {directory, name: 'a.zip'}
        );
        await makeZip({'profile/profile.html': profilePage({name: 'Second'})}, {directory, name: 'b.zip'});
        await withExport(directory, async context => {
            const [post] = await mapped(context, {}, {});
            assert.deepEqual(names(post.data.authors), ['Joebloggs']);
        });
    });

    it('matches authors to Ghost users by email and reserves Ghost user slugs', async function () {
        await withExport(await fixtureExport(), async context => {
            const ghostUser = (roles: any[]) => ({
                id: '0123456789abcdef01234567',
                slug: 'existing',
                name: 'Existing User',
                email: 'JOE@example.org',
                roles
            });
            for (const [roles, expected, warnings] of [
                [[{name: 'Editor'}], ['Editor'], 0],
                [['Owner'], ['Contributor'], 1]
            ] as const) {
                const [post] = await mapped(context, {}, {ghostUsers: [ghostUser([...roles]) as any]});
                const [matched] = post.data.authors;
                assert.equal(matched.ghostId, '0123456789abcdef01234567');
                assert.equal(matched.data.slug, 'existing');
                assert.deepEqual(matched.data.roles, expected);
                assert.equal(events(context, 'operation:warning').length, warnings);
            }

            const [post] = await mapped(
                context,
                {},
                {
                    ghostUsers: [{...ghostUser(['Editor']), slug: 'joebloggs', email: undefined} as any]
                }
            );
            assert.equal(post.data.authors[0].data.slug, 'joebloggs-2');
            assert.equal(events(context, 'slug:renamed')[0].details.newSlug, 'joebloggs-2');
        });
    });

    it('skips posts without an ID, with an invalid date, or repeating a Medium post', async function () {
        const directory = await tempDirectory();
        await makeZip(
            {
                'posts/2020-01-01_One-abc123.html': postPage({canonical: 'https://medium.com/@a/one-abc123'}),
                'posts/2020-01-02_Bad-Date-def456.html': postPage({date: 'yesterday'}),
                'posts/no-id.html': postPage(),
                'posts/2020-01-03_-fed789.html': postPage({title: ''})
            },
            {directory, name: 'a.zip'}
        );
        await makeZip(
            {'posts/2020-01-01_One-Renamed-abc123.html': postPage({canonical: 'https://medium.com/@a/one-abc123'})},
            {directory, name: 'b.zip'}
        );
        await withExport(directory, async context => {
            const summary = await map({}, context);
            assert.deepEqual(summary, {selected: 5, imported: 2, skipped: 3});
            const posts = await context.getAllPosts();
            assert.deepEqual(posts.map(post => [post.get('slug'), post.get('title')]).sort(), [
                ['fed789', '(Untitled)'],
                ['one', 'A Post']
            ]);
            assert.deepEqual(
                events(context, 'record:skipped')
                    .map(event => event.details.reason)
                    .sort(),
                [
                    'Invalid Medium publish date',
                    'No Medium post ID in the canonical URL or file name',
                    'posts/2020-01-01_One-abc123.html is the same Medium post (abc123) and is imported instead'
                ]
            );
        });
    });
});

describe('Applying scraped Medium data', function () {
    after(cleanUp);

    it('sets metadata, adds scraped tags and fills a missing author image', async function () {
        await withExport(
            {
                'profile/profile.html': profilePage({
                    name: 'Owner',
                    handle: 'Owner',
                    photo: 'https://cdn-images-1.medium.com/owner.jpeg'
                }),
                'posts/2020-01-01_One-abc123.html': postPage({
                    canonical: 'https://medium.com/@joebloggs/one-abc123',
                    tags: ['Travel']
                }),
                'posts/2020-01-02_Two-def456.html': postPage({
                    canonical: 'https://medium.com/@owner/two-def456',
                    author: {name: 'Owner', url: 'https://medium.com/@Owner'}
                }),
                'posts/2020-01-03_Three-fed789.html': postPage({
                    canonical: 'https://medium.com/@x/three-fed789',
                    author: null
                })
            },
            async context => {
                await map({}, context);
                await context.forEachPost(async post => {
                    applyScrapedData(
                        post,
                        {
                            meta_description: 'Scraped description',
                            og_image: '',
                            twitter_title: null,
                            not_a_field: 'ignored',
                            tags: [
                                {url: 'https://medium.com/tag/scraped', name: 'Scraped', slug: 'scraped'},
                                {name: ' '},
                                {slug: 'nameless'} as any,
                                {name: 'Travel', slug: 'travel'}
                            ],
                            author: {profile_image: 'https://cdn-images-1.medium.com/scraped.jpeg'}
                        },
                        context
                    );
                });
                const [one, two, three] = await context.getAllPosts();
                assert.equal(one.get('meta_description'), 'Scraped description');
                assert.equal(one.get('og_image'), null);
                assert.deepEqual(names(one.data.tags), ['Travel', 'Scraped', '#medium']);
                assert.equal(link(context, 'https://medium.com/tag/scraped'), '/tag/scraped/');
                assert.equal(one.data.authors[0].data.profile_image, 'https://cdn-images-1.medium.com/scraped.jpeg');
                assert.equal(two.data.authors[0].data.profile_image, 'https://cdn-images-1.medium.com/owner.jpeg');
                assert.deepEqual(names(three.data.authors), ['Owner']);

                // Nothing to add leaves the post as it was.
                await context.forEachPost(async post => applyScrapedData(post, {}, context));
                const [unchanged] = await context.getAllPosts();
                assert.deepEqual(names(unchanged.data.tags), ['Travel', 'Scraped', '#medium']);
            }
        );
    });

    it('leaves posts without an author unchanged', async function () {
        await withExport({'posts/2020-01-01_One-abc123.html': postPage({author: null})}, async context => {
            await map({}, context);
            await context.forEachPost(async post =>
                applyScrapedData(post, {author: {profile_image: 'https://cdn-images-1.medium.com/x.jpeg'}}, context)
            );
            const [post] = await context.getAllPosts();
            assert.deepEqual(post.data.authors, []);
        });
    });
});
