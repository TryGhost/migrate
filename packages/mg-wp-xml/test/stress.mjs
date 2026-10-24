import assert from 'node:assert/strict';
import {mkdtemp, open, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import source from '../../migrate/sources/wp-xml.js';

const count = Number(process.env.MG_WP_STRESS_POSTS || 100000);
const directory = await mkdtemp(join(tmpdir(), 'wp-xml-stress-'));
const pathToFile = join(directory, 'source.xml');
const input = await open(pathToFile, 'w');
const body = `<p>${'x'.repeat(10 * 1024 - 7)}</p>`;
const started = Date.now();
let succeeded = false;
try {
    await input.write('<rss><channel><link>https://example.com</link>');
    for (let index = 0; index < count; index++) {
        await input.write(
            `<wp:author><wp:author_id>${index}</wp:author_id><wp:author_login>author-${index}</wp:author_login><wp:author_display_name> Author ${index} </wp:author_display_name><wp:author_email>author-${index}@example.com</wp:author_email></wp:author><item><wp:post_id>${index}</wp:post_id><wp:post_name>post-${Math.floor(index / 4)}</wp:post_name><title>Post ${index}</title><link>https://example.com/old-${index}/</link><wp:post_type>post</wp:post_type><wp:status>publish</wp:status><dc:creator>author-${index}</dc:creator><pubDate>2024-01-01T00:00:00Z</pubDate><category domain="category" nicename="category-${index}">Category ${index}</category><content:encoded><![CDATA[${body}]]></content:encoded></item>`
        );
    }
    await input.write('</channel></rss>');
    await input.close();
    process.stdout.write(`Generated ${count} posts; starting complete migration.\n`);
    const context = {};
    let uploads = 0;
    let uploadedBytes = 0;
    await source
        .getTaskRunner({
            pathToFile,
            tmpPath: directory,
            outputPath: directory,
            scrape: ['none'],
            cache: true,
            zip: true,
            postsPerFile: 2000,
            renderer: 'silent',
            outputStorage: {
                async upload({body: stream, fileName, size}) {
                    assert.ok(stream instanceof Readable, `${fileName} must stream`);
                    let bytes = 0;
                    for await (const chunk of stream) {
                        bytes += chunk.length;
                    }
                    assert.equal(bytes, size);
                    uploads++;
                    uploadedBytes += bytes;
                    return `test-storage://${fileName}`;
                }
            }
        })
        .run(context);
    assert.equal(context.summary.imported, count);
    assert.equal(context.summary.skipped, 0);
    assert.equal(context.exportedFiles, Math.ceil(count / 2000));
    assert.equal(uploads, 2);
    const maxRssMiB = process.resourceUsage().maxRSS / 1024;
    assert.ok(maxRssMiB < 512, `Peak RSS ${maxRssMiB.toFixed(1)} MiB exceeds 512 MiB`);
    process.stdout.write(
        JSON.stringify({
            posts: count,
            htmlBytesPerPost: Buffer.byteLength(body),
            maxRssMiB,
            uploadedBytes,
            seconds: (Date.now() - started) / 1000
        }) + '\n'
    );
    succeeded = true;
} finally {
    await input.close();
    if (succeeded) {
        await rm(directory, {recursive: true, force: true});
    } else {
        process.stderr.write(`Stress test files retained at ${directory}\n`);
    }
}
