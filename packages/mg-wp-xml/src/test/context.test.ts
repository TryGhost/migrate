import assert from 'node:assert/strict';
import {it, mock} from 'node:test';
import {mkdtemp, writeFile, rm, readFile, rename} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MigrateContext} from '@tryghost/mg-context';
import {inspectSource, ingest, map, ghostId, contentStats, sourceSite} from '../index.js';
import {canonicalSite, sourceUrl} from '../lib/ingest.js';

export const wrap = (items: string, authors = '', url = 'https://example.com', terms = '') =>
    `<rss><channel><link>${url}</link>${authors}${terms}${items}</channel></rss>`;
export const item = (id: string, extra = '', type = 'post', title = 'Title', url = `/post-${id}`) =>
    `<item><wp:post_id>${id}</wp:post_id><title>${title}</title><link>${url}</link><wp:post_name>title</wp:post_name><wp:post_type>${type}</wp:post_type><wp:status>publish</wp:status><pubDate>2024-01-02T00:00:00Z</pubDate><content:encoded><![CDATA[<p>Body</p>]]></content:encoded>${extra}</item>`;
const author = (id: string, login: string, email = `${id}@example.com`, name = login) =>
    `<wp:author><wp:author_id>${id}</wp:author_id><wp:author_login>${login}</wp:author_login><wp:author_display_name>${name}</wp:author_display_name><wp:author_email>${email}</wp:author_email></wp:author>`;
const category = (domain: string, slug: string, name: string) =>
    `<category domain="${domain}" nicename="${slug}">${name}</category>`;

async function setup(files: Record<string, string>) {
    const directory = await mkdtemp(join(tmpdir(), 'wp-context-'));
    for (const [name, content] of Object.entries(files)) {
        await writeFile(join(directory, name), content);
    }
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return {
        directory,
        context,
        ingest: async (replace = false) => ingest(await inspectSource(directory), context, {replace}),
        close: async () => {
            await context.close();
            await rm(directory, {recursive: true, force: true});
        }
    };
}

it('replays original records with new filters/options, stable IDs, fresh associations and final slug links', async () => {
    const fx = await setup({'source.xml': wrap(item('1') + item('2', '', 'page') + item('3', '', 'custom'))});
    try {
        await fx.ingest();
        await assert.rejects(fx.ingest(), /explicitly request replacement/);
        assert.equal((await map({addTag: 'First', cpt: ['custom']}, fx.context)).imported, 3);
        const before = await fx.context.getAllPosts();
        assert.deepEqual(
            before.map(post => post.data.slug),
            ['title', 'title-2', 'title-3']
        );
        assert.equal(fx.context.findLink('example.com/post-2'), '/title-2/');
        assert.equal((await map({pages: false, addTag: 'Second'}, fx.context)).imported, 1);
        const [after] = await fx.context.getAllPosts();
        assert.equal(after.ghostId, before[0].ghostId);
        assert.equal(after.hasTagName('First'), false);
        assert.equal(after.hasTagName('Second'), true);
        assert.equal(fx.context.findLink('example.com/post-2'), null);
        const originals = [];
        for await (const record of fx.context.sources.recordsFor({type: 'post', id: after.dbId!}))
            originals.push(record);
        assert.equal(originals[0].content, fx.context.sources.get('item', 'id:1')!.content);
        assert.equal(ghostId('example.com', 'post', 'id:1'), after.ghostId);
        assert.notEqual(ghostId('example.com', 'author', 'id:1'), after.ghostId);
        assert.deepEqual(await map({postsAfter: '2025-01-01'}, fx.context), {selected: 0, imported: 0, skipped: 0});
        assert.deepEqual(await map({postsBefore: '2020-01-01'}, fx.context), {selected: 0, imported: 0, skipped: 0});
        await assert.rejects(map({postsBefore: 'bad'}, fx.context), /Invalid postsBefore/);
        await assert.rejects(map({postsAfter: 'bad'}, fx.context), /Invalid postsAfter/);
    } finally {
        await fx.close();
    }
});

