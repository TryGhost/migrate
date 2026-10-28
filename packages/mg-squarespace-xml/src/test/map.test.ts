import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {MigrateContext, PostContext} from '@tryghost/mg-context';
import {ghostId, map} from '../index.js';
import type {SquarespaceOptions} from '../index.js';
import {cleanUp, events, exportXml, ingested, item, memoryContext, writeXml} from './helpers.js';

const names = (items: any[]) => items.map(entity => entity.data.name);

async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const value of items) {
        result.push(value);
    }
    return result;
}

const BASIC_POST_HTML =
    '<div class="image-block-outer-wrapper layout-caption-below design-layout-inline" data-test="image-block-inline-outer-wrapper">\n' +
    '        <figure class="sqs-block-image-figure intrinsic" style="max-width:409.0px;">\n' +
    '          <a class="sqs-block-image-link" href="https://anothersite.co.uk" target="_blank">\n' +
    '            <div style="padding-bottom:37.4083137512207%;" lass="image-block-wrapper" data-animation-role="image" data-animation-override>\n' +
    '                <noscript><img src="https://images.unsplash.com/photo-1601275225755-f6a6c1730cb1?ixlib=rb-1.2.1&amp;ixid=eyJhcHBfaWQiOjEyMDd9&amp;auto=format&amp;fit=crop&amp;w=2765&amp;q=80"></noscript>\n' +
    '                \n' +
    '            </div>\n' +
    '          </a>\n' +
    '        </figure>\n' +
    '        </div>\n' +
    '        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Mauris pellentesque nisi sed neque vestibulum pulvinar.</p>\n' +
    '        <p>Integer iaculis ac elit a bibendum. Suspendisse rhoncus vitae dui vitae ultrices.</p>\n' +
    '        <table>\n' +
    '            <thead>\n' +
    '                <tr>\n' +
    '                    <th>Width</th>\n' +
    '                    <th>Height</th>\n' +
    '                </tr>\n' +
    '            </thead>\n' +
    '            <tbody>\n' +
    '                <tr>\n' +
    '                    <td>20</td>\n' +
    '                    <td>15</td>\n' +
    '                </tr>\n' +
    '                <tr>\n' +
    '                    <td>40</td>\n' +
    '                    <td>30</td>\n' +
    '                </tr>\n' +
    '            </tbody>\n' +
    '        </table>\n' +
    '        <p>Aenean velit mi, <a href="https://anothersite.co.uk" target="_blank">dapibus</a> eget ex sed, viverra ultrices mi. Nunc at odio bibendum, gravida lectus sit amet, congue dui. Mauris id justo ante. Cras viverra suscipit bibendum.</p>\n' +
    '        <p><strong>Sed vulputate consectetur tortor:</strong></p>\n' +
    '        <ul>\n' +
    '            <li>Lobortis mauris dapibus in</li>\n' +
    '            <li>Donec pharetra, orci sit amet fermentum</li>\n' +
    '            <li>Pretium, nisi arcu molestie mi, nec</li>\n' +
    '            <li>Consequat turpis tortor vulputate quam, mauris vel quam turpis</li>\n' +
    '        </ul>\n' +
    '        <p></p>\n' +
    '        <p>Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Nulla aliquet neque eu lectus sollicitudin, sit amet vestibulum diam commodo.</p>\n' +
    '        <p>&nbsp;</p>\n' +
    '        <p>&nbsp;</p>\n' +
    '        <p>&nbsp;</p>';

/** Map with `options` and return the mapped posts in record order. */
async function mapped(context: MigrateContext, options: SquarespaceOptions = {}): Promise<PostContext[]> {
    await map(options, context);
    return context.getAllPosts();
}

/** Run `test` against a fresh context holding the fixture export, or an export made of `channel`. */
async function withExport(test: (context: MigrateContext) => Promise<void>, channel?: string): Promise<void> {
    const context = await ingested(channel === undefined ? undefined : await writeXml(exportXml(channel)));
    try {
        await test(context);
    } finally {
        await context.close();
    }
}

const author = (id: string, login: string, name = '', email = '') =>
    `<wp:author><wp:author_id>${id}</wp:author_id><wp:author_login>${login}</wp:author_login>` +
    `<wp:author_email>${email}</wp:author_email><wp:author_display_name>${name}</wp:author_display_name></wp:author>`;

