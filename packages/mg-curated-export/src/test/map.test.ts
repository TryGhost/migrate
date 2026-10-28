import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {MigrateContext, PostContext} from '@tryghost/mg-context';
import {ghostId, map, parse} from '../index.js';
import type {CuratedIssue, CuratedOptions} from '../index.js';
import {IMAGE, cleanUp, events, exportFiles, ingested, issue, issueFixture, makeZip, memoryContext} from './helpers.js';

const OPTIONS = {name: 'Jane Editor', email: 'jane@example.com', tag: 'Newsletter'};
const iso = (value: unknown) => new Date(value as string).toISOString();
const names = (items: any[]) => items.map(item => item.data.name);

/** Map with `options` and return the mapped posts in record order. */
async function mapped(
    context: MigrateContext,
    options: CuratedOptions = OPTIONS,
    services = {}
): Promise<PostContext[]> {
    await map(options, context, services);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding an export of `issues`, plus any other `files`. */
async function withExport(
    issues: CuratedIssue[],
    test: (context: MigrateContext) => Promise<void>,
    files: Record<string, string | Buffer> = {}
): Promise<void> {
    const context = await ingested({...(await exportFiles(issues)), ...files});
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

async function entities(context: MigrateContext, recordId: number) {
    const found = [];
    for await (const entity of context.sources.entitiesFor(recordId)) {
        found.push(entity.type);
    }
    return found.sort();
}

describe('Mapping a Curated export', function () {
    after(cleanUp);

    it('requires completed source data', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest a complete Curated export before mapping/);
        } finally {
            await context.close();
        }
    });

    it('maps issues with their fields, HTML, images, author, tags, links and sources', async function () {
        await withExport([await issueFixture(), await issue(13)], async context => {
            const summary = await map(OPTIONS, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => [post.get('slug'), post.get('title'), post.lookupKey]),
                [
                    ['12', 'Issue 12', 'published/12/12.json'],
                    ['13', 'Issue 13', 'published/13/13.json']
                ]
            );

            const [post, other] = posts;
            assert.equal(post.ghostId, ghostId('post', 'example.com/issues/12'));
            assert.equal(post.get('custom_excerpt'), 'Lorem ipsum dolor sit amet, consectetur adipiscing elit.');
            assert.equal(post.get('status'), 'published');
            assert.equal(post.get('visibility'), 'public');
            assert.equal(post.get('type'), 'post');
            assert.equal(iso(post.get('created_at')), '2021-02-02T21:08:42.000Z');
            assert.equal(iso(post.get('published_at')), '2021-02-02T21:08:42.000Z');
            assert.equal(iso(post.get('updated_at')), '2021-02-02T21:08:43.000Z');
            assert.match(
                post.get('html'),
                new RegExp(`<img class="kg-image" src="/content/images/12/${IMAGE}" alt="Special offer!" />`)
            );
            // Issue 13 names the same image, which its own directory does not hold.
            assert.doesNotMatch(other.get('html'), /<img/);
            const warnings = events(context, 'operation:warning');
            assert.deepEqual(
                warnings.map(event => [event.details.reason, event.details.image, event.details.file]),
                [['Image not found in the export', IMAGE, 'data-export/issues/published/13/13.json']]
            );

            for (const item of posts) {
                assert.deepEqual(names(item.data.authors), ['Jane Editor']);
                assert.deepEqual(names(item.data.tags), ['Newsletter', '#curated']);
            }
            const [author] = post.data.authors;
            assert.equal(author.ghostId, ghostId('author', 'jane@example.com'));
            assert.equal(author.data.slug, 'jane-editor');
            assert.equal(author.data.email, 'jane@example.com');
            assert.deepEqual(author.data.roles, ['Contributor']);
            assert.deepEqual(
                post.data.tags.map((tag: any) => [tag.data.slug, tag.ghostId]),
                [
                    ['newsletter', ghostId('tag', 'Newsletter')],
                    ['hash-curated', ghostId('tag', '#curated')]
                ]
            );
            assert.equal((context.db.stmts.countUsedAuthors.get() as {count: number}).count, 1);
            assert.equal((context.db.stmts.countUsedTags.get() as {count: number}).count, 2);

            assert.equal(context.findLink('example.com/issues/12'), '/12/');
            assert.equal(context.findLink('example.com/issues/13'), '/13/');
            const issueRecord = context.sources.get('issue', 'published/12/12.json')!;
            assert.deepEqual(await entities(context, issueRecord.id), ['author', 'post', 'tag', 'tag']);
            const image = context.sources.get('image', `published/12/${IMAGE}`)!;
            assert.deepEqual(await entities(context, image.id), ['post']);
        });
    });

    it('remaps stored issues with changed options, keeping Ghost IDs', async function () {
        await withExport([await issueFixture()], async context => {
            const [first] = await mapped(context);
            const [post] = await mapped(context, {});
            assert.equal(post.ghostId, first.ghostId);
            assert.deepEqual(names(post.data.tags), ['#curated']);
            const [author] = post.data.authors;
            assert.equal(author.data.name, 'Example User');
            assert.equal(author.data.slug, 'example-user');
            assert.equal(author.data.email, 'example-user@example.com');
            assert.equal(author.ghostId, ghostId('author', 'example-user@example.com'));

            const [named] = await mapped(context, {name: ' Jane Editor ', email: '  ', tag: false});
            assert.equal(named.data.authors[0].data.email, 'jane-editor@example.com');

            // A tag named like the platform tag is one tag; distinct names whose slugs collide stay distinct.
            const [same] = await mapped(context, {tag: '#curated'});
            assert.deepEqual(names(same.data.tags), ['#curated']);
            const [colliding] = await mapped(context, {tag: 'hash curated'});
            assert.deepEqual(
                colliding.data.tags.map((tag: any) => [tag.data.name, tag.data.slug]),
                [
                    ['hash curated', 'hash-curated'],
                    ['#curated', 'hash-curated-2']
                ]
            );
            assert.equal(events(context, 'slug:renamed')[0].details.newSlug, 'hash-curated-2');
        });
    });

    it('matches the author to a Ghost user by email', async function () {
        const ghostUser = (roles: any[], values = {}) => ({
            id: '0123456789abcdef01234567',
            slug: 'existing',
            name: 'Existing User',
            email: 'JANE@example.com',
            roles,
            ...values
        });
        await withExport([await issueFixture()], async context => {
            for (const [roles, expected, warnings] of [
                [[{name: 'Editor'}], ['Editor'], 0],
                [['Owner'], ['Contributor'], 1],
                [['Owner', 'Author'], ['Author'], 1]
            ] as const) {
                const [post] = await mapped(context, OPTIONS, {ghostUsers: [ghostUser([...roles]) as any]});
                const [author] = post.data.authors;
                assert.equal(author.ghostId, '0123456789abcdef01234567');
                assert.equal(author.data.slug, 'existing');
                assert.equal(author.data.name, 'Existing User');
                assert.deepEqual(author.data.roles, expected);
                assert.equal(events(context, 'operation:warning').length, warnings);
            }

            // A Ghost user with another email keeps its slug; the author is suffixed around it.
            const [post] = await mapped(context, OPTIONS, {
                ghostUsers: [
                    ghostUser(['Editor'], {slug: 'jane-editor', email: 'other@example.com'}),
                    {
                        ...ghostUser([]),
                        slug: 'no-email',
                        email: undefined
                    }
                ] as any
            });
            assert.equal(post.data.authors[0].data.slug, 'jane-editor-2');
            assert.equal(post.data.authors[0].ghostId, ghostId('author', 'jane@example.com'));
            assert.equal(events(context, 'slug:renamed')[0].details.newSlug, 'jane-editor-2');
        });
    });

    it('skips issues without a valid URL or publish date, and fills other missing fields', async function () {
        const issues = [
            await issue(1, {url: undefined}),
            await issue(2, {url: 'mailto:editor@example.com'}),
            await issue(3, {published_at: 'yesterday'}),
            await issue(4, {published_at: undefined}),
            await issue(5, {
                title: 'Tom &amp; Jerry',
                url: 'https://example.com/issues/5-tom-and-jerry/',
                published_at: '2021-03-04 05:06:07',
                updated_at: 'never',
                summary: '',
                publication_status: 'draft'
            }),
            await issue(6, {title: '', url: 'https://example.com', publication_status: 'archived'})
        ];
        await withExport(issues, async context => {
            const summary = await map(OPTIONS, context);
            assert.deepEqual(summary, {selected: 6, imported: 2, skipped: 4});
            assert.deepEqual(
                events(context, 'record:skipped').map(event => [event.details.file, event.details.reason]),
                [
                    ['data-export/issues/published/1/1.json', 'Issue has no valid URL'],
                    ['data-export/issues/published/2/2.json', 'Issue has no valid URL'],
                    ['data-export/issues/published/3/3.json', 'Invalid Curated published_at'],
                    ['data-export/issues/published/4/4.json', 'Invalid Curated published_at']
                ]
            );
            const [five, six] = await context.getAllPosts();
            assert.equal(five.get('title'), 'Tom & Jerry');
            assert.equal(five.get('slug'), '5-tom-and-jerry');
            assert.equal(five.get('status'), 'draft');
            assert.equal(five.get('custom_excerpt'), null);
            assert.equal(iso(five.get('published_at')), '2021-03-04T05:06:07.000Z');
            assert.equal(iso(five.get('updated_at')), '2021-03-04T05:06:07.000Z');
            assert.equal(six.get('title'), '(Untitled)');
            assert.equal(six.get('slug'), '6');
            assert.equal(six.get('status'), 'draft');
        });
    });

    it('leaves out images whose file was not written by ingest()', async function () {
        const context = await memoryContext();
        try {
            const pathToZip = await makeZip(await exportFiles([await issueFixture()]));
            await context.sources.ingest({}, async stage => {
                await stage.write(parse(pathToZip));
            });
            const [post] = await mapped(context);
            assert.doesNotMatch(post.get('html'), /<img/);
            assert.equal(events(context, 'operation:warning')[0].details.reason, 'Image not found in the export');
        } finally {
            await context.close();
        }
    });
});
