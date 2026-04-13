// Run this with: `npx tsx examples/stream-posts.ts`
//
// Iterates 50k posts using streamPosts() and tracks peak memory usage.
// On the first run, posts are inserted. Subsequent runs reuse the existing DB.
// Delete examples/stream-posts.db to regenerate.
import {dirname, join} from 'node:path';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'stream-posts.db');

let peakRss = 0;
const memoryInterval = setInterval(() => {
    const rss = process.memoryUsage().rss;
    if (rss > peakRss) {
        peakRss = rss;
    }
}, 100);
memoryInterval.unref();

process.on('exit', () => {
    console.log(`Peak memory: ${(peakRss / 1024 / 1024).toFixed(1)} MB`);
});

const POST_COUNT = 50_000;
const BATCH_SIZE = 1000;

const html = `
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante.</p>
<img src="https://example.com/images/placeholder.jpg" alt="Placeholder">
<p>Cras mattis consectetur purus sit amet fermentum. Morbi leo risus, porta ac consectetur ac, vestibulum at eros.</p>
`.trim();

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

    try {
        if (!dbExists) {
            console.log(`Generating ${POST_COUNT.toLocaleString()} posts...`);
            const insertStart = Date.now();

            for (let batchStart = 0; batchStart < POST_COUNT; batchStart += BATCH_SIZE) {
                const batchEnd = Math.min(batchStart + BATCH_SIZE, POST_COUNT);

                await ctx.transaction(async () => {
                    for (let i = batchStart; i < batchEnd; i++) {
                        const post = await ctx.addPost();
                        post.set('title', `Post ${i + 1}`);
                        post.set('slug', `post-${i + 1}`);
                        post.set('status', 'published');
                        const postDate = new Date(2025, 0, 1, 0, i * 6);
                        post.set('created_at', postDate);
                        post.set('published_at', postDate);
                        post.set('html', html.replace('Lorem ipsum', `Post ${i + 1}: Lorem ipsum`));
                        post.addTag(tags[i % tags.length]);
                        post.addAuthor(authors[i % authors.length]);
                        await post.save(ctx.db);
                    }
                });

                if (batchEnd % 10_000 === 0) {
                    console.log(`  Inserted ${batchEnd.toLocaleString()}`);
                }
            }

            const insertDuration = ((Date.now() - insertStart) / 1000).toFixed(1);
            console.log(`Insert complete in ${insertDuration}s\n`);
        } else {
            console.log(`Using existing database at ${DB_PATH}\n`);
        }

        // Stream all posts and simulate processing
        console.log('Streaming posts with streamPosts()...');
        const streamStart = Date.now();
        let count = 0;

        ctx.on('progress', (event, processed, total) => {
            const elapsed = ((Date.now() - streamStart) / 1000).toFixed(1);
            const rss = (process.memoryUsage().rss / 1024 / 1024).toFixed(0);
            console.log(`  [${event}] ${processed.toLocaleString()}/${total.toLocaleString()} (${elapsed}s, ${rss} MB)`);
        });

        for await (const post of ctx.streamPosts({batchSize: 500})) {
            // Simulate read-heavy processing
            const title = post.get('title');
            const postHtml = post.get('html') as string;
            const wordCount = postHtml.split(/\s+/).length;

            if (count === 0) {
                console.log(`  First post: "${title}" (${wordCount} words)`);
            }

            count += 1;
        }

        const streamDuration = ((Date.now() - streamStart) / 1000).toFixed(1);
        console.log(`\nStreamed ${count.toLocaleString()} posts in ${streamDuration}s`);

        // Stream tags
        console.log('\nStreaming tags with streamTags()...');
        let tagCount = 0;
        for await (const tag of ctx.streamTags()) {
            tagCount += 1;
            console.log(`  ${tag.data.slug}: ${tag.data.name}`);
        }
        console.log(`Streamed ${tagCount} tags`);

        // Stream authors
        console.log('\nStreaming authors with streamAuthors()...');
        let authorCount = 0;
        for await (const author of ctx.streamAuthors()) {
            authorCount += 1;
            console.log(`  ${author.data.slug}: ${author.data.name} (${author.data.email})`);
        }
        console.log(`Streamed ${authorCount} authors`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
