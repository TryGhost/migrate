import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {MigrateContext} from '@tryghost/mg-context';
import {ghostId, map, sourceUrl} from '../index.js';
import {cleanUp, events, fixturePosts, ingested, memoryContext, post} from './helpers.js';

const URL = 'https://example.com';

/** The mapped posts, in database order, with their tags and authors. */
async function posts(context: MigrateContext) {
    const result: any[] = [];
    await context.forEachPost(async item => {
        result.push({
            slug: item.get('slug'),
            title: item.get('title'),
            status: item.get('status'),
            published_at: item.get('published_at')?.toISOString(),
            created_at: item.get('created_at')?.toISOString(),
            updated_at: item.get('updated_at')?.toISOString(),
            html: item.get('html'),
            ghostId: item.ghostId,
            lookupKey: item.lookupKey,
            tags: item.data.tags.map((tag: any) => [tag.data.name, tag.data.slug]),
            authors: item.data.authors.map((author: any) => [author.data.name, author.data.slug, author.data.email])
        });
    });
    return result;
}

async function authorCount(context: MigrateContext) {
    let count = 0;
    await context.forEachAuthor(async () => {
        count += 1;
    });
    return count;
}

describe('map', function () {
    after(cleanUp);

    it('maps every fixture post with its dates, slugs, authors and tags', async function () {
        const context = await ingested({
            ...(await fixturePosts()),
            '_drafts/2023-01-01-dated-draft.md': post({title: 'Dated draft', author: 'Persons Name'})
        });
        try {
            const summary = await map({url: URL, email: 'company.com', addTags: 'Extra, #Internal'}, context);
            assert.deepEqual(summary, {selected: 14, imported: 14, skipped: 0});

            const mapped = await posts(context);
            const bySlug = Object.fromEntries(mapped.map(item => [item.slug, item]));
            assert.deepEqual(Object.keys(bySlug).sort(), [
                'alt-date-format',
                'basic',
                'basic-post',
                'custom-basename',
                'dated-draft',
                'front-matter-tags-cats',
                'has-html',
                'has-spaced-lists',
                'my-first-post',
                'no-author',
                'published-false',
                'relative-links',
                'tag-list',
                'unquoted-date'
            ]);

            const basic = bySlug['basic-post'];
            assert.equal(basic.title, 'This is a Basic Post');
            assert.equal(basic.status, 'published');
            assert.equal(basic.published_at, '2021-08-23T00:00:00.000Z');
            assert.equal(basic.created_at, '2021-08-23T00:00:00.000Z');
            assert.equal(basic.updated_at, '2021-08-23T00:00:00.000Z');
            assert.equal(basic.ghostId, ghostId('example.com', 'post', '_posts/2021-08-23-basic-post.md'));
            assert.equal(basic.lookupKey, '_posts/2021-08-23-basic-post.md');
            assert.deepEqual(basic.authors, [['Persons Name', 'persons-name', 'persons-name@company.com']]);
            assert.deepEqual(basic.tags, [
                ['Extra', 'extra'],
                ['#jekyll', 'hash-jekyll'],
                ['#Internal', 'hash-internal']
            ]);

            // Posts without an author get the Example User.
            assert.deepEqual(bySlug['no-author'].authors, [['Example User', 'exampleuser', 'exampleuser@example.com']]);
            assert.equal(bySlug['published-false'].status, 'draft');
            assert.equal(bySlug['dated-draft'].status, 'draft');
            assert.equal(bySlug['dated-draft'].published_at, '2023-01-01T00:00:00.000Z');
            // The same author is one user across posts.
            assert.equal(bySlug['dated-draft'].authors[0][2], 'persons-name@company.com');
            assert.equal(bySlug['my-first-post'].published_at, '2021-11-26T00:00:00.000Z');
            assert.deepEqual(bySlug['front-matter-tags-cats'].tags.slice(0, 3), [
                ['News', 'category-news'],
                ['Posts', 'category-posts'],
                ['Articles', 'category-articles']
            ]);
            assert.ok(
                bySlug['relative-links'].html.includes('<a href="https://example.com/another-page">'),
                'root-relative links point at the live site'
            );

            assert.equal(await authorCount(context), 3);
            assert.equal(context.findLink('example.com/basic-post'), '/basic-post/');
            assert.equal(context.findLink('example.com/custom-basename'), '/custom-basename/');
        } finally {
            await context.close();
        }
    });

    it('dates undated drafts when the export was read, and skips undated posts and invalid front matter', async function () {
        const context = await ingested({
            '_drafts/undated.md': post({title: 'Undated draft'}),
            '_posts/undated.md': post({title: 'Undated post'}),
            '_posts/2021-01-01-bad-yaml.md': '---\ntitle: [unclosed\n---\nBody',
            '_posts/2021-01-02-ok.md': post({title: 'OK'})
        });
        try {
            const summary = await map({url: URL}, context);
            assert.deepEqual(summary, {selected: 4, imported: 2, skipped: 2});
            const mapped = await posts(context);
            const draft = mapped.find(item => item.slug === 'undated');
            assert.equal(draft.status, 'draft');
            assert.equal(draft.published_at, context.sources.currentIngestion!.completedAt);
            const reasons = events(context, 'record:skipped').map(event => event.details.reason);
            assert.equal(reasons.length, 2);
            assert.ok(reasons.includes('No valid date in the front matter or file name'));
            assert.ok(reasons.some(reason => reason.startsWith('Invalid front matter: unexpected end of the stream')));
        } finally {
            await context.close();
        }
    });

    it('applies options on every remap, keeping Ghost IDs, and keeps dates in dated permalinks', async function () {
        const context = await ingested({
            '_posts/2021-08-23-linked.md': post({title: 'Linked'}, 'See [the other post](/other).'),
            '_posts/2021-08-24-other.md': post({title: 'Other', basename: 'other'})
        });
        try {
            await map({url: `${URL}/`, addTags: 'First'}, context);
            const first = await posts(context);
            assert.equal(context.findLink('example.com/other'), '/other/');

            await map({url: URL, addTags: 'Second', datedPermalinks: '/yyyy/mm/dd/'}, context);
            const second = await posts(context);
            assert.deepEqual(
                second.map(item => item.ghostId),
                first.map(item => item.ghostId)
            );
            assert.deepEqual(second[0].tags, [
                ['Second', 'second'],
                ['#jekyll', 'hash-jekyll']
            ]);
            assert.equal(context.findLink('example.com/other'), null);
            assert.equal(context.findLink('example.com/2021/08/24/other'), '/2021/08/24/other/');

            await map({url: URL, datedPermalinks: '/yyyy/mm/'}, context);
            assert.equal(context.findLink('example.com/2021/08/other'), '/2021/08/other/');

            const record = context.sources.get('post', '_posts/2021-08-24-other.md')!;
            assert.equal(
                sourceUrl({url: URL, datedPermalinks: '/yyyy/mm/'}, record),
                'https://example.com/2021/08/other'
            );
        } finally {
            await context.close();
        }
    });

    it('keeps tags and authors whose names share a slug as one, and gives post slugs suffixes', async function () {
        const context = await ingested({
            '_posts/2021-01-01-same.md': post({title: 'One', author: 'Jane Doe', tags: '[Foo]'}),
            '_posts/sub/2021-01-02-same.md': post({title: 'Two', author: 'jane doe', tags: '[foo]'}),
            '_posts/2021-01-03-symbols.md': post({title: 'Three', author: '"***"', tags: '["***"]'})
        });
        try {
            await map({url: URL}, context);
            const mapped = await posts(context);
            assert.deepEqual(mapped.map(item => [item.slug, item.authors[0][1], item.tags[0]]).sort(), [
                ['same', 'jane-doe', ['Foo', 'foo']],
                ['same-2', 'jane-doe', ['Foo', 'foo']],
                ['symbols', 'author', ['***', 'tag']]
            ]);
            assert.deepEqual(mapped.find(item => item.slug === 'symbols').authors[0], [
                '***',
                'author',
                'author@example.com'
            ]);
        } finally {
            await context.close();
        }
    });

    it('matches authors to Ghost users by placeholder email and reserves Ghost user slugs', async function () {
        const context = await ingested({
            '_posts/2021-01-01-a.md': post({title: 'A', author: 'Persons Name'}),
            '_posts/2021-01-02-b.md': post({title: 'B', author: 'Jane Doe'}),
            '_posts/2021-01-03-c.md': post({title: 'C', author: 'Owner Person'}),
            '_posts/2021-01-04-d.md': post({title: 'D', author: 'Mixed Roles'})
        });
        try {
            await map({url: URL}, context, {
                ghostUsers: (async function* () {
                    yield {
                        id: '0123456789abcdef01234567',
                        slug: 'existing',
                        name: 'Existing Person',
                        email: 'Persons-Name@example.com',
                        roles: [{name: 'Editor'}]
                    } as any;
                    yield {id: '0123456789abcdef01234568', slug: 'jane-doe', name: 'Other Jane'} as any;
                    yield {
                        id: '0123456789abcdef01234569',
                        slug: 'owner',
                        name: 'Owner Person',
                        email: 'owner-person@example.com',
                        roles: [{name: 'Owner'}]
                    } as any;
                    yield {
                        id: '0123456789abcdef0123456a',
                        slug: 'mixed',
                        name: 'Mixed Roles',
                        email: 'mixed-roles@example.com',
                        roles: [{name: 'Owner'}, {name: 'Author'}]
                    } as any;
                })()
            });
            const mapped = await posts(context);
            assert.deepEqual(
                mapped.map(item => item.authors[0]),
                [
                    ['Existing Person', 'existing', 'Persons-Name@example.com'],
                    ['Jane Doe', 'jane-doe-2', 'jane-doe@example.com'],
                    ['Owner Person', 'owner', 'owner-person@example.com'],
                    ['Mixed Roles', 'mixed', 'mixed-roles@example.com']
                ]
            );
            const roles = new Map<string, string[]>();
            await context.forEachAuthor(async author => {
                roles.set(author.get('slug'), author.get('roles'));
                if (author.get('slug') === 'existing') {
                    assert.equal(author.ghostId, '0123456789abcdef01234567');
                }
            });
            assert.deepEqual(roles.get('existing'), ['Editor']);
            assert.deepEqual(roles.get('owner'), ['Contributor']);
            assert.deepEqual(roles.get('mixed'), ['Author']);
            assert.equal(events(context, 'operation:warning').length, 2);
            assert.equal(events(context, 'slug:renamed').length, 1);
        } finally {
            await context.close();
        }
    });

    it('skips a post with more than 500 tags', async function () {
        const tags = Array.from({length: 501}, (_, index) => `t${index}`).join(' ');
        const context = await ingested({'_posts/2021-01-01-many.md': post({title: 'Many', tags})});
        try {
            assert.deepEqual(await map({url: URL}, context), {selected: 1, imported: 0, skipped: 1});
        } finally {
            await context.close();
        }
    });

    it('needs a completed ingestion and an HTTP site URL', async function () {
        const empty = await memoryContext();
        try {
            await assert.rejects(map({url: URL}, empty), /Ingest a complete Jekyll export before mapping/);
        } finally {
            await empty.close();
        }
        const context = await ingested({'_posts/2021-01-01-a.md': post({title: 'A'})});
        try {
            await assert.rejects(map({}, context), /--url/);
            await assert.rejects(map({url: 'ftp://example.com'}, context), /--url/);
        } finally {
            await context.close();
        }
    });
});
