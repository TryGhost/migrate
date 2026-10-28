import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MigrateContext} from '@tryghost/mg-context';
import {inspectSource, ingest, map} from '../index.js';
import {processWPMeta, processAttachment, preProcessContent} from '../lib/process.js';

it('preserves malformed PHP metadata and reports retry failures without console output', async () => {
    const value = 'a:1:{s:3:"bad";garbage;}';
    const post = {'wp:postmeta': {'wp:meta_key': 'broken', 'wp:meta_value': value}};
    const warnings: unknown[] = [];
    assert.equal((await processWPMeta(post, warning => warnings.push(warning))).broken, value);
    assert.equal(warnings.length, 1);
    assert.equal((await processWPMeta(post)).broken, value);
});

it('handles empty bodies, strips empty anchors, and preserves attachment metadata dimensions', async () => {
    assert.equal(await preProcessContent({html: ''}), '');
    const html = await preProcessContent({html: '<a id="empty"></a><a href="/real">Real</a>'});
    assert.ok(!html.includes('empty'));
    assert.ok(html.includes('Real'));
    const attachment = await processAttachment({
        'wp:postmeta': {
            'wp:meta_key': '_wp_attachment_metadata',
            'wp:meta_value': 'a:2:{s:5:"width";i:100;s:6:"height";i:200;}'
        }
    });
    assert.equal(attachment.width, 100);
    assert.equal(attachment.height, 200);
    assert.equal(attachment.url, null);
    assert.equal(attachment.title, null);
});

it('imports guest co-authors, empty profiles, internal tag names and invalid audio enclosures', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wp-data-'));
    const context = new MigrateContext({storage: 'memory'});
    const header = '<rss><channel><link>https://example.com</link>';
    const post = (id: string, extra: string) =>
        `<item><wp:post_id>${id}</wp:post_id><title>Title</title><link>/post-${id}</link><wp:post_name>post-${id}</wp:post_name><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><pubDate>2024-01-01T00:00:00Z</pubDate><content:encoded/><wp:post_modified_gmt>2024-01-01T00:00:00Z</wp:post_modified_gmt>${extra}</item>`;
    try {
        await context.init();
        let content =
            header +
            '<wp:author><wp:author_login>someone</wp:author_login><wp:author_description>Bio</wp:author_description><wp:author_avatar>https://example.com/avatar.jpg</wp:author_avatar></wp:author>';
        content += post(
            '1',
            '<category domain="author" nicename="guest">Guest Writer</category><category domain="author" nicename="other">Other Writer</category><category domain="author" nicename="">Empty</category>'
        );
        for (const [index, value] of [
            'incomplete',
            'https://example.com/file\n100\nvideo/mp4',
            'a:1:{i:0;s:5:"audio";}'
        ].entries()) {
            content += post(
                String(index + 2),
                `<wp:postmeta><wp:meta_key>enclosure</wp:meta_key><wp:meta_value>${value}</wp:meta_value></wp:postmeta>`
            );
        }
        content += post(
            '5',
            '<dc:creator>someone</dc:creator><category domain="category" nicename="internal">#Internal</category><wp:postmeta><wp:meta_key>broken</wp:meta_key><wp:meta_value>a:1:{s:3:"bad";garbage;}</wp:meta_value></wp:postmeta>'
        );
        await writeFile(join(directory, 'a.xml'), content + '</channel></rss>');
        await ingest(await inspectSource(directory), context);
        await map({}, context);
        const posts = await context.getAllPosts();
        assert.equal(posts[0].data.authors.length, 2);
        assert.equal(posts[0].data.authors[0].data.name, 'Guest Writer');
        assert.ok(posts.slice(1, 4).every(item => !item.data.html.includes('<audio')));
        assert.equal(posts[4].data.tags[0].data.slug, 'hash-internal');
        assert.ok(context.getMigrationReport().events.some(event => event.type === 'operation:warning'));
        context.reset();
        await writeFile(
            join(directory, 'a.xml'),
            header + '<wp:author><wp:author_id>1</wp:author_id></wp:author>' + post('1', '') + '</channel></rss>'
        );
        await ingest(await inspectSource(directory), context);
        await map({}, context);
        const [empty] = await context.getAllPosts();
        assert.equal(empty.data.authors[0].data.name, 'Example User');
        assert.equal(empty.data.authors[0].data.slug, 'example-user');
    } finally {
        await context.close();
        await rm(directory, {recursive: true});
    }
});

it('normalizes oversized SEO fields through context and reports nontext SEO metadata as a data error', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wp-seo-data-'));
    const context = new MigrateContext({storage: 'memory'});
    try {
        await context.init();
        const makePost = (id: string, value: string) =>
            `<item><wp:post_id>${id}</wp:post_id><title>Post</title><link>/post-${id}</link><wp:post_name>post-${id}</wp:post_name><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><pubDate>2024-01-01T00:00:00Z</pubDate><wp:postmeta><wp:meta_key>_yoast_wpseo_title</wp:meta_key><wp:meta_value>${value}</wp:meta_value></wp:postmeta></item>`;
        await writeFile(
            join(directory, 'a.xml'),
            `<rss><channel><link>https://example.com</link>${makePost('1', 'x'.repeat(301))}${makePost('2', 'a:1:{i:0;s:3:"bad";}')}</channel></rss>`
        );
        await ingest(await inspectSource(directory), context);
        assert.deepEqual(await map({}, context), {selected: 2, imported: 1, skipped: 1});
        const [post] = await context.getAllPosts();
        assert.equal(post.data.meta_title.length, 300);
        assert.ok(
            context
                .getMigrationReport()
                .events.some(
                    event => event.type === 'field:sanitized' && JSON.stringify(event.details).includes('meta_title')
                )
        );
    } finally {
        await context.close();
        await rm(directory, {recursive: true});
    }
});
