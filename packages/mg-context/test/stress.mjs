import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {MigrateContext, PostContext} from '../build/index.js';

const count = Number(process.env.MG_CONTEXT_STRESS_RECORDS ?? 100000);
const directory = await mkdtemp(join(tmpdir(), 'mg-context-stress-'));
const ctx = new MigrateContext({dbPath: join(directory, 'source.sqlite')});
const started = Date.now();
let succeeded = false;
try {
    await ctx.init();
    const body = '<p>' + 'x'.repeat(10233) + '</p>';
    assert.equal(Buffer.byteLength(body), 10240);
    await ctx.sources.ingest({metadata: {records: count}}, async stage => {
        async function* input() {
            for (let index = 0; index < count; index += 1) {
                yield {kind: 'post', key: String(index), content: JSON.stringify({index, body}), format: 'json'};
            }
        }
        await stage.write(input());
    });
    let committedEvents = 0;
    ctx.on('field:sanitized', () => {
        committedEvents += 1;
    });
    await ctx.rebuildMappedContent(async () => {
        for await (const source of ctx.sources.records()) {
            const {index, body: html} = JSON.parse(source.content);
            const post = new PostContext({lookupKey: source.key});
            post.set('title', index % 13 === 0 ? 'T'.repeat(300) : `Post ${index}`);
            post.set('slug', `collision-${Math.floor(index / 4)}`);
            post.set('html', html);
            post.set('created_at', new Date('2026-01-01T00:00:00Z'));
            post.addTag({name: `Tag ${index}`, slug: `tag-${index}`});
            post.addAuthor({name: `Author ${index}`, slug: `author-${index}`, email: `author-${index}@example.com`});
            post.save(ctx.db);
            ctx.sources.link(source.id, {type: 'post', id: post.dbId});
            ctx.sources.link(source.id, {type: 'tag', id: post.data.tags[0].dbId});
            ctx.sources.link(source.id, {type: 'author', id: post.data.authors[0].dbId});
            ctx.addLink(`https://example.com/${index}`, `/${post.data.slug}`);
            if (index % 11 === 0) {
                ctx.recordDiagnostic('mapping:warning', {reason: 'stress diagnostic'}, source.id);
            }
        }
    });
    assert.ok(committedEvents > 0);
    assert.equal(ctx.sources.count(), count);
    assert.equal(ctx.hasContent().posts, count);
    assert.equal(ctx.hasContent().users, count);
    assert.equal(ctx.hasContent().tags, count);
    let exported = 0;
    let bytes = 0;
    for await (const file of ctx.writeGhostJsonStream(join(directory, 'import'), {batchSize: 2000})) {
        exported += file.posts;
        for await (const chunk of createReadStream(file.path)) {
            bytes += chunk.length;
        }
    }
    assert.equal(exported, count);
    const report = join(directory, 'report.json');
    await ctx.writeMigrationReport(report, {records: count});
    for await (const chunk of createReadStream(report)) {
        bytes += chunk.length;
    }
    const maxRssMiB = process.resourceUsage().maxRSS / 1024;
    assert.ok(maxRssMiB < 512, `RSS ${maxRssMiB.toFixed(1)} MiB exceeds 512 MiB`);
    // eslint-disable-next-line no-console
    console.log(
        JSON.stringify({
            records: count,
            bodyBytes: 10240,
            maxRssMiB,
            outputBytes: bytes,
            seconds: (Date.now() - started) / 1000
        })
    );
    succeeded = true;
} finally {
    await ctx.close();
    if (succeeded) {
        await rm(directory, {recursive: true, force: true});
    } else {
        // eslint-disable-next-line no-console
        console.error(`Stress files retained at ${directory}`);
    }
}
