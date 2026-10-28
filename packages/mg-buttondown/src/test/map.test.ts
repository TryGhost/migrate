import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {stringUtils} from '@tryghost/mg-utils';
import {ghostId, map} from '../index.js';
import {SITE, cleanUp, emailsJson, events, fixtureExport, ingested, memoryContext} from './helpers.js';

const email = (id: string, values: Record<string, unknown> = {}) => ({
    id,
    subject: `Title ${id}`,
    publish_date: '2024-01-01 00:00:00+00:00',
    slug: id,
    ...values
});

/** Map with `url` and return the mapped posts in record order. */
async function mapped(context: MigrateContext, url = SITE): Promise<PostContext[]> {
    await map({url}, context);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding the export of `files`. */
async function withExport(
    files: Record<string, string>,
    test: (context: MigrateContext) => Promise<void>
): Promise<void> {
    const context = await ingested(files);
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

describe('Mapping a Buttondown export', function () {
    after(cleanUp);

    it('maps each email to a published post with its body, tag and link', async function () {
        await withExport(await fixtureExport(), async context => {
            const summary = await map({url: `${SITE}/`}, context);
            assert.deepEqual(summary, {selected: 2, imported: 2, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => post.get('slug')),
                ['plain-post', 'fancy-post']
            );
            const [plain, fancy] = posts;
            assert.equal(plain.get('title'), 'This is a Plain Post');
            assert.equal(plain.get('published_at').toISOString(), '2023-01-02T16:55:00.000Z');
            assert.equal(plain.get('updated_at').toISOString(), '2023-01-02T16:55:00.000Z');
            assert.equal(plain.get('created_at').toISOString(), '2023-01-02T16:55:00.000Z');
            assert.equal(plain.get('status'), 'published');
            assert.equal(plain.get('visibility'), 'public');
            assert.equal(plain.get('type'), 'post');
            assert.equal(plain.get('custom_excerpt'), null);
            assert.equal(plain.ghostId, ghostId('example.com', 'post', 'abcd1234-7fee-4942-a9cf-0de5d4ebb255'));
            assert.ok(plain.get('html').includes('<h2>Lorem ipsum dolor sit amet.</h2>'));
            assert.ok(!plain.get('html').includes('buttondown-editor-mode'));
            assert.ok(plain.get('html').includes('<img src="https://example.com/image.jpg" alt="Landscape photo">'));
            assert.ok(fancy.get('html').includes('<!--kg-card-begin: embed-->'));
            assert.deepEqual(
                plain.data.tags.map((tag: any) => [tag.data.name, tag.data.slug, tag.ghostId]),
                [['#buttondown', 'hash-buttondown', ghostId('example.com', 'tag', 'hash-buttondown')]]
            );
            assert.deepEqual(plain.data.authors, []);
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/plain-post`)), '/plain-post/');
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/fancy-post`)), '/fancy-post/');
            const body = context.sources.get('body', 'emails/plain-post.md')!;
            const entities = [];
            for await (const entity of context.sources.entitiesFor(body.id)) {
                entities.push(entity);
            }
            assert.deepEqual(entities, [{type: 'post', id: plain.dbId}]);
        });
    });

    it('maps an emails.csv export the same way, and keeps IDs and links across remaps', async function () {
        await withExport(await fixtureExport('emails.csv'), async context => {
            const first = await mapped(context);
            const second = await mapped(context);
            assert.deepEqual(
                second.map(post => [post.get('slug'), post.ghostId]),
                first.map(post => [post.get('slug'), post.ghostId])
            );
            assert.equal(second.length, 2);
            assert.equal(context.findLink(stringUtils.cleanURL(`${SITE}/fancy-post`)), '/fancy-post/');
        });
    });

    it('imports an email without a body with empty HTML and a warning', async function () {
        await withExport(
            {'emails.json': emailsJson([email('one'), email('two')]), 'emails/one.md': 'Hello'},
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => [post.get('slug'), post.get('html')]),
                    [
                        ['one', '<p>Hello</p>'],
                        ['two', '']
                    ]
                );
                const [warning] = events(context, 'operation:warning');
                assert.deepEqual(warning.details, {
                    file: 'emails.json',
                    index: 1,
                    reason: 'No body file in the export for this email',
                    body: 'emails/two.md'
                });
                assert.equal(context.countWarnings(), 1);
            }
        );
    });

    it('reads zoneless dates as UTC and skips emails without an id, a slug or a valid date', async function () {
        await withExport(
            {
                'emails.json': emailsJson([
                    email('zoneless', {publish_date: '2024-02-03 04:05:06'}),
                    email('offset', {publish_date: '2024-02-03T04:05:06+02:00'}),
                    {subject: 'No ID', slug: 'no-id', publish_date: '2024-01-01'},
                    email('no-slug', {slug: undefined}),
                    email('blank-slug', {slug: ' '}),
                    email('no-date', {publish_date: undefined}),
                    email('blank-date', {publish_date: ''}),
                    email('bad-date', {publish_date: 'never'}),
                    email('untitled', {subject: undefined})
                ]),
                'emails/zoneless.md': 'Body'
            },
            async context => {
                const summary = await map({url: SITE}, context);
                assert.deepEqual(summary, {selected: 9, imported: 3, skipped: 6});
                const posts = await context.getAllPosts();
                assert.deepEqual(
                    posts.map(post => [post.get('slug'), post.get('published_at').toISOString()]),
                    [
                        ['zoneless', '2024-02-03T04:05:06.000Z'],
                        ['offset', '2024-02-03T02:05:06.000Z'],
                        ['untitled', '2024-01-01T00:00:00.000Z']
                    ]
                );
                assert.equal(posts[2].get('title'), '(Untitled)');
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    [
                        'Email has no id',
                        'Email has no slug',
                        'Email has no slug',
                        'Invalid Buttondown publish date',
                        'Invalid Buttondown publish date',
                        'Invalid Buttondown publish date'
                    ]
                );
            }
        );
    });

    it('gives emails that share a slug distinct post slugs', async function () {
        await withExport(
            {
                'emails.json': emailsJson([email('one', {slug: 'same'}), email('two', {slug: 'same'})]),
                'emails/same.md': 'Hi'
            },
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => post.get('slug')),
                    ['same', 'same-2']
                );
            }
        );
    });

    it('requires completed source data and an HTTP site URL', async function () {
        const empty = await memoryContext();
        try {
            await assert.rejects(map({url: SITE}, empty), /Ingest a complete Buttondown export/);
        } finally {
            await empty.close();
        }
        await withExport(await fixtureExport(), async context => {
            await assert.rejects(map({url: 'ftp://example.com'}, context), /HTTP or HTTPS URL/);
            await assert.rejects(map({url: undefined as any}, context), /HTTP or HTTPS URL/);
        });
    });
});