describe('Mapping a Squarespace export', function () {
    after(cleanUp);

    it('Can convert a single published post', async function () {
        await withExport(async context => {
            const posts = await mapped(context, {tags: false});
            const post = posts.find(entity => entity.get('slug') === 'basic-post')!;

            assert.equal(post.lookupKey, 'id:4');
            assert.equal(post.ghostId, ghostId('example.com', 'post', 'id:4'));
            assert.equal(post.get('title'), 'Basic Post');
            assert.equal(post.get('status'), 'published');
            for (const field of ['published_at', 'created_at', 'updated_at']) {
                assert.equal(post.get(field).toISOString(), '2013-06-07T03:00:44.000Z');
            }
            assert.equal(
                post.get('feature_image'),
                'https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80'
            );
            assert.equal(post.get('type'), 'post');
            assert.equal(post.get('html'), BASIC_POST_HTML);
            assert.deepEqual(names(post.data.tags), ['Company News', '#sqs']);
            assert.deepEqual(
                post.data.tags.map((tag: any) => tag.data.slug),
                ['company-news', 'hash-sqs']
            );

            assert.equal(post.data.authors.length, 1);
            const [postAuthor] = post.data.authors;
            assert.equal(postAuthor.data.slug, 'hermione-example-com');
            assert.equal(postAuthor.data.name, 'Hermione Granger');
            assert.equal(postAuthor.data.email, 'hermione@example.com');
            assert.equal(postAuthor.ghostId, ghostId('example.com', 'author', 'id:-19091979'));

            assert.equal(context.findLink('example.com/blog/basic-post.html'), '/basic-post/');
            assert.equal(context.findLink('/tag/company-news'), '/tag/company-news/');
            assert.equal(context.findLink('example.com/tag/company-news'), '/tag/company-news/');
        });
    });

    it('Can convert a single draft post', async function () {
        await withExport(async context => {
            const [post] = await mapped(context, {tags: false});

            assert.equal(post.get('slug'), 'draft-post');
            assert.equal(post.get('title'), 'Draft & Post & More—More');
            assert.equal(post.get('status'), 'draft');
            for (const field of ['published_at', 'created_at', 'updated_at']) {
                assert.equal(post.get(field).toISOString(), '2013-11-02T23:02:32.000Z');
            }
            assert.equal(post.get('feature_image'), null);
            assert.equal(post.get('type'), 'post');
            assert.equal(
                post.get('html'),
                '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. </p>'
            );
            assert.deepEqual(names(post.data.tags), ['Company News', '#sqs']);
            const [postAuthor] = post.data.authors;
            assert.equal(postAuthor.data.slug, 'harrysquatter');
            assert.equal(postAuthor.data.name, 'Harry Squatter');
            assert.equal(postAuthor.data.email, 'harrysquatter@example.com');
            assert.equal(context.findLink('example.com/draft-post'), '/draft-post/');
        });
    });

    it('Can convert a published page', async function () {
        await withExport(async context => {
            const posts = await mapped(context, {pages: true});
            const page = posts.find(entity => entity.get('slug') === 'services')!;

            assert.equal(page.get('title'), 'Services');
            assert.equal(page.get('status'), 'published');
            assert.equal(page.get('published_at').toISOString(), '2017-05-27T11:33:38.000Z');
            assert.equal(page.get('feature_image'), null);
            assert.equal(page.get('type'), 'page');
            assert.equal(
                page.get('html'),
                '<h2>Our Services</h2><p>Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium, totam rem aperiam, eaque ipsa quae ab illo inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.</p>'
            );
            assert.deepEqual(names(page.data.tags), ['#sqs']);
            assert.equal(page.data.authors[0].data.slug, 'migrator-added-author');
            assert.equal(page.data.authors[0].data.name, 'Migrator Added Author');
        });
    });

    it('Imports posts and drafts but not pages by default, and remaps stored records for new options', async function () {
        await withExport(async context => {
            assert.deepEqual(await map({}, context), {selected: 3, imported: 3, skipped: 0});
            const posts = await context.getAllPosts();
            assert.deepEqual(
                posts.map(post => [post.get('slug'), post.get('type'), post.get('status')]),
                [
                    ['draft-post', 'post', 'draft'],
                    ['basic-post', 'post', 'published'],
                    ['my-dated-post', 'post', 'published']
                ]
            );
            // Tags are included by default, after categories.
            assert.deepEqual(names(posts[1].data.tags), ['Company News', 'Has Images', 'Programming', '#sqs']);

            assert.deepEqual(await map({posts: false, pages: true, addTag: undefined}, context), {
                selected: 2,
                imported: 2,
                skipped: 0
            });
            assert.deepEqual(
                (await context.getAllPosts()).map(post => post.get('type')),
                ['page', 'page']
            );

            await map({pages: true, drafts: false}, context);
            const published = await context.getAllPosts();
            assert.deepEqual(
                published.map(post => post.get('slug')),
                ['basic-post', 'services', 'no-title', 'my-dated-post']
            );
            assert.equal(published[0].ghostId, posts[1].ghostId);
        });
    });

    it('Can handle posts with no title', async function () {
        await withExport(async context => {
            const posts = await mapped(context, {posts: false, pages: true});
            const page = posts[1];

            assert.equal(page.get('title'), 'Our Services Sed ut perspiciatis unde omnis iste');
            assert.equal(page.get('slug'), 'no-title');
            assert.deepEqual(names(page.data.tags), ['#sqs', '#no-title']);
            assert.equal(page.data.tags[1].data.slug, 'hash-no-title');
        });
    });

    it('Will clean up post slugs', async function () {
        await withExport(async context => {
            const posts = await mapped(context);
            assert.equal(posts[2].get('slug'), 'my-dated-post');
            assert.equal(posts[2].get('title'), 'My content.');
            assert.deepEqual(names(posts[2].data.tags), ['#sqs', '#no-title']);
        });
    });

    it('Can add a custom tag', async function () {
        await withExport(async context => {
            const [post] = await mapped(context, {addTag: ' Custom Tag '});
            assert.deepEqual(names(post.data.tags), ['Company News', 'Programming', 'Custom Tag', '#sqs']);
            assert.equal(post.data.tags[2].data.slug, 'custom-tag');

            const [hashed] = await mapped(context, {addTag: '#Migrated'});
            assert.deepEqual(names(hashed.data.tags), ['Company News', 'Programming', '#Migrated', '#sqs']);
            assert.equal(hashed.data.tags[2].data.slug, 'hash-migrated');

            const [blank] = await mapped(context, {addTag: '  '});
            assert.deepEqual(names(blank.data.tags), ['Company News', 'Programming', '#sqs']);
        });
    });

    it('Matches authors by login, display name or email, and credits others to a fallback author', async function () {
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => post.data.authors.map((entity: any) => entity.data.slug)),
                    [['jdoe'], ['jdoe'], ['jdoe'], ['migrator-added-author'], ['migrator-added-author']]
                );
                assert.deepEqual(
                    (await all(context.streamAuthors())).map(user => [user.data.slug, user.data.name, user.data.email]),
                    [
                        ['jdoe', 'Jane Doe', 'jane@example.com'],
                        ['migrator-added-author', 'Migrator Added Author', 'migrator-added-author@example.com']
                    ]
                );
            },
            author('1', 'jdoe', 'Jane Doe', 'jane@example.com') +
                '<wp:author><wp:author_display_name>Unkeyed</wp:author_display_name></wp:author>' +
                item('1', '<dc:creator>jdoe</dc:creator>') +
                item('2', '<dc:creator>Jane Doe</dc:creator>') +
                item('3', '<dc:creator>jane@example.com</dc:creator>') +
                item('4', '<dc:creator>Unkeyed</dc:creator>') +
                item('5')
        );
    });

    it('Keeps distinct authors whose slugs collide apart', async function () {
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => post.data.authors[0].data.slug),
                    ['jane', 'jane-2']
                );
                assert.deepEqual(
                    events(context, 'slug:renamed').map(event => event.details.newSlug),
                    ['jane-2']
                );
            },
            author('1', 'jane', 'Jane One') +
                author('2', 'Jane', 'Jane Two') +
                item('1', '<dc:creator>Jane One</dc:creator>') +
                item('2', '<dc:creator>Jane Two</dc:creator>')
        );
    });

    it('Merges authors with matching Ghost users and keeps their slugs reserved', async function () {
        await withExport(
            async context => {
                const ghostUsers = async function* () {
                    yield {
                        id: 'ghost-jane',
                        slug: 'jane-ghost',
                        name: 'Jane Ghost',
                        email: 'JANE@example.com',
                        roles: [{name: 'Owner'}]
                    };
                    yield {id: 'ghost-editor', slug: 'ed', name: 'Ed Itor', email: 'ed@example.com', roles: ['Editor']};
                    yield {id: 'ghost-joe', slug: 'joe', name: 'Joe', email: ''};
                };
                await map({}, context, {ghostUsers: ghostUsers()});
                const authors = (await context.getAllPosts()).map(post => post.data.authors[0]);
                assert.deepEqual(
                    authors.map(entity => [entity.ghostId, entity.data.slug, entity.data.roles]),
                    [
                        ['ghost-jane', 'jane-ghost', ['Contributor']],
                        ['ghost-jane', 'jane-ghost', ['Contributor']],
                        ['ghost-editor', 'ed', ['Editor']],
                        [ghostId('example.com', 'author', 'id:4'), 'joe-2', ['Contributor']]
                    ]
                );
                assert.deepEqual(
                    events(context, 'operation:warning').map(event => event.details),
                    [{author: 'id:1', reason: 'Unsupported author roles replaced by supported Ghost roles'}]
                );
                assert.equal((await all(context.streamAuthors())).length, 3);
            },
            author('1', 'jane', 'Jane', 'jane@example.com') +
                author('2', 'jane2', 'Jane Again', 'jane@example.com') +
                author('3', 'ed', 'Ed', 'ed@example.com') +
                author('4', 'joe', 'Joe') +
                item('1', '<dc:creator>jane</dc:creator>') +
                item('2', '<dc:creator>jane2</dc:creator>') +
                item('3', '<dc:creator>ed</dc:creator>') +
                item('4', '<dc:creator>joe</dc:creator>')
        );
    });

    it('Finds feature images by _thumbnail_id, or else in the following item', async function () {
        const attachment = (id: string, url: string) =>
            `<item><wp:post_id>${id}</wp:post_id><wp:post_type>attachment</wp:post_type><wp:attachment_url>${url}</wp:attachment_url></item>`;
        const thumbnail = (id: string) =>
            `<wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value>${id}</wp:meta_value></wp:postmeta>`;
        await withExport(
            async context => {
                const posts = await mapped(context);
                assert.deepEqual(
                    posts.map(post => [post.lookupKey, post.get('feature_image')]),
                    [
                        ['id:1', 'https://cdn.example.com/far.png'],
                        ['id:2', 'https://cdn.example.com/next.jpg'],
                        ['id:4', null],
                        ['id:6', null],
                        ['id:7', null],
                        ['id:8', null]
                    ]
                );
                const linked = context.sources.get('item', 'id:20')!;
                assert.deepEqual(
                    (await all(context.sources.entitiesFor(linked.id))).map(entity => entity.type),
                    ['post']
                );
            },
            attachment('20', 'https://cdn.example.com/far.png') +
                item('1', thumbnail('20')) +
                item('2') +
                attachment('3', 'https://cdn.example.com/next.jpg') +
                item('4', thumbnail('5')) +
                attachment('5', 'https://cdn.example.com/file.pdf') +
                item('6', thumbnail('404')) +
                item('7') +
                item('8')
        );
    });

    it('Identifies tags by slug and skips blank ones', async function () {
        await withExport(
            async context => {
                const [first, second] = await mapped(context);
                assert.deepEqual(
                    first.data.tags.map((tag: any) => [tag.data.name, tag.data.slug]),
                    [
                        ['News', 'news'],
                        ['No Nicename', 'no-nicename'],
                        ['#sqs', 'hash-sqs']
                    ]
                );
                // A later tag with a known slug is the same Ghost tag.
                assert.deepEqual(names(second.data.tags), ['News', '#sqs']);
                assert.equal((await all(context.streamTags())).length, 3);
                assert.equal(context.findLink('/tag/no-nicename'), null);
            },
            item(
                '1',
                '<category domain="category" nicename="news">News</category>' +
                    '<category domain="post_tag" nicename="news">News tag</category>' +
                    '<category domain="post_tag">No Nicename</category>' +
                    '<category domain="post_tag" nicename="blank"> </category>'
            ) + item('2', '<category domain="post_tag" nicename="news">News again</category>')
        );
    });

    it('Skips items with an invalid date, no ID or too many tags, and leaves out other types', async function () {
        const tooManyTags = Array.from(
            {length: 500},
            (_, n) => `<category domain="post_tag" nicename="tag-${n}">Tag ${n}</category>`
        ).join('');
        await withExport(
            async context => {
                assert.deepEqual(await map({}, context), {selected: 4, imported: 1, skipped: 3});
                assert.deepEqual(
                    events(context, 'record:skipped').map(event => event.details.reason),
                    [
                        'Invalid Squarespace publication date',
                        'Item has neither a Squarespace ID nor a usable URL',
                        'Post exceeds the Ghost tag limit'
                    ]
                );
                const [post] = await context.getAllPosts();
                assert.equal(post.get('slug'), 'untitled');
                assert.equal(post.get('title'), 'Post 5');
            },
            item('1', '<pubDate>never</pubDate>') +
                item(null, '<link>mailto:someone@example.com</link>') +
                item('3', tooManyTags) +
                item('4', '<wp:post_type>custom</wp:post_type>') +
                item('5', '<link></link>') +
                '<item><wp:post_id>6</wp:post_id></item>'
        );
    });

    it('Maps an export without items or authors', async function () {
        await withExport(async context => {
            assert.deepEqual(await map({}, context), {selected: 0, imported: 0, skipped: 0});
        }, '');
    });

    it('Requires completed source data', async function () {
        const context = await memoryContext();
        try {
            await assert.rejects(map({}, context), /Ingest a complete Squarespace export before mapping/);
        } finally {
            await context.close();
        }
    });
});
