// Run this with: `npx tsx examples/generate-and-export.ts`
import {MigrateContext} from '../src/index.js';

const POST_COUNT = 500;
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
    const ctx = new MigrateContext();
    await ctx.init();

    try {
        // Insert posts in batched transactions
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
                    post.set('html', `<p>This is the content for post ${i + 1}.</p>`);
                    post.addTag(tags[i % tags.length]);
                    post.addAuthor(authors[i % authors.length]);
                    await post.save(ctx.db);
                }
            });

            console.log(`Inserted ${batchEnd}/${POST_COUNT} posts`);
        }

        // Export to Ghost JSON
        const writtenFiles = await ctx.writeGhostJson('./export/', {
            filename: 'posts',
            onWrite(f) {
                console.log(`Wrote ${f.name} (${f.posts} posts, ${(f.size / 1024).toFixed(1)} KB)`);
            }
        });

        console.log(`Done — ${writtenFiles.length} file(s) written`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
