import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {applyScrapedData, ghostId, map, postUrl} from '../index.js';
import type {SubstackOptions} from '../index.js';
import {CSV_HEADER, SITE, cleanUp, csvRow, events, fixtureFiles, ingested, memoryContext} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}

/** Map with `options` and return the mapped posts in record order. */
async function mapped(context: MigrateContext, options: Partial<SubstackOptions> = {}): Promise<PostContext[]> {
    await map({url: SITE, ...options}, context);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding the fixture export, or the given files. */
async function withExport(
    test: (context: MigrateContext) => Promise<void>,
    files?: Record<string, string>
): Promise<void> {
    const context = await ingested(files);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

describe('Mapping a Substack export', function () {
    after(cleanUp);

    it('maps posts, podcasts, drafts and pages with their fields, tags and links', async function () {
        await withExport(async context => {
            const summary = await map({url: `${SITE}/`}, context);
            assert.deepEqual(summary, {selected: 4, imported: 4, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => [post.get('slug'), post.get('type'), post.get('status')]),
                [
                    ['plain-text', 'post', 'published'],
                    ['podcast', 'post', 'published'],
                    ['draft-text', 'post', 'draft'],
                    ['about-us', 'page', 'published']
                ]
            );

            const [post] = posts;
            assert.equal(post.lookupKey, '123401.plain-text');
            assert.equal(post.ghostId, ghostId('example.substack.com', 'post', '123401.plain-text'));
            assert.equal(post.get('comment_id'), '123401');
            assert.equal(post.get('title'), 'Plain Text');
            assert.equal(post.get('custom_excerpt'), '“This quote’s rather short”');
            assert.equal(post.get('visibility'), 'public');
            for (const field of ['published_at', 'updated_at', 'created_at']) {
                assert.equal(post.get(field).toISOString(), '2019-07-26T20:48:19.814Z');
            }
            assert.deepEqual(names(post.data.tags), [
                'Newsletter',
                '#substack',
                '#substack-type-newsletter',
                '#substack-access-everyone'
            ]);
            assert.deepEqual(post.data.authors, []);
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/p/plain-text`)), '/plain-text/');

            // The CSV podcast URL becomes an audio card.
            assert.match(posts[1].get('html'), /^<div class="kg-card kg-audio-card">/);
            assert.deepEqual(names(posts[1].data.tags), [
                'Podcast',
                '#substack',
                '#substack-type-podcast',
                '#substack-access-everyone'
            ]);

            const sources = await all(context.sources.recordsFor({type: 'post', id: post.dbId!}));
            assert.deepEqual(sources.map(source => source.kind).sort(), ['html', 'post']);
        });
    });

    it('keeps Ghost IDs and slugs when mapping again', async function () {
        await withExport(async context => {
            const first = (await mapped(context)).map(post => [post.ghostId, post.get('slug')]);
            const tags = (await all(context.streamTags())).map(tag => [tag.ghostId, tag.data.slug]);
            const second = (await mapped(context)).map(post => [post.ghostId, post.get('slug')]);
            assert.deepEqual(second, first);
            assert.deepEqual(
                (await all(context.streamTags())).map(tag => [tag.ghostId, tag.data.slug]),
                tags
            );
            assert.equal(tags[0][0], ghostId('example.substack.com', 'tag', 'newsletter'));
        });
    });

    it('selects posts, pages, threads, podcasts and drafts', async function () {
        await withExport(async context => {
            const slugs = async (options: Partial<SubstackOptions>) =>
                (await mapped(context, options)).map(post => post.get('slug'));

            assert.deepEqual(await slugs({threads: true}), [
                'plain-text',
                'podcast',
                'thread',
                'draft-text',
                'about-us'
            ]);
            assert.deepEqual(await slugs({posts: true, podcasts: false, pages: false, drafts: false}), ['plain-text']);
            assert.deepEqual(await slugs({posts: false, podcasts: false, pages: true}), ['about-us']);
            assert.deepEqual(await slugs({posts: false, podcasts: false, pages: false, threads: true}), ['thread']);
            assert.deepEqual(await slugs({posts: false, podcasts: true, pages: false}), ['podcast']);
            assert.deepEqual(await slugs({drafts: false, pages: false, podcasts: false}), ['plain-text']);
            // Undefined options keep their defaults.
            assert.deepEqual(await slugs({posts: undefined, pages: false}), ['plain-text', 'podcast', 'draft-text']);
        });
    });

    it('selects posts by date', async function () {
        await withExport(async context => {
            const slugs = async (options: Partial<SubstackOptions>) =>
                (await mapped(context, {pages: false, ...options})).map(post => post.get('slug'));

            assert.deepEqual(await slugs({postsBefore: 'January 20, 2021'}), ['plain-text']);
            assert.deepEqual(await slugs({postsAfter: 'January 20, 2019', postsBefore: 'August 12, 2022'}), [
                'plain-text',
                'podcast'
            ]);
            assert.deepEqual(await slugs({postsAfter: 'August 12, 2022'}), ['podcast', 'draft-text']);
            await assert.rejects(map({url: SITE, postsAfter: 'not a date'}, context), /Invalid postsAfter date/);
        });
    });

    it('adds a custom tag and leaves out platform, type and access tags on request', async function () {
        await withExport(async context => {
            const tags = async (options: Partial<SubstackOptions>) =>
                names((await mapped(context, options))[0].data.tags);

            assert.deepEqual(await tags({addTag: ' Hello World '}), [
                'Newsletter',
                'Hello World',
                '#substack',
                '#substack-type-newsletter',
                '#substack-access-everyone'
            ]);
            assert.deepEqual(await tags({addPlatformTag: false}), [
                'Newsletter',
                '#substack-type-newsletter',
                '#substack-access-everyone'
            ]);
            assert.deepEqual(await tags({addTypeTag: false}), ['Newsletter', '#substack', '#substack-access-everyone']);
            assert.deepEqual(await tags({addAccessTag: false}), [
                'Newsletter',
                '#substack',
                '#substack-type-newsletter'
            ]);
            assert.deepEqual(
                await tags({addTag: '#Migrated', addPlatformTag: false, addTypeTag: false, addAccessTag: false}),
                ['Newsletter', '#Migrated']
            );
            assert.ok(await context.findTags({slug: 'hash-migrated'}));
            assert.deepEqual(await tags({addTag: ' ', addPlatformTag: false, addTypeTag: false, addAccessTag: false}), [
                'Newsletter'
            ]);
        });
    });

    it('authors posts as the --email user, matching an existing Ghost user', async function () {
        await withExport(async context => {
            const options = {url: SITE, pages: false, email: 'exampleuser@email.com', useMetaAuthor: false};
            await map(options, context);
            let posts = await context.getAllPosts();
            assert.equal(posts.length, 3);
            for (const post of posts) {
                assert.deepEqual(
                    post.data.authors.map((author: any) => [author.data.slug, author.data.email, author.data.name]),
                    [['exampleuser', 'exampleuser@email.com', 'Exampleuser']]
                );
            }
            const [author] = await all(context.streamAuthors());
            assert.equal(author.ghostId, ghostId('example.substack.com', 'author', 'email:exampleuser@email.com'));

            // The email author is ignored when authors come from ld+json.
            assert.deepEqual((await mapped(context, {email: 'exampleuser@email.com'}))[0].data.authors, []);

            const ghostUser = (roles: string[]) => ({
                id: '0123456789abcdef01234567',
                slug: 'existing',
                name: 'Existing User',
                email: 'ExampleUser@email.com',
                roles: roles.map(name => ({name}))
            });
            for (const [roles, expected, warnings] of [
                [['Editor'], ['Editor'], 0],
                [['Owner'], ['Contributor'], 1],
                [['Owner', 'Administrator'], ['Administrator'], 1]
            ] as const) {
                await map(options, context, {ghostUsers: [ghostUser([...roles]) as any]});
                posts = await context.getAllPosts();
                const [matched] = posts[0].data.authors;
                assert.equal(matched.ghostId, '0123456789abcdef01234567');
                assert.equal(matched.data.slug, 'existing');
                assert.deepEqual(matched.data.roles, expected);
                assert.equal(events(context, 'operation:warning').length, warnings);
            }

            // A Ghost user's slug is reserved for that user.
            await map(options, context, {
                ghostUsers: [{...ghostUser(['Editor']), slug: 'exampleuser', email: 'someone@else.com'} as any]
            });
            posts = await context.getAllPosts();
            assert.equal(posts[0].data.authors[0].data.slug, 'exampleuser-2');
            assert.equal(events(context, 'slug:renamed')[0].details.newSlug, 'exampleuser-2');
        });
    });

    it('skips rows without HTML, an ID or a valid date, and dates undated drafts when the export was read', async function () {
        const files = await fixtureFiles();
        files['posts.csv'] = [
            CSV_HEADER,
            csvRow({post_id: '1.no-html', type: 'newsletter', is_published: 'true', post_date: '2024-01-01'}),
            csvRow({post_id: '2.bad-date', type: 'newsletter', is_published: 'true', post_date: 'yesterday'}),
            csvRow({title: 'No ID', type: 'newsletter', is_published: 'true'}),
            csvRow({post_id: '3.undated', type: 'newsletter', is_published: 'false'}),
            csvRow({post_id: '4.zoneless', type: 'newsletter', is_published: 'true', post_date: '2024-02-03 04:05:06'}),
            csvRow({post_id: '5.paid', type: 'newsletter', is_published: 'true', audience: 'only_paid'}),
            csvRow({post_id: '6.members', type: 'restack', is_published: 'true', audience: 'only_free'}),
            ''
        ].join('\n');
        for (const name of ['2.bad-date', '3.undated', '4.zoneless', '5.paid', '6.members']) {
            files[`posts/${name}.html`] = '<p>Text</p>';
        }
        await withExport(async context => {
            const summary = await map({url: SITE}, context);
            assert.deepEqual(summary, {selected: 7, imported: 4, skipped: 3});
            assert.deepEqual(
                events(context, 'record:skipped').map(event => event.details.reason),
                ['No HTML file in the export for this post', 'Invalid Substack post date', 'Row has no post_id']
            );
            const posts = await context.getAllPosts();
            const readAt = context.sources.currentIngestion!.completedAt;
            assert.deepEqual(
                posts.map(post => [
                    post.get('slug'),
                    post.get('title'),
                    post.get('published_at').toISOString(),
                    post.get('visibility')
                ]),
                [
                    ['undated', 'undated', readAt, 'public'],
                    ['zoneless', 'zoneless', '2024-02-03T04:05:06.000Z', 'public'],
                    ['paid', 'paid', readAt, 'paid'],
                    ['members', 'members', readAt, 'members']
                ]
            );
            assert.equal(posts[0].get('custom_excerpt'), null);
            assert.deepEqual(names(posts[3].data.tags).slice(0, 1), ['Restack']);

            // Date bounds leave undated posts out.
            const bounded = await mapped(context, {postsBefore: '2030-01-01'});
            assert.deepEqual(
                bounded.map(post => post.get('slug')),
                ['zoneless']
            );
        }, files);
    });

    it('maps a row from a posts.csv with only a post_id column as an untyped draft', async function () {
        await withExport(
            async context => {
                const [post] = await mapped(context);
                assert.equal(post.get('status'), 'draft');
                assert.equal(post.get('type'), 'post');
                assert.deepEqual(names(post.data.tags), ['#substack', '#substack-type-', '#substack-access-']);
            },
            {'posts.csv': 'post_id\n7.minimal\n', 'posts/7.minimal.html': '<p>Minimal</p>'}
        );
    });

    it('requires completed source data and a site URL', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, context), /Ingest a complete Substack export/);
        } finally {
            await context.close();
        }
        await withExport(async ready => {
            for (const url of [undefined, 'example.com', 'ftp://example.com']) {
                await assert.rejects(map({url} as any, ready), /site URL \(--url\)/);
            }
        });
        assert.equal(postUrl({post_id: '12.my-post'}, `${SITE}//`), `${SITE}/p/my-post`);
    });
});

describe('Applying scraped data to a mapped post', function () {
    after(cleanUp);

    const scrapeInto = async (context: MigrateContext, scraped: Record<string, any>, options = {}) => {
        await context.forEachPost(async post => {
            if (post.lookupKey === '123401.plain-text') {
                applyScrapedData(post, structuredClone(scraped), context, {url: SITE, ...options});
            }
        });
        return (await context.getAllPosts())[0];
    };

    it('places scraped tags first and adds scraped authors and metadata', async function () {
        await withExport(async context => {
            await map({url: SITE, addTag: 'Testing'}, context);
            const post = await scrapeInto(context, {
                meta_title: 'Meta title',
                og_title: '',
                twitter_title: null,
                podcast_audio_src: undefined,
                scripts: 'not a post field',
                tags: [
                    {url: '/substack-section/tech', data: {name: 'Tech', slug: 'tech'}},
                    {url: '/substack-tag/testing', data: {name: 'Testing', slug: 'testing'}},
                    {url: '/substack-tag/tech', data: {name: 'Tech again', slug: 'tech'}},
                    {url: '/substack-tag/blank', data: {name: ' ', slug: 'blank'}},
                    {url: '/substack-tag/internal', data: {name: '#Internal', slug: 'internal'}}
                ],
                authors: [
                    {
                        url: 'https://substack.com/@writer',
                        data: {
                            name: 'Writer',
                            slug: 'writer',
                            email: 'writer@example.com',
                            profile_image: 'https://x/y.jpg'
                        }
                    },
                    {url: 'https://substack.com/@other', data: {name: 'Other', slug: 'other'}}
                ]
            });
            assert.equal(post.get('meta_title'), 'Meta title');
            assert.equal(post.get('og_title'), null);
            assert.deepEqual(names(post.data.tags), [
                'Tech',
                'Testing',
                'Newsletter',
                '#Internal',
                '#substack',
                '#substack-type-newsletter',
                '#substack-access-everyone'
            ]);
            assert.deepEqual(
                post.data.authors.map((author: any) => [
                    author.data.slug,
                    author.data.email,
                    author.data.profile_image
                ]),
                [
                    ['writer', 'writer@example.com', 'https://x/y.jpg'],
                    ['other', 'other@example.com', null]
                ]
            );
            assert.equal(post.data.authors[0].ghostId, ghostId('example.substack.com', 'author', 'slug:writer'));
            assert.equal(post.data.tags[0].ghostId, ghostId('example.substack.com', 'tag', 'tech'));
        });
    });

    it('converts the HTML again with the scraped og:image and podcast audio', async function () {
        const image = 'https://substack-post-media.s3.amazonaws.com/public/images/first_1024x768.jpg';
        const files = await fixtureFiles();
        files['posts/123401.plain-text.html'] =
            `<figure><img src="${image}"><figcaption>Caption</figcaption></figure><p>Body</p>`;
        await withExport(async context => {
            await map({url: SITE}, context);
            let post = (await context.getAllPosts())[0];
            assert.equal(post.get('feature_image'), image);
            assert.equal(post.get('feature_image_caption'), 'Caption');

            // An og:image of the first image keeps it as the feature image.
            post = await scrapeInto(context, {og_image: image.replace('_1024x768', '_1200x600')});
            assert.equal(post.get('feature_image'), image.replace('_1024x768', '_1200x600'));
            assert.equal(post.get('feature_image_caption'), 'Caption');
            assert.equal(post.get('html'), '<p>Body</p>');

            // A different og:image is the feature image, and the first image stays in the content.
            await map({url: SITE}, context);
            post = await scrapeInto(context, {og_image: 'https://example.com/og.jpg'});
            assert.equal(post.get('og_image'), 'https://example.com/og.jpg');
            assert.equal(post.get('feature_image'), 'https://example.com/og.jpg');
            assert.equal(post.get('feature_image_caption'), null);
            assert.match(post.get('html'), /^<figure><img/);

            await map({url: SITE}, context);
            post = await scrapeInto(context, {podcast_audio_src: 'https://api.substack.com/audio.mp3'});
            assert.match(post.get('html'), /^<div class="kg-card kg-audio-card">.*audio\.mp3/);
            assert.equal(post.get('feature_image'), image);
        }, files);
    });
});
