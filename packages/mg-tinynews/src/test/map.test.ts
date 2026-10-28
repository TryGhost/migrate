import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {after, describe, it} from 'node:test';
import type {MigrateContext} from '@tryghost/mg-context';
import {ghostId, map, sourceUrl} from '../index.js';
import {
    article,
    cleanUp,
    events,
    fixtureInput,
    ingested,
    memoryContext,
    tempDirectory,
    writeExport
} from './helpers.js';

const SITE = 'demo-site.example.com';
const options = {url: 'https://demo-site.example.com/'};

async function exported(context: MigrateContext) {
    const [file] = await context.writeGhostJson(await tempDirectory(), {filename: 'ghost-import'});
    return JSON.parse(await readFile(file.path, 'utf8')).data;
}

/** Each post's slug with its authors' slugs and tags' names, in order. */
async function relations(context: MigrateContext): Promise<{slug: string; authors: string[]; tags: string[]}[]> {
    const data = await exported(context);
    return data.posts.map((post: any) => ({
        slug: post.slug,
        authors: data.posts_authors
            .filter((link: any) => link.post_id === post.id)
            .map((link: any) => data.users.find((user: any) => user.id === link.author_id).slug),
        tags: data.posts_tags
            .filter((link: any) => link.post_id === post.id)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((link: any) => data.tags.find((tag: any) => tag.id === link.tag_id).name)
    }));
}

