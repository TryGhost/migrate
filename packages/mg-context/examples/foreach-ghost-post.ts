// Run this with: `pnpm exec tsx examples/foreach-ghost-post.ts`
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext, type PostContext} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Use the same source mapper as generate-large-export.ts when reading its database.
const tags = [
    {name: 'News', slug: 'news'},
    {name: 'Technology', slug: 'technology'},
    {name: 'Opinion', slug: 'opinion'},
    {name: 'Culture', slug: 'culture'},
    {name: 'Science', slug: 'science'}
];
const authors = [
    {name: 'Alice Johnson', slug: 'alice-johnson', email: 'alice@example.com'},
    {name: 'Bob Smith', slug: 'bob-smith', email: 'bob@example.com'},
    {name: 'Carol Williams', slug: 'carol-williams', email: 'carol@example.com'}
];

function mapSyntheticPost(post: PostContext) {
    const {index: i, html} = JSON.parse(post.sourceContent!);
    post.set('title', `Post Number ${i + 1}`);
    post.set('slug', `post-number-${i + 1}`);
    post.set('status', 'published');
    const postDate = new Date(2025, 0, 1, 0, i * 6);
    post.set('created_at', postDate);
    post.set('updated_at', postDate);
    post.set('published_at', postDate);
    post.set('html', html);
    post.addTag(tags[i % tags.length]);
    post.addTag(tags[(i + 1) % tags.length]);
    post.addAuthor(authors[i % authors.length]);
    post.set('meta_title', 'Post meta title');
    if (`Post Number ${i + 1}`.includes('Post Number 200')) {
        post.addTag({name: 'Post 200x', slug: 'post-200x'});
    }
    if (i === 10050) {
        post.addTag({name: 'Art', slug: 'art'});
        post.addAuthor({name: 'Ron', slug: 'ron', email: 'ron@example.com'});
    }
}

async function main() {
    const ctx = new MigrateContext({
        dbPath: join(__dirname, 'posts.db'),
        contentIdentity: {
            source: 'mg-context-example:large-export',
            revision: 'synthetic-500000'
        },
        mapSourcePost: mapSyntheticPost
    });
    await ctx.init();

    const startTime = Date.now();

    try {
        ctx.on('progress', ({operation, processed, total}) => {
            console.log(`--- [${operation}] ${processed}/${total} ---`);
        });

        await ctx.forEachGhostPost(async (json, post) => {
            await new Promise(r => setTimeout(r, 250));
            console.log(`[${json.slug}] "${json.title}" — ${json.tags?.length ?? 0} tag(s), ${json.authors?.length ?? 0} author(s)`);
            console.log(json);
        }, {batchSize: 20});

        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Done in ${duration}s`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