it('selects the newest overlapping item, retains first author profiles, and stages later metadata', async () => {
    const old = item(
        '1',
        '<wp:post_modified_gmt>2024-01-01 00:00:00</wp:post_modified_gmt><wp:postmeta><wp:meta_key>_thumbnail_id</wp:meta_key><wp:meta_value> 10 </wp:meta_value></wp:postmeta><dc:creator>alice</dc:creator>'
    );
    const newer = old
        .replace('2024-01-01 00:00:00', '2025-01-01 00:00:00')
        .replace('<title>Title</title>', '<title>Newer</title>');
    const attachment = item(
        ' 10 ',
        '<wp:attachment_url>https://example.com/image.png</wp:attachment_url>',
        'attachment'
    );
    const fx = await setup({
        'a.xml': wrap(old, author('1', 'alice', 'alice@example.com', 'Original')),
        'b.xml': wrap(newer + attachment, author('1', 'alice', 'other@example.com', 'Changed')),
        'c.xml': wrap(old)
    });
    try {
        await fx.ingest();
        assert.equal((await map({}, fx.context)).imported, 1);
        const [post] = await fx.context.getAllPosts();
        assert.equal(post.data.title, 'Newer');
        assert.equal(post.data.feature_image, 'https://example.com/image.png');
        assert.equal(post.data.authors[0].data.name, 'Original');
        assert.equal(
            fx.context.getMigrationReport().events.filter(event => event.type === 'source:conflict').length,
            3
        );
        assert.deepEqual(await contentStats(await inspectSource(fx.directory)), {posts: 3, pages: 0});
        await map({}, fx.context);
        assert.equal(
            fx.context.getMigrationReport().events.filter(event => event.type === 'source:conflict').length,
            3
        );
    } finally {
        await fx.close();
    }
});

it('keeps the first overlapping item when modification dates tie or are missing', async () => {
    const first = item('1', '<wp:post_modified>2024-01-01 00:00:00</wp:post_modified>');
    const fx = await setup({
        'a.xml': wrap(first + item('2')),
        'b.xml': wrap(first.replace('Title', 'Second') + item('2', '', 'post', 'Other'))
    });
    try {
        await fx.ingest();
        await map({}, fx.context);
        assert.deepEqual(
            (await fx.context.getAllPosts()).map(post => post.data.title),
            ['Title', 'Title']
        );
    } finally {
        await fx.close();
    }
});

it('retains distinct authors and terms with colliding slugs and uses WordPress lookup indexes', async () => {
    const terms =
        '<wp:category><wp:term_id>1</wp:term_id><wp:category_nicename>same</wp:category_nicename></wp:category><wp:tag><wp:term_id>2</wp:term_id><wp:tag_slug>same</wp:tag_slug></wp:tag><wp:term><wp:term_id>3</wp:term_id><wp:term_taxonomy>country</wp:term_taxonomy><wp:term_slug>same</wp:term_slug></wp:term>';
    const categories =
        category('category', 'same', 'Category') +
        category('post_tag', 'same', 'Tag') +
        category('country', 'same', 'Country');
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>Alice Smith</dc:creator>' + categories) +
                item('2', '<dc:creator>Alice-Smith</dc:creator>' + categories),
            author('1', 'Alice Smith') + author('2', 'Alice-Smith'),
            undefined,
            terms
        )
    });
    try {
        await fx.ingest();
        await map({customTaxonomies: ['country']}, fx.context);
        const posts = await fx.context.getAllPosts();
        assert.notEqual(posts[0].data.authors[0].ghostId, posts[1].data.authors[0].ghostId);
        assert.notEqual(posts[0].data.authors[0].data.slug, posts[1].data.authors[0].data.slug);
        assert.deepEqual(
            posts[0].data.tags.slice(0, 3).map((tag: any) => tag.data.slug),
            ['same', 'same-2', 'same-3']
        );
        assert.equal(posts[0].data.tags[0].ghostId, posts[1].data.tags[0].ghostId);
    } finally {
        await fx.close();
    }
});

