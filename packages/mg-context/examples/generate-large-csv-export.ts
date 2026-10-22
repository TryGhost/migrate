// Run from packages/mg-context/ with:
//   pnpm exec tsx examples/generate-large-csv-export.ts --count 1000
import {ingestSyntheticData, mapSyntheticData} from './utils/stream-posts.js';
import {resolve} from 'node:path';
import {parseArgs} from 'node:util';
import {MigrateContext} from '../src/index.js';

const tags = [
    {name: 'News', slug: 'news'},
    {name: 'Technology', slug: 'technology'}
];
const authors = [
    {name: 'Alice Johnson', slug: 'alice-johnson', email: 'alice@example.com'},
    {name: 'Bob Smith', slug: 'bob-smith', email: 'bob@example.com'}
];

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

    const outputDir = resolve(values.output ?? './export/files/csv-posts/');
    const ctx = new MigrateContext({
        dbPath,
    });
    await ctx.init();

    let peakRss = process.memoryUsage().rss;
    const memoryInterval = setInterval(() => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss);
    }, 100);
    memoryInterval.unref();
    const startTime = Date.now();

    try {
        await ingestSyntheticData(ctx, postCount, {reread: values['reread-source'] ?? false});

        console.log('Mapping posts from stored source...');
        await mapSyntheticData(ctx, async (post, original) => {
            const {index, html} = original;
            const postDate = new Date(2025, 0, 1, 0, index * 6);
            post.setTagOrder(() => []);
            post.setAuthorOrder(() => []);
            post.set('title', `Post Number ${index + 1}`);
            post.set('slug', `post-number-${index + 1}`);
            post.set('status', 'published');
            post.set('created_at', postDate);
            post.set('published_at', postDate);
            post.set('html', html);
            post.addTag(tags[index % tags.length]);
            post.addAuthor(authors[index % authors.length]);
        });

        console.log('Writing Ghost post CSV...');
        const file = await ctx.writeGhostCSV(outputDir);
        console.log(`Wrote ${file.path} (${file.posts.toLocaleString()} posts, ${(file.size / 1024 / 1024).toFixed(1)} MB)`);
        console.log(`Done in ${((Date.now() - startTime) / 1000).toFixed(1)}s; peak RSS ${(peakRss / 1024 / 1024).toFixed(1)} MB`);
        console.log('Before importing this CSV, create its authors and tags in the destination Ghost site.');
    } finally {
        clearInterval(memoryInterval);
        await ctx.close();
    }
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
