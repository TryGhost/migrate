import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {after, describe, it} from 'node:test';
import type {MigrateContext} from '@tryghost/mg-context';
import {entryUrl, ghostId, ingest, map} from '../index.js';
import type {ChorusEntry} from '../index.js';
import {
    FULL,
    cleanUp,
    entry,
    entryFixture,
    events,
    ingested,
    makeDirectory,
    memoryContext,
    tempDirectory
} from './helpers.js';

const SITE = 'example.com';
const options = {url: 'https://example.com'};

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
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((link: any) => data.users.find((user: any) => user.id === link.author_id).slug),
        tags: data.posts_tags
            .filter((link: any) => link.post_id === post.id)
            .sort((a: any, b: any) => a.sort_order - b.sort_order)
            .map((link: any) => data.tags.find((tag: any) => tag.id === link.tag_id).name)
    }));
}

describe('map', function () {
    after(cleanUp);

    it('maps an entry to a published post with its authors, tags and HTML', async function () {
        const full = await entryFixture(FULL);
        const context = await ingested([full]);
        const summary = await map({...options, addPrimaryTag: 'Newsletter'}, context);
        assert.deepEqual(summary, {selected: 1, imported: 1, skipped: 0});

        const data = await exported(context);
        assert.equal(data.posts.length, 1);
        const [post] = data.posts;
        assert.equal(post.id, ghostId(SITE, 'post', 'Entry:0969db64-b8d7-11ed-afa1-0242ac120001'));
        assert.equal(post.slug, 'my-article');
        assert.equal(post.title, 'Example post title');
        assert.equal(post.custom_excerpt, 'My subtitle');
        assert.equal(post.status, 'published');
        assert.equal(post.visibility, 'public');
        assert.equal(post.type, 'post');
        assert.equal(post.created_at, '2019-09-27T00:40:19.000Z');
        assert.equal(post.updated_at, '2019-09-27T00:48:48.000Z');
        assert.equal(post.published_at, '2019-09-27T00:40:19.000Z');
        assert.ok(post.html.startsWith('<p>Lorem ipsum dolor sit amet'));
        assert.ok(post.html.includes('<ul><li>Nullam gravida'));

        assert.deepEqual(
            data.users.map((user: any) => [user.id, user.slug, user.name, user.email, user.roles]),
            [
                [
                    ghostId(SITE, 'author', 'Main Author Name'),
                    'main-author-name',
                    'Main Author Name',
                    'main-author-name@example.com',
                    ['Contributor']
                ],
                [
                    ghostId(SITE, 'author', 'Author Name'),
                    'author-name',
                    'Author Name',
                    'author-name@example.com',
                    ['Contributor']
                ],
                [
                    ghostId(SITE, 'author', 'Contributors Name'),
                    'contributors-name',
                    'Contributors Name',
                    'contributors-name@example.com',
                    ['Contributor']
                ]
            ]
        );
        assert.deepEqual(
            data.tags.map((tag: any) => [tag.id, tag.slug, tag.name]),
            [
                [ghostId(SITE, 'tag', 'Newsletter'), 'newsletter', 'Newsletter'],
                [ghostId(SITE, 'tag', 'Lorem'), 'lorem', 'Lorem'],
                [ghostId(SITE, 'tag', 'Ipsum Dolor'), 'ipsum-dolor', 'Ipsum Dolor'],
                [ghostId(SITE, 'tag', 'Simet'), 'simet', 'Simet'],
                [ghostId(SITE, 'tag', '#chorus'), 'hash-chorus', '#chorus']
            ]
        );
        assert.deepEqual(await relations(context), [
            {
                slug: 'my-article',
                authors: ['main-author-name', 'author-name', 'contributors-name'],
                tags: ['Newsletter', 'Lorem', 'Ipsum Dolor', 'Simet', '#chorus']
            }
        ]);
        assert.equal(context.findLink('example.com/2019/9/26/12345678/my-article'), '/my-article/');
        await context.close();
    });

    it('keeps IDs across runs and replays changed options without a new read', async function () {
        const context = await ingested([await entry('a'), await entry('b')]);
        await map(options, context);
        const first = await exported(context);
        await map({...options, addPrimaryTag: 'News'}, context);
        const second = await exported(context);

        assert.deepEqual(
            second.posts.map((post: any) => post.id),
            first.posts.map((post: any) => post.id)
        );
        assert.deepEqual(
            (await relations(context)).map(post => post.tags),
            [
                ['News', '#chorus'],
                ['News', '#chorus']
            ]
        );
        // Another site gives other IDs.
        await map({url: 'https://other.example.com/blog/'}, context);
        const other = await exported(context);
        assert.equal(other.posts[0].id, ghostId('other.example.com/blog', 'post', 'Entry:a'));
        assert.notEqual(other.posts[0].id, first.posts[0].id);
        assert.equal(context.findLink('example.com/2020/1/1/a/entry-a'), '/entry-a/');
        await context.close();
    });

    it('skips entries without a valid URL or createdAt', async function () {
        const context = await ingested([
            await entry('a', {url: undefined}),
            await entry('b', {url: 'ftp://example.com/b'}),
            await entry('c', {createdAt: 'yesterday'}),
            await entry('d', {createdAt: undefined}),
            await entry('e')
        ]);
        const summary = await map(options, context);
        assert.deepEqual(summary, {selected: 5, imported: 1, skipped: 4});
        assert.deepEqual(
            events(context, 'record:skipped').map(event => event.details.reason),
            ['Entry has no valid URL', 'Entry has no valid URL', 'Invalid Chorus createdAt', 'Invalid Chorus createdAt']
        );
        await context.close();
    });

    it('reads zoneless dates as UTC and falls back to createdAt for updatedAt', async function () {
        const context = await ingested([
            await entry('a', {createdAt: '2020-03-04 05:06:07', updatedAt: 'not a date'}),
            await entry('b', {createdAt: '2020-03-04T05:06', updatedAt: '2020-03-05T00:00:00+02:00'})
        ]);
        await map(options, context);
        const posts = (await exported(context)).posts;
        assert.deepEqual(
            posts.map((post: any) => [post.created_at, post.published_at, post.updated_at]),
            [
                ['2020-03-04T05:06:07.000Z', '2020-03-04T05:06:07.000Z', '2020-03-04T05:06:07.000Z'],
                ['2020-03-04T05:06:00.000Z', '2020-03-04T05:06:00.000Z', '2020-03-04T22:00:00.000Z']
            ]
        );
        await context.close();
    });

    it('defaults missing fields and derives slugs from the URL or title', async function () {
        const context = await ingested([
            await entry('a', {title: '  ', dek: null, body: null, author: null, authorProfile: null}),
            await entry('b', {url: 'https://example.com/2020/1/1/b/Caf%C3%A9_Story/', dek: {html: ' '}}),
            await entry('c', {url: 'https://example.com/', title: 'Home Page'}),
            await entry('d', {url: 'https://example.com/%E0%A4%A', contributors: null, communityGroups: null}),
            await entry('e', {url: 'https://example.com/?p=1', title: '(Untitled)'})
        ]);
        await map(options, context);
        const posts = (await exported(context)).posts;
        assert.deepEqual(
            posts.map((post: any) => [post.slug, post.title, post.custom_excerpt, post.html]),
            [
                ['entry-a', '(Untitled)', null, ''],
                [
                    'cafe_story',
                    'Entry b',
                    null,
                    '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. In semper ligula tellus, eget euismod purus posuere sed.</p>'
                ],
                ['home-page', 'Home Page', 'My subtitle', posts[1].html],
                ['e0-a4-a', 'Entry d', 'My subtitle', posts[1].html],
                ['untitled', '(Untitled)', 'My subtitle', posts[1].html]
            ]
        );
        assert.deepEqual(
            (await relations(context)).map(post => post.authors),
            [
                [],
                ['main-author-name', 'author-name'],
                ['main-author-name', 'author-name'],
                ['main-author-name', 'author-name'],
                ['main-author-name', 'author-name']
            ]
        );
        await context.close();
    });

    it('identifies authors and tags by name, so names that share a slug stay separate', async function () {
        const context = await ingested([
            await entry('a', {
                author: {fullOrUserName: 'Jane Doe'},
                authorProfile: {name: 'Jane Doe'},
                contributors: [{fullOrUserName: 'Jane-Doe'}, null, {fullOrUserName: ''}, {}],
                communityGroups: [{name: 'News'}, {name: '#Internal'}, {name: 'news'}, null, {name: ' '}, {name: '!!!'}]
            }),
            await entry('b', {
                author: {fullOrUserName: '!!!'},
                authorProfile: {name: 'Jane-Doe'},
                contributors: [],
                communityGroups: [{name: 'news'}, {name: 'News'}]
            })
        ]);
        await map({...options, addPrimaryTag: ' News '}, context);
        assert.deepEqual(await relations(context), [
            {
                slug: 'entry-a',
                authors: ['jane-doe', 'jane-doe-2'],
                tags: ['News', 'news', '!!!', '#Internal', '#chorus']
            },
            {slug: 'entry-b', authors: ['author', 'jane-doe-2'], tags: ['News', 'news', '#chorus']}
        ]);
        const data = await exported(context);
        assert.deepEqual(
            data.users.map((user: any) => [user.name, user.slug, user.email]),
            [
                ['Jane Doe', 'jane-doe', 'jane-doe@example.com'],
                ['Jane-Doe', 'jane-doe-2', 'jane-doe-2@example.com'],
                ['!!!', 'author', 'author@example.com']
            ]
        );
        assert.deepEqual(
            data.tags.map((tag: any) => [tag.name, tag.slug]),
            [
                ['News', 'news'],
                ['news', 'news-2'],
                ['!!!', 'tag'],
                ['#Internal', 'hash-internal'],
                ['#chorus', 'hash-chorus']
            ]
        );
        assert.deepEqual(
            events(context, 'slug:renamed').map(event => [event.details.oldSlug, event.details.newSlug]),
            [
                ['jane-doe', 'jane-doe-2'],
                ['news', 'news-2']
            ]
        );
        await context.close();
    });

    it('matches authors to Ghost users by placeholder email and reserves Ghost slugs', async function () {
        const context = await ingested([
            await entry('a', {
                author: {fullOrUserName: 'Jane Doe'},
                authorProfile: {name: 'Jane-Doe'},
                contributors: [{fullOrUserName: 'Owner Person'}, {fullOrUserName: 'Taken'}]
            })
        ]);
        async function* ghostUsers() {
            yield {
                id: '0123456789abcdef01234567',
                slug: 'jane',
                name: 'Jane Existing',
                email: 'Jane-Doe@Example.com',
                roles: [{name: 'Editor'}]
            } as any;
            yield {
                id: '0123456789abcdef01234568',
                slug: 'owner',
                name: 'Owner',
                email: 'owner-person@example.com',
                roles: [{name: 'Owner'}]
            } as any;
            yield {id: '0123456789abcdef01234569', slug: 'taken', name: 'Someone Else', email: null} as any;
        }
        await map(options, context, {ghostUsers: ghostUsers()});
        const data = await exported(context);
        assert.deepEqual(
            data.users.map((user: any) => [user.id, user.slug, user.email, user.roles]),
            [
                ['0123456789abcdef01234567', 'jane', 'Jane-Doe@Example.com', ['Editor']],
                ['0123456789abcdef01234568', 'owner', 'owner-person@example.com', ['Contributor']],
                [ghostId(SITE, 'author', 'Taken'), 'taken-2', 'taken-2@example.com', ['Contributor']]
            ]
        );
        assert.deepEqual((await relations(context))[0].authors, ['jane', 'owner', 'taken-2']);
        assert.deepEqual(
            events(context, 'operation:warning').map(event => [event.details.author, event.details.reason]),
            [['Owner Person', 'Unsupported author roles replaced by supported Ghost roles']]
        );
        await context.close();
    });

    it('keeps supported Ghost roles beside unsupported ones', async function () {
        const context = await ingested([await entry('a', {authorProfile: null})]);
        await map(options, context, {
            ghostUsers: [
                {
                    id: '0123456789abcdef01234567',
                    slug: 'main',
                    name: 'Main',
                    email: 'main-author-name@example.com',
                    roles: [{name: 'Owner'}, {name: 'Editor'}]
                } as any
            ]
        });
        assert.deepEqual(
            (await exported(context)).users.map((user: any) => user.roles),
            [['Editor']]
        );
        await context.close();
    });

    it('needs completed source data and the site URL', async function () {
        const empty = await memoryContext();
        await assert.rejects(map(options, empty), /Ingest a complete Chorus export/);
        await empty.close();

        const context = await ingested([await entry('a')]);
        await assert.rejects(map({}, context), /need the site URL \(--url\)/);
        await assert.rejects(map({url: 'example.com'}, context), /need the site URL/);
        await context.close();
    });

    it('maps the stored entries of a directory', async function () {
        const context = await memoryContext();
        await ingest(await makeDirectory({'Entry:a.json': JSON.stringify(await entry('a'))}), context);
        assert.deepEqual(await map(options, context), {selected: 1, imported: 1, skipped: 0});
        await context.close();
    });
});

describe('entryUrl', function () {
    it('returns an entry URL only when it is HTTP or HTTPS', function () {
        assert.equal(entryUrl({url: ' https://example.com/a '} as ChorusEntry), 'https://example.com/a');
        assert.equal(entryUrl({url: 'mailto:someone@example.com'}), null);
        assert.equal(entryUrl({url: 'not a url'}), null);
        assert.equal(entryUrl({}), null);
    });
});