it('matches destination authors by email without changing original source or source-derived IDs', async () => {
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>alice</dc:creator>') + item('2', '<dc:creator>bob</dc:creator>'),
            author('1', 'alice', 'shared@example.com') + author('2', 'bob', 'shared@example.com')
        )
    });
    try {
        await fx.ingest();
        const user = {
            id: '0123456789abcdef01234567',
            slug: 'destination',
            name: 'Destination',
            email: 'shared@example.com',
            roles: ['Editor', 'Unsupported']
        };
        async function* users() {
            yield user;
            yield {...user, email: ''};
        }
        await map({}, fx.context, {ghostUsers: users()});
        const posts = await fx.context.getAllPosts();
        assert.equal(posts[0].data.authors[0].ghostId, user.id);
        assert.equal(posts[1].data.authors[0].ghostId, user.id);
        assert.deepEqual(posts[0].data.authors[0].data.roles, ['Editor']);
        await map({}, fx.context, {ghostUsers: [{...user, roles: ['Unsupported']}]});
        assert.deepEqual((await fx.context.getAllPosts())[0].data.authors[0].data.roles, ['Contributor']);
        await map({}, fx.context);
        assert.notEqual((await fx.context.getAllPosts())[0].data.authors[0].ghostId, user.id);
        assert.equal(JSON.parse(fx.context.sources.get('author', 'id:1')!.content)['wp:author_login'], 'alice');
    } finally {
        await fx.close();
    }
});

it('uses URL identity only without an ID and skips known data errors while preserving original records', async () => {
    const good = item('', '', 'post', 'URL identity', '/url-only');
    const missing = item('', '', 'post', 'No identity', '');
    const badDate = item('3').replace('2024-01-02T00:00:00Z', 'bad-date');
    const badUrl = item('4', '', 'post', 'Bad URL', 'javascript:alert(1)');
    const noUrl = item('5', '', 'post', 'No URL', '');
    const fx = await setup({'a.xml': wrap(good + missing + badDate + badUrl + noUrl)});
    try {
        await fx.ingest();
        assert.deepEqual(await map({}, fx.context), {selected: 5, imported: 2, skipped: 3});
        assert.ok(fx.context.sources.get('item', 'url:https://example.com/url-only'));
        const posts = await fx.context.getAllPosts();
        assert.equal(posts[1].data.title, 'No URL');
        assert.equal(JSON.parse(fx.context.sources.get('item', posts[1].lookupKey!)!.content).link, '');
        assert.equal(fx.context.getMigrationReport().events.filter(event => event.type === 'record:skipped').length, 3);
        assert.equal((await map({drafts: false}, fx.context)).skipped, 3);
        const savepoint = fx.context.savepoint.bind(fx.context);
        let calls = 0;
        const error = mock.method(fx.context, 'savepoint', async (callback: () => unknown) => {
            if (++calls === 2) throw new Error('unexpected defect');
            return savepoint(callback);
        });
        await assert.rejects(map({}, fx.context), /unexpected defect/);
        error.mock.restore();
    } finally {
        await fx.close();
    }
});

it('does not merge ambiguous author aliases and supplies profile/tag defaults', async () => {
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>alice-smith</dc:creator>') +
                item(
                    '2',
                    '<dc:creator>unknown</dc:creator>' + category('category', '', '🌍') + category('post_tag', '', '')
                ),
            author('1', 'Alice Smith') + author('2', 'Alice-Smith')
        )
    });
    try {
        await fx.ingest();
        assert.deepEqual(await map({}, fx.context), {selected: 2, imported: 1, skipped: 1});
        const [post] = await fx.context.getAllPosts();
        assert.equal(post.data.authors[0].data.name, 'Unknown');
        assert.equal(post.data.authors[0].data.email, 'unknown@example.com');
        assert.equal(post.data.tags[0].data.slug, 'tag');
    } finally {
        await fx.close();
    }
});

