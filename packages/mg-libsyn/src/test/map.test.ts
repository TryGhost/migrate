import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {stringUtils} from '@tryghost/mg-utils';
import {ghostId, map} from '../index.js';
import type {LibsynChannel, LibsynItem, LibsynOptions} from '../index.js';
import {SITE, all, events, fixtureChannel, fixtureItems, memoryContext, stored} from './helpers.js';

const names = (items: any[]) => items.map(item => item.data.name);

/** Run `test` against a fresh context holding the items and channel. */
async function withFeed(
    items: LibsynItem[],
    test: (context: MigrateContext) => Promise<void>,
    channel: LibsynChannel | null = fixtureChannel()
) {
    const context = await stored(items, channel);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

const item = (id: string, values: Partial<LibsynItem> = {}): LibsynItem => ({
    ...fixtureItems()[0],
    title: `Episode ${id}`,
    guid: {'@_isPermaLink': 'false', '#text': `guid-${id}`},
    ...values
});

/** Map one item with these values, options and channel. */
async function mappedPost(
    values: Partial<LibsynItem> = {},
    options: LibsynOptions = {},
    channel: LibsynChannel = fixtureChannel()
): Promise<PostContext> {
    let post: PostContext;
    await withFeed(
        [item('1', values)],
        async context => {
            await map({url: SITE, ...options}, context);
            [post] = await context.getAllPosts();
        },
        channel
    );
    return post!;
}

const ghostUser = (values: Partial<GhostUser> = {}): GhostUser => ({
    id: '64f1a2b3c4d5e6f708192a3b',
    slug: 'ghost-person',
    name: 'Ghost Person',
    email: 'person@example.com',
    roles: [{name: 'Editor'}],
    ...values
});

describe('Mapping a Libsyn feed', function () {
    it('maps the fixture feed to posts, tags, an author and links', async function () {
        await withFeed(fixtureItems(), async context => {
            const summary = await map({url: `${SITE}/`}, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
            const [lorem, dolor] = await context.getAllPosts();

            assert.equal(lorem.lookupKey, 'guid:abcd1234-f43c-407f-b3d7-01245e0e890f');
            assert.equal(lorem.ghostId, ghostId('example.com', 'post', 'guid:abcd1234-f43c-407f-b3d7-01245e0e890f'));
            assert.equal(lorem.get('title'), 'Lorem Ipsum');
            assert.equal(lorem.get('slug'), 'lorem-ipsum');
            assert.equal(lorem.get('status'), 'published');
            assert.equal(lorem.get('visibility'), 'public');
            assert.equal(lorem.get('type'), 'post');
            for (const field of ['created_at', 'published_at', 'updated_at']) {
                assert.deepEqual(lorem.get(field), new Date('2020-08-10T07:00:00.000Z'));
            }
            assert.deepEqual(dolor.get('published_at'), new Date('2020-07-13T07:00:00.000Z'));
            assert.match(lorem.get('html'), /^<!--kg-card-begin: html--><iframe id="embed_12345678"/);
            assert.match(lorem.get('html'), /<p>Description<\/p>$/);
            assert.deepEqual(names(lorem.data.tags), [
                'Business',
                'Careers',
                'Education',
                'Self-Improvement',
                'exmaple',
                'keywords',
                '#libsyn'
            ]);
            assert.equal(lorem.data.tags[0].ghostId, ghostId('example.com', 'tag', 'slug:business'));
            assert.equal(dolor.data.tags[0].dbId, lorem.data.tags[0].dbId);

            const [author] = lorem.data.authors;
            assert.equal(author.data.name, 'Example User');
            assert.equal(author.data.slug, 'example-user');
            assert.equal(author.data.email, 'person@example.com');
            assert.deepEqual(author.data.roles, ['Contributor']);
            assert.equal(author.ghostId, ghostId('example.com', 'author', 'owner'));
            assert.equal(dolor.data.authors[0].dbId, author.dbId);

            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/lorem-ipsum`)), '/lorem-ipsum/');
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/dolor-simet`)), '/dolor-simet/');

            const linked = async (kind: string, key: string) => {
                const record = context.sources.get(kind, key)!;
                return (await all(context.sources.entitiesFor(record.id))).map(entity => entity.type).sort();
            };
            assert.deepEqual(await linked('item', lorem.lookupKey!), ['author', 'post', ...Array(7).fill('tag')]);
            assert.deepEqual(await linked('channel', 'channel'), ['author']);
        });
    });

    it('applies options when remapping the stored feed', async function () {
        await withFeed([item('1')], async context => {
            await map({url: SITE}, context);
            const summary = await map(
                {url: SITE, addTag: 'My Podcast', useFeedCategories: false, useItemKeywords: false, useEmbed: false},
                context
            );
            assert.deepEqual(summary, {selected: 1, imported: 1, skipped: 0});
            const [post] = await context.getAllPosts();
            assert.deepEqual(names(post.data.tags), ['My Podcast', '#libsyn']);
            assert.match(post.get('html'), /^<div class="kg-card kg-audio-card">/);
        });
    });

    it('skips items without a key, a valid date, or within the tag limit', async function () {
        const keywords = Array.from({length: 500}, (_, index) => `keyword ${index}`).join(',');
        await withFeed(
            [
                item('1'),
                item('2', {guid: undefined, link: undefined}),
                item('3', {pubDate: 'Mon, 10 Aug 2020'}),
                item('4', {pubDate: undefined}),
                item('5', {'itunes:keywords': keywords})
            ],
            async context => {
                assert.deepEqual(await map({url: SITE}, context), {selected: 5, imported: 1, skipped: 4});
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    [
                        'Item has neither a GUID nor a link',
                        'Invalid Libsyn item date',
                        'Invalid Libsyn item date',
                        'Post exceeds Ghost tag relationship limit'
                    ]
                );
                assert.deepEqual(
                    (await context.getAllPosts()).map(post => post.get('slug')),
                    ['episode-1']
                );
            }
        );
    });

    it('keeps untitled episodes and episodes with the same title', async function () {
        await withFeed(
            [item('1', {title: '', 'itunes:title': ''}), item('2', {title: 'Same'}), item('3', {title: 'Same'})],
            async context => {
                await map({url: SITE}, context);
                const posts = await context.getAllPosts();
                assert.deepEqual(
                    posts.map(post => [post.get('title'), post.get('slug')]),
                    [
                        ['(Untitled)', 'untitled'],
                        ['Same', 'same'],
                        ['Same', 'same-2']
                    ]
                );
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/untitled`)), null);
                assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/same`)), '/same/');
            }
        );
    });

    it('matches the owner to the Ghost user with the same email', async function () {
        await withFeed([item('1'), item('2')], async context => {
            async function* users() {
                yield ghostUser({email: 'PERSON@example.com', roles: [{name: 'Owner'}]});
                yield ghostUser({id: '64f1a2b3c4d5e6f708192a3c', slug: 'other', email: ''});
            }
            await map({url: SITE}, context, {ghostUsers: users()});
            const [first, second] = await context.getAllPosts();
            const [author] = first.data.authors;
            assert.equal(author.ghostId, '64f1a2b3c4d5e6f708192a3b');
            assert.equal(author.data.slug, 'ghost-person');
            assert.equal(author.data.name, 'Ghost Person');
            assert.deepEqual(author.data.roles, ['Contributor']);
            assert.equal(second.data.authors[0].dbId, author.dbId);
            assert.deepEqual(
                events(context, 'operation:warning').map(event => event.details.reason),
                ['Unsupported author roles replaced by supported Ghost roles']
            );
        });

        const editor = await withAuthor([ghostUser({roles: [{name: 'Editor'}, {name: 'Owner'}]})]);
        assert.deepEqual(editor.data.roles, ['Editor']);
    });

    it('gives the owner a placeholder email and a slug no other Ghost user holds', async function () {
        const channel = {...fixtureChannel(), 'itunes:owner': {'itunes:name': 'Example User'}};
        const post = await mappedPost({}, {}, channel);
        assert.equal(post.data.authors[0].data.email, 'example-user@example.com');

        const author = await withAuthor([ghostUser({slug: 'example-user', email: 'someone@example.com'})]);
        assert.equal(author.data.slug, 'example-user-2');
        assert.equal(author.ghostId, ghostId('example.com', 'author', 'owner'));

        const unnamed = await mappedPost({}, {}, {'itunes:author': '!!!'});
        assert.equal(unnamed.data.authors[0].data.slug, 'author');
        assert.equal(unnamed.data.authors[0].data.email, 'author@example.com');
    });

    it('leaves posts without an author when the feed names none', async function () {
        const post = await mappedPost({}, {}, {title: 'Example Show'});
        assert.deepEqual(post.data.authors, []);
        assert.deepEqual(names(post.data.tags), ['exmaple', 'keywords', '#libsyn']);
    });

    it('needs completed source data with a channel and an HTTP(S) site URL', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, context), /Ingest complete Libsyn source data/);
        } finally {
            await context.close();
        }
        await withFeed(
            [item('1')],
            async without => {
                await assert.rejects(map({url: SITE}, without), /no channel record/);
            },
            null
        );
        await withFeed([item('1')], async context => {
            await assert.rejects(map({url: 'example.com'}, context), /--url/);
            await assert.rejects(map({}, context), /--url/);
        });
    });
});

/** The author of a post mapped with these Ghost users. */
async function withAuthor(users: GhostUser[]) {
    let post: PostContext;
    await withFeed([item('1')], async context => {
        await map({url: SITE}, context, {ghostUsers: users});
        [post] = await context.getAllPosts();
    });
    return post!.data.authors[0];
}