describe('map', function () {
    after(cleanUp);

    it('maps articles, pages and newsletters with their authors, tags and links', async function () {
        const context = await ingested(fixtureInput());
        const summary = await map(options, context);
        assert.deepEqual(summary, {selected: 7, imported: 7, skipped: 0});

        const data = await exported(context);
        const readAt = new Date(context.sources.currentIngestion!.completedAt).toISOString();
        assert.deepEqual(
            data.posts.map((post: any) => [
                post.slug,
                post.title,
                post.type,
                post.status,
                post.published_at,
                post.updated_at
            ]),
            [
                [
                    'all-embeds-and-formatting',
                    'All embeds and Formatting',
                    'post',
                    'published',
                    '2023-03-24T19:45:24.257Z',
                    '2023-03-24T19:55:47.250Z'
                ],
                ['images', 'Images', 'post', 'published', '2022-10-17T17:16:29.349Z', '2023-03-24T20:03:04.911Z'],
                [
                    'all-embeds',
                    'All embeds',
                    'post',
                    'published',
                    '2023-04-07T22:31:28.725Z',
                    '2023-04-07T22:31:28.725Z'
                ],
                ['about', 'About us', 'page', 'published', '2022-01-05T10:00:00.000Z', '2022-02-01T12:30:00.000Z'],
                ['contact', 'Contact', 'page', 'draft', readAt, readAt],
                [
                    'weekly-roundup-1',
                    'Weekly roundup #1',
                    'post',
                    'published',
                    '2023-05-01T09:00:00.000Z',
                    '2023-05-01T09:00:00.000Z'
                ],
                [
                    'weekly-roundup-2',
                    'Weekly roundup #2',
                    'post',
                    'published',
                    '2023-05-08T09:00:00.000Z',
                    '2023-05-08T09:00:00.000Z'
                ]
            ]
        );
        const [first] = data.posts;
        assert.equal(first.id, ghostId(SITE, 'post', 'article:id:444'));
        assert.equal(first.html, '<p>Example text </p>');
        assert.equal(first.lexical, undefined);
        assert.equal(first.created_at, '2023-03-24T19:45:24.257Z');
        assert.equal(data.posts[5].created_at, '2023-04-30T15:00:00.000Z');

        assert.deepEqual(await relations(context), [
            {
                slug: 'all-embeds-and-formatting',
                authors: ['dolor-simet'],
                tags: ['test', 'embeds', 'Images', 'Testing', '#tinynews']
            },
            {slug: 'images', authors: ['author'], tags: ['community', '#tinynews']},
            {slug: 'all-embeds', authors: ['dolor-simet'], tags: ['community', '#tinynews']},
            {slug: 'about', authors: ['editor'], tags: ['#tinynews']},
            {slug: 'contact', authors: ['author'], tags: ['#tinynews']},
            {slug: 'weekly-roundup-1', authors: ['newsletter'], tags: ['#newsletter', '#tinynews']},
            {slug: 'weekly-roundup-2', authors: ['newsletter'], tags: ['#newsletter', '#tinynews']}
        ]);
        assert.deepEqual(
            data.users.map((user: any) => [
                user.id,
                user.slug,
                user.name,
                user.email,
                user.profile_image ?? null,
                user.bio ?? null
            ]),
            [
                [
                    ghostId(SITE, 'author', 'email:dolor@simet.com'),
                    'dolor-simet',
                    'Dolor Simet',
                    'dolor@simet.com',
                    'https://example.com/dolor.jpg',
                    'Lorem ipsum dolor simet'
                ],
                [ghostId(SITE, 'author', 'default'), 'author', 'Author', 'author@example.com', null, null],
                [
                    ghostId(SITE, 'author', 'email:editor@demo-site.example.com'),
                    'editor',
                    'editor',
                    'editor@demo-site.example.com',
                    null,
                    null
                ],
                [
                    ghostId(SITE, 'author', 'newsletter'),
                    'newsletter',
                    'Newsletter',
                    'newsletter@example.com',
                    null,
                    null
                ]
            ]
        );
        assert.deepEqual(
            data.tags.map((tag: any) => [tag.id, tag.slug]),
            [
                [ghostId(SITE, 'tag', 'test'), 'test'],
                [ghostId(SITE, 'tag', 'embeds'), 'embeds'],
                [ghostId(SITE, 'tag', 'images'), 'images'],
                [ghostId(SITE, 'tag', 'testing'), 'testing'],
                [ghostId(SITE, 'tag', 'hash-tinynews'), 'hash-tinynews'],
                [ghostId(SITE, 'tag', 'community'), 'community'],
                [ghostId(SITE, 'tag', 'hash-newsletter'), 'hash-newsletter']
            ]
        );
        assert.equal(context.findLink('demo-site.example.com/articles/community/images'), '/images/');
        assert.equal(context.findLink('demo-site.example.com/about'), '/about/');
        assert.equal(context.findLink('demo-site.example.com/newsletters/weekly-roundup-2'), '/weekly-roundup-2/');

        // The authors-file records that enriched an author are linked to it.
        const [dolor] = (await context.findAuthors({slug: 'dolor-simet'}))!;
        const linked = [];
        for await (const record of context.sources.recordsFor({type: 'author', id: dolor.dbId!})) {
            linked.push(record.key);
        }
        assert.deepEqual(linked, ['article:id:444', 'article:id:426', 'name:Dolor Simet']);
        await context.close();
    });

    it('uses the only author in the authors file for articles without an author', async function () {
        const context = await ingested(fixtureInput('author-single.json'));
        await map(options, context);

        const data = await exported(context);
        assert.deepEqual(
            (await relations(context)).slice(0, 3).map(post => post.authors),
            [['dolor-simet'], ['lorem-ipsum'], ['dolor-simet']]
        );
        assert.deepEqual(
            data.users.slice(0, 2).map((user: any) => [user.slug, user.email, user.profile_image ?? null]),
            [
                ['dolor-simet', 'dolor-simet@example.com', null],
                ['lorem-ipsum', 'lorem@ipsum.com', 'https://example.com/lorem.jpg']
            ]
        );
        await context.close();
    });

    it('keeps IDs across runs and remaps the stored export without a new read', async function () {
        const input = await writeExport({articles: [await article(1), await article(2)]});
        const context = await ingested(input);
        await map(options, context);
        const first = await exported(context);
        await map({url: 'https://demo-site.example.com'}, context);
        assert.deepEqual(await exported(context), first);

        await map({url: 'https://other.example.com'}, context);
        const other = await exported(context);
        assert.notEqual(other.posts[0].id, first.posts[0].id);
        assert.equal(context.findLink('demo-site.example.com/articles/news/article-1'), '/article-1/');
        await context.close();
    });

    it('skips items without a key, a translation, a published date, or with too many tags', async function () {
        const base = await article(1);
        const tags = Array.from({length: 500}, (_, index) => ({
            tag: {slug: `tag-${index}`, tag_translations: [{title: `Tag ${index}`}]}
        }));
        const context = await ingested(
            await writeExport({
                articles: [
                    base,
                    {...base, id: null, slug: null},
                    {...base, id: 2, translations: []},
                    {
                        ...base,
                        id: 3,
                        translations: [{...base.translations![0], first_published_at: null, last_published_at: 'never'}]
                    },
                    {...base, id: 4, tags}
                ],
                pages: [{id: 5}],
                newsletters: [
                    {id: 6, slug: 'undated'},
                    {slug: null, headline: null}
                ]
            })
        );
        const summary = await map(options, context);

        assert.deepEqual(summary, {selected: 8, imported: 1, skipped: 7});
        assert.deepEqual(
            events(context, 'record:skipped').map(event => [
                event.details.type,
                event.details.index,
                event.details.reason
            ]),
            [
                ['article', 1, 'Article has no id or slug'],
                ['article', 2, 'Article has no translation'],
                ['article', 3, 'Published article has no valid date'],
                ['article', 4, 'Post exceeds Ghost tag relationship limit'],
                ['page', 0, 'Page has no translation'],
                ['newsletter', 0, 'Published newsletter has no valid date'],
                ['newsletter', 1, 'Newsletter has no id or slug']
            ]
        );
        assert.equal(context.countWarnings(), 7);
        await context.close();
    });

    it('warns about content blocks it cannot convert', async function () {
        const base = await article(1);
        const context = await ingested(
            await writeExport({
                articles: [
                    {
                        ...base,
                        translations: [
                            {
                                ...base.translations![0],
                                content: [
                                    {type: 'text', style: 'NORMAL_TEXT', children: [{content: 'Kept', style: {}}]},
                                    {type: 'embed', link: 'https://unknown.example.com/embed'}
                                ]
                            }
                        ]
                    }
                ]
            })
        );
        await map(options, context);

        assert.equal((await exported(context)).posts[0].html, '<p>Kept </p>');
        assert.deepEqual(
            events(context, 'operation:warning').map(event => [event.details.type, event.details.reason]),
            [['article', 'Unhandled embed: https://unknown.example.com/embed']]
        );
        await context.close();
    });

    it('identifies authors by email or name and tags by slug', async function () {
        const base = await article(1);
        const person = (first_names: string, email: string | null = null) => ({
            author: [{author: {first_names, last_name: 'Smith', email}}]
        });
        const context = await ingested(
            await writeExport({
                articles: [
                    {...base, id: 1, ...person('José')},
                    {...base, id: 2, ...person('Jose')},
                    {...base, id: 3, ...person('Jo', 'shared@example.com')},
                    {...base, id: 4, ...person('Joanna', 'Shared@Example.com')},
                    {...base, id: 5, ...person('José')},
                    {
                        ...base,
                        id: 6,
                        author: [],
                        category: {slug: 'test', title: 'Renamed'},
                        tags: [{tag: {slug: 'test', tag_translations: [{title: 'Test tag'}]}}]
                    },
                    {...base, id: 7, author: [{author: {first_names: '???'}}]}
                ],
                // The only author in the authors file has no name, so it is not used.
                authors: [{email: 'nobody@example.com'}]
            })
        );
        await map(options, context);

        const data = await exported(context);
        assert.deepEqual(
            data.users.map((user: any) => [user.slug, user.name, user.email]),
            [
                ['jose-smith', 'José Smith', 'jose-smith@example.com'],
                ['jose-smith-2', 'Jose Smith', 'jose-smith-2@example.com'],
                ['jo-smith', 'Jo Smith', 'shared@example.com'],
                ['author', 'Author', 'author@example.com'],
                ['author-2', '???', 'author-2@example.com']
            ]
        );
        assert.deepEqual(
            (await relations(context)).map(post => [post.authors[0], post.tags[0]]),
            [
                ['jose-smith', 'test'],
                ['jose-smith-2', 'test'],
                ['jo-smith', 'test'],
                ['jo-smith', 'test'],
                ['jose-smith', 'test'],
                ['author', 'test'],
                ['author-2', 'test']
            ]
        );
        assert.deepEqual(
            events(context, 'slug:renamed')
                .filter(event => event.details.entityKind === 'author')
                .map(event => [event.details.oldSlug, event.details.newSlug]),
            [
                ['jose-smith', 'jose-smith-2'],
                ['author', 'author-2']
            ]
        );
        await context.close();
    });

    it('matches authors to Ghost users by email and reserves Ghost slugs', async function () {
        const base = await article(1);
        const context = await ingested(
            await writeExport({
                articles: [
                    {...base, id: 1},
                    {
                        ...base,
                        id: 2,
                        author: [],
                        translations: [{...base.translations![0], created_by_email: 'Owner@example.com'}]
                    },
                    {...base, id: 3, author: []},
                    {...base, id: 4, author: [{author: {first_names: 'Author'}}]}
                ]
            })
        );
        async function* ghostUsers() {
            yield {
                id: '0123456789abcdef01234567',
                slug: 'dolor-simet',
                name: 'Someone Else',
                email: 'else@example.com',
                roles: [{name: 'Editor'}]
            };
            yield {
                id: '0123456789abcdef01234568',
                slug: 'site-owner',
                name: 'Owner',
                email: 'owner@example.com',
                roles: [{name: 'Owner'}]
            };
            yield {
                id: '0123456789abcdef01234569',
                slug: 'default-author',
                name: 'Author',
                email: 'author@example.com',
                roles: [{name: 'Owner'}, {name: 'Editor'}]
            };
            yield {id: '0123456789abcdef0123456a', slug: 'no-email', name: 'No Email', email: '', roles: []};
        }
        await map(options, context, {ghostUsers: ghostUsers() as any});

        const data = await exported(context);
        assert.deepEqual(
            data.users.map((user: any) => [user.id, user.slug, user.email, user.roles]),
            [
                [
                    ghostId(SITE, 'author', 'name:Dolor Simet'),
                    'dolor-simet-2',
                    'dolor-simet-2@example.com',
                    ['Contributor']
                ],
                ['0123456789abcdef01234568', 'site-owner', 'owner@example.com', ['Contributor']],
                ['0123456789abcdef01234569', 'default-author', 'author@example.com', ['Editor']]
            ]
        );
        // The default author and an author named "Author" share the placeholder email, so they are one Ghost user.
        assert.deepEqual(
            (await relations(context)).map(post => post.authors),
            [['dolor-simet-2'], ['site-owner'], ['default-author'], ['default-author']]
        );
        assert.deepEqual(
            events(context, 'operation:warning').map(event => [event.details.author, event.details.reason]),
            [
                ['Owner', 'Unsupported author roles replaced by supported Ghost roles'],
                ['Author', 'Unsupported author roles replaced by supported Ghost roles']
            ]
        );
        await context.close();
    });

    it('needs completed source data and the site URL', async function () {
        const empty = await memoryContext();
        await assert.rejects(map(options, empty), /Ingest a complete Tiny News export before mapping/);
        await empty.close();

        const context = await ingested(await writeExport({articles: []}));
        await assert.rejects(map({}, context), /--url/);
        await assert.rejects(map({url: 'ftp://example.com'}, context), /HTTP or HTTPS/);
        assert.deepEqual(await map(options, context), {selected: 0, imported: 0, skipped: 0});
        await context.close();
    });

    it('gives each stored post its URL on the live site', async function () {
        const context = await ingested(fixtureInput());

        assert.equal(
            sourceUrl(options, context.sources.get('post', 'article:id:430')!),
            'https://demo-site.example.com/articles/community/images'
        );
        assert.equal(sourceUrl(options, context.sources.get('post', 'page:id:13')!), null);
        assert.equal(
            sourceUrl(options, context.sources.get('post', 'newsletter:id:4')!),
            'https://demo-site.example.com/newsletters/weekly-roundup-2'
        );
        await context.close();
    });
});