it('requires completed data, rejects invalid input atomically, and leaves rereading to the caller', async () => {
    for (const source of ['<rss><channel/></rss>', '<rss>', wrap('') + wrap(''), wrap('', '', 'ftp://example.com')]) {
        const fx = await setup({'a.xml': source});
        try {
            await assert.rejects(map({}, fx.context), /complete WordPress/);
            await assert.rejects(fx.ingest());
            assert.equal(fx.context.sources.hasCompletedIngestion, false);
        } finally {
            await fx.close();
        }
    }
    const fx = await setup({'a.xml': wrap(item('1')), 'b.xml': wrap(item('2'), '', 'https://other.com')});
    try {
        await assert.rejects(fx.ingest(), /different WordPress sites/);
        assert.equal(fx.context.sources.hasCompletedIngestion, false);
        await rm(join(fx.directory, 'b.xml'));
        await fx.ingest();
        await writeFile(join(fx.directory, 'a.xml'), wrap(item('3')));
        await map({}, fx.context);
        assert.equal((await fx.context.getAllPosts())[0].lookupKey, 'id:1');
        await assert.rejects(fx.ingest(), /explicitly request replacement/);
        await fx.ingest(true);
        await map({}, fx.context);
        assert.equal((await fx.context.getAllPosts())[0].lookupKey, 'id:3');
        assert.equal(canonicalSite('http://EXAMPLE.com/blog/'), 'example.com/blog');
        assert.equal(sourceUrl('ftp://example.com/file', 'https://example.com'), undefined);
        assert.equal(sourceUrl('/relative', 'invalid'), undefined);
        assert.equal(sourceUrl(' ', 'https://example.com'), undefined);
    } finally {
        await fx.close();
    }
});

it('keeps empty exports complete and deterministically rewrites dated permalinks', async () => {
    const fx = await setup({'a.xml': wrap('')});
    try {
        await fx.ingest();
        assert.deepEqual(await map({}, fx.context), {selected: 0, imported: 0, skipped: 0});
        fx.context.reset();
        await writeFile(join(fx.directory, 'a.xml'), wrap(item('1', '', 'post', 'Title', '/blog/2024/01/02/title/')));
        await fx.ingest();
        await map({datedPermalinks: '/yyyy/mm/dd/'}, fx.context);
        assert.equal(fx.context.findLink('example.com/blog/2024/01/02/title/'), '/2024/01/02/title/');
        await map({datedPermalinks: '/yyyy/mm/'}, fx.context);
        assert.equal(fx.context.findLink('example.com/blog/2024/01/02/title/'), '/2024/01/title/');
    } finally {
        await fx.close();
    }
});

it('preserves canonical author profiles across login aliases and falls back from invalid GMT revisions', async () => {
    const first = item(
        '1',
        '<wp:post_modified_gmt>invalid</wp:post_modified_gmt><wp:post_modified>2024-01-01 00:00:00</wp:post_modified><dc:creator>renamed</dc:creator>'
    );
    const newer = first
        .replace('2024-01-01 00:00:00', '2025-01-01T00:00:00+0000')
        .replace('<title>Title</title>', '<title>Latest</title>');
    const fx = await setup({
        'a.xml': wrap(first, author('1', 'original', 'alice@example.com', 'Canonical')),
        'b.xml': wrap(newer, author('1', 'renamed', 'alice@example.com', 'Changed'))
    });
    try {
        await fx.ingest();
        await map({}, fx.context);
        const [post] = await fx.context.getAllPosts();
        assert.equal(post.data.title, 'Latest');
        assert.equal(post.data.authors[0].data.name, 'Canonical');
        assert.equal(post.data.authors[0].data.slug, 'original');
    } finally {
        await fx.close();
    }
});

it('uses the explicit WordPress blog URL as the site namespace', async () => {
    const fx = await setup({
        'a.xml': wrap(item('1')).replace(
            '<link>https://example.com</link>',
            '<link>https://example.com</link><wp:base_blog_url>http://example.com/blog/</wp:base_blog_url>'
        )
    });
    try {
        await fx.ingest();
        assert.deepEqual(await sourceSite(fx.context), {site: 'example.com/blog', url: 'http://example.com/blog/'});
    } finally {
        await fx.close();
    }
});

it('reserves destination author slugs so unmatched source authors cannot rename matched Ghost users', async () => {
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>same</dc:creator>') + item('2', '<dc:creator>bob</dc:creator>'),
            author('1', 'same', 'source@example.com') + author('2', 'bob', 'bob@example.com')
        )
    });
    try {
        await fx.ingest();
        const ghost = {id: '0123456789abcdef01234567', slug: 'same', name: 'Destination', email: 'bob@example.com'};
        await map({}, fx.context, {ghostUsers: [ghost]});
        const posts = await fx.context.getAllPosts();
        assert.equal(posts[0].data.authors[0].data.slug, 'same-2');
        assert.equal(posts[1].data.authors[0].data.slug, 'same');
        assert.equal(posts[1].data.authors[0].ghostId, ghost.id);
        const id = posts[0].ghostId;
        fx.context.reset();
        await fx.ingest();
        await map({}, fx.context);
        assert.equal((await fx.context.getAllPosts())[0].ghostId, id);
    } finally {
        await fx.close();
    }
});

