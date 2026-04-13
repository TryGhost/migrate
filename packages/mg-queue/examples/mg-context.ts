// Run from the packages/mg-queue/ directory:
//   npx tsx examples/mg-context.ts
//
// Demonstrates using mg-context's streamPosts() to feed posts into a queue.
// mg-context handles the database and post model; mg-queue handles concurrency.
//
// The database is persisted to examples/posts.db — re-run to process again.
/* eslint-disable no-console */
import {dirname, join} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '@tryghost/mg-context';
import {Queue, Task, DynamicRenderer} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'posts.db');

const POST_COUNT = 5000;
const BATCH_SIZE = 100;

const tags = [
    {name: 'News', slug: 'news'},
    {name: 'Technology', slug: 'technology'},
    {name: 'Guides', slug: 'guides'}
];

const authors = [
    {name: 'Alice Johnson', slug: 'alice-johnson', email: 'alice@example.com'},
    {name: 'Bob Smith', slug: 'bob-smith', email: 'bob@example.com'}
];

async function main() {
    const dbExists = existsSync(DB_PATH);
    const ctx = new MigrateContext({dbPath: DB_PATH, ephemeral: false});
    await ctx.init();

    // Only populate the database on the first run
    if (!dbExists) {
        console.log(`Creating ${POST_COUNT} posts...`);

        for (let batchStart = 0; batchStart < POST_COUNT; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, POST_COUNT);

            await ctx.transaction(async () => {
                for (let i = batchStart; i < batchEnd; i++) {
                    const post = await ctx.addPost();
                    post.set('title', `Post ${i + 1}`);
                    post.set('slug', `post-${i + 1}`);
                    post.set('status', 'published');
                    const postDate = new Date(2025, 0, 1 + i);
                    post.set('created_at', postDate);
                    post.set('published_at', postDate);
                    post.set('html', `<p>Content for post ${i + 1}. This has some words to process.</p>`);
                    post.addTag(tags[i % tags.length]);
                    post.addAuthor(authors[i % authors.length]);
                    await post.save(ctx.db);
                }
            });
        }

        console.log(`Database created at ${DB_PATH}\n`);
    } else {
        console.log(`Using existing database at ${DB_PATH}\n`);
    }

    // Step 2: Stream posts from mg-context and process them through a queue
    async function* postTasks(): AsyncGenerator<Task> {
        for await (const post of ctx.streamPosts({batchSize: 200})) {
            const title = post.get('title');
            const html = post.get('html') as string;

            yield {
                title: `${post.get('slug')}: ${title}`,
                task: async () => {
                    // Simulate processing — e.g. HTML cleanup, image scraping
                    await new Promise((resolve) => setTimeout(resolve, 10));
                    const processed = html.toUpperCase();
                    post.set('html', processed);
                    post.save(ctx.db);
                }
            };
        }
    }

    const queue = new Queue({
        concurrency: 10,
        renderer: new DynamicRenderer()
    });

    try {
        const stats = await queue.run(postTasks());
        console.log(`\nDone: ${stats.completed} posts processed, ${stats.errors.length} failed`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
