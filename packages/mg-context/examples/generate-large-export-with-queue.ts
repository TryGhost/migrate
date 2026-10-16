// Run from packages/mg-context/ with:
//   pnpm exec tsx examples/generate-large-export-with-queue.ts --count 1000
import {resolve} from 'node:path';
import {setImmediate} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import {Queue, type Task} from '@tryghost/mg-queue';
import {MigrateContext} from '../src/index.js';

const BATCH_SIZE = 1000;

// Stand-in for I/O such as fetching or transforming assets. Queue concurrency is
// useful when real tasks spend time waiting for a network or file operation.
async function enrichHtml(html: string): Promise<string> {
    await setImmediate();
    return `${html}\n<p><em>Enriched by mg-queue.</em></p>`;
}

async function main() {
    const {values} = parseArgs({
        options: {
            count: {type: 'string'},
            db: {type: 'string'},
            output: {type: 'string'},
            'reread-source': {type: 'boolean'}
        }
    });
    const postCount = Number(values.count ?? '500000');
    if (!Number.isSafeInteger(postCount) || postCount < 1) {
        throw new Error('--count must be a positive integer.');
    }

    const dbPath = values.db === undefined ? undefined : resolve(values.db);
    if (values['reread-source'] && !dbPath) {
        throw new Error('--reread-source requires --db; the temporary database starts empty on every run.');
    }
    const outputDir = resolve(values.output ?? './export/files/queue-posts/');
    const ctx = new MigrateContext({
        dbPath,
        contentIdentity: dbPath
            ? {
                  source: 'mg-context-example:large-export-with-queue',
                  revision: `synthetic-${postCount}-v1`
              }
            : undefined,
        resetContent: values['reread-source'] ?? false
    });
    await ctx.init();

    let peakRss = process.memoryUsage().rss;
    const memoryInterval = setInterval(() => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 100);
    memoryInterval.unref();

    try {
        const stored = ctx.hasContent();
        if (stored && stored.posts !== postCount) {
            throw new Error(`Found ${stored.posts} of ${postCount} source posts. Rerun with --reread-source.`);
        }

        // Ingest raw source records only when the database is empty.
        if (!stored) {
            console.log(`Ingesting ${postCount.toLocaleString()} source posts...`);
            for (let batchStart = 0; batchStart < postCount; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE, postCount);
                await ctx.transaction(async () => {
                    for (let i = batchStart; i < batchEnd; i++) {
                        await ctx.addSourcePost(post => {
                            post.setSource('lookupKey', `synthetic-post-${i + 1}`);
                            post.setSource('content', JSON.stringify({
                                index: i,
                                html: `<p>Original HTML for post ${i + 1}.</p>`
                            }));
                        });
                    }
                });
            }
        } else {
            console.log(`Reusing source posts in ${ctx.databasePath}`);
        }

        // Replay the mapping from original source content on every run.
        console.log('Mapping posts from stored source...');
        await ctx.forEachPost(async post => {
            const {index, html} = JSON.parse(post.sourceContent!) as {index: number; html: string};
            const postDate = new Date(2025, 0, 1, 0, index * 6);
            post.set('title', `Post Number ${index + 1}`);
            post.set('slug', `post-number-${index + 1}`);
            post.set('status', 'published');
            post.set('created_at', postDate);
            post.set('published_at', postDate);
            post.set('html', html);
        }, {batchSize: BATCH_SIZE});

        // Feed the queue lazily: only the current stream batch and active tasks
        // are held in memory. Patch HTML without rewriting post relationships.
        async function* postTasks(): AsyncGenerator<Task> {
            for await (const post of ctx.streamPosts({batchSize: BATCH_SIZE})) {
                const dbId = post.dbId!;
                const slug = post.get('slug') as string;
                const html = post.get('html') as string;
                yield {
                    title: `Enrich ${slug}`,
                    task: async () => {
                        const enrichedHtml = await enrichHtml(html);
                        ctx.updatePostData(dbId, {html: enrichedHtml});
                    }
                };
            }
        }

        console.log('Enriching posts with mg-queue...');
        const queue = new Queue({
            concurrency: 8,
            renderer: process.stdout.isTTY ? 'dynamic' : 'silent'
        });
        const stats = await queue.run(postTasks());
        if (stats.errors.length > 0) {
            throw new AggregateError(stats.errors.map(({error}) => error), `${stats.errors.length} queue tasks failed.`);
        }
        if (stats.completed !== postCount) {
            throw new Error(`Queue completed ${stats.completed} of ${postCount} posts; export was not written.`);
        }

        console.log('Writing Ghost JSON...');
        const files = await ctx.writeGhostJson(outputDir, {
            batchSize: 5000,
            filename: 'queue-export',
            onWrite(file) {
                console.log(`  ${file.name}: ${file.posts.toLocaleString()} posts`);
            }
        });
        console.log(`Done: ${files.length} file(s), peak RSS ${(peakRss / 1024 / 1024).toFixed(1)} MB`);
    } finally {
        clearInterval(memoryInterval);
        await ctx.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