it('reports posts exceeding Ghost relationship limits as known source-data failures', async () => {
    for (const domain of ['author', 'post_tag']) {
        const relationships = Array.from({length: 501}, (_, index) =>
            category(domain, `term-${index}`, `Term ${index}`)
        ).join('');
        const fx = await setup({'a.xml': wrap(item('1', relationships))});
        try {
            await fx.ingest();
            assert.deepEqual(await map({}, fx.context), {selected: 1, imported: 0, skipped: 1});
            assert.ok(
                fx.context
                    .getMigrationReport()
                    .events.some(
                        event =>
                            event.type === 'record:skipped' &&
                            JSON.stringify(event.details).includes('relationship limits')
                    )
            );
            assert.equal(fx.context.hasContent(), false);
        } finally {
            await fx.close();
        }
    }
});

it('indexes unkeyed definitions without inventing identities and distinguishes same-taxonomy term names', async () => {
    const terms =
        '<wp:category><wp:term_id>1</wp:term_id><wp:category_nicename>same</wp:category_nicename><wp:cat_name>First</wp:cat_name></wp:category>' +
        '<wp:category><wp:term_id>2</wp:term_id><wp:category_nicename>same</wp:category_nicename><wp:cat_name>Second</wp:cat_name></wp:category>' +
        '<wp:tag><wp:tag_slug>no-id</wp:tag_slug></wp:tag><wp:tag/>';
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>login-only</dc:creator>' + category('category', 'same', 'First')) +
                item('2', category('category', 'same', 'Second')) +
                item('3', category('category', 'same', 'Ambiguous')),
            '<wp:author/><wp:author><wp:author_login>login-only</wp:author_login></wp:author>',
            undefined,
            terms
        )
    });
    try {
        await ingest(fx.directory, fx.context);
        assert.ok(fx.context.sources.get('author', 'login:login-only'));
        assert.ok(fx.context.sources.get('term', 'post_tag:slug:no-id'));
        assert.deepEqual(await map({}, fx.context), {selected: 3, imported: 2, skipped: 1});
        const posts = await fx.context.getAllPosts();
        assert.deepEqual(
            posts.map(post => post.data.tags[0].data.slug),
            ['same', 'same-2']
        );
        assert.notEqual(posts[0].data.tags[0].ghostId, posts[1].data.tags[0].ghostId);
        assert.equal(posts[0].data.authors[0].data.name, 'Login Only');
        assert.equal(fx.context.sources.count('author'), 2);
    } finally {
        await fx.close();
    }
});

it('requires site metadata even when a caller completes an empty generic ingestion', async () => {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    try {
        await context.sources.ingest({}, () => {});
        await assert.rejects(map({}, context), /no site URL/);
    } finally {
        await context.close();
    }
});

it('allocates separate slugs after Ghost whitespace normalization and retains distinct fallback authors', async () => {
    const fx = await setup({
        'a.xml': wrap(
            item('1', '<dc:creator>Alice Smith</dc:creator>' + category('category', ' same ', 'First')) +
                item('2', '<dc:creator>Alice-Smith</dc:creator>' + category('category', 'same', 'Second')) +
                item('3', category('category', '-', 'Hyphen'))
        )
    });
    try {
        await fx.ingest();
        await map({}, fx.context);
        const posts = await fx.context.getAllPosts();
        assert.deepEqual(
            posts.map(post => post.data.tags[0].data.slug),
            ['same', 'same-2', 'tag']
        );
        assert.notEqual(posts[0].data.authors[0].ghostId, posts[1].data.authors[0].ghostId);
        assert.notEqual(posts[0].data.authors[0].data.slug, posts[1].data.authors[0].data.slug);
        const original = fx.context.sources.get('item', 'id:1')!.content;
        await map({}, fx.context);
        assert.equal(fx.context.sources.get('item', 'id:1')!.content, original);
        assert.ok(fx.context.getMigrationReport().events.some(event => event.type === 'slug:renamed'));
    } finally {
        await fx.close();
    }
});
