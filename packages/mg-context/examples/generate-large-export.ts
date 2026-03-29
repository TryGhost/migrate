// Run this with: `npx tsx examples/generate-large-export.ts`
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let _maxMemoryConsumption = 0;
let _dtOfMaxMemoryConsumption: Date | undefined;

const memoryInterval = setInterval(() => {
    const memUsage = process.memoryUsage();
    if (memUsage.rss > _maxMemoryConsumption) {
        _maxMemoryConsumption = memUsage.rss;
        _dtOfMaxMemoryConsumption = new Date();
    }
}, 100);
memoryInterval.unref();

process.on('exit', () => {
    const maxMB = (_maxMemoryConsumption / 1024 / 1024).toFixed(1);
    console.log(`Max memory consumption: ${maxMB} MB at ${_dtOfMaxMemoryConsumption?.toISOString()}`);
});

const POST_COUNT = 500_000;
const BATCH_SIZE = 1000;

const html = `
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
<p>Pellentesque habitant morbi tristique senectus et netus et malesuada fames ac turpis egestas. Vestibulum tortor quam, feugiat vitae, ultricies eget, tempor sit amet, ante. Donec eu libero sit amet quam egestas semper. Aenean ultricies mi vitae est. Mauris placerat eleifend leo.</p>
<img src="https://example.com/images/placeholder-image.jpg" alt="Placeholder image">
<p>Cras mattis consectetur purus sit amet fermentum. Cras justo odio, dapibus ut facilisis in, egestas eget quam. Morbi leo risus, porta ac consectetur ac, vestibulum at eros. Praesent commodo cursus magna, vel scelerisque nisl consectetur et.</p>
<p>Vivamus sagittis lacus vel augue laoreet rutrum faucibus dolor auctor. Nullam quis risus eget urna mollis ornare vel eu leo. Cum sociis natoque penatibus et magnis dis parturient montes, nascetur ridiculus mus. Donec sed odio dui.</p>
<p>Integer posuere erat a ante venenatis dapibus posuere velit aliquet. Maecenas sed diam eget risus varius blandit sit amet non magna. Fusce dapibus, tellus ac cursus commodo, tortor mauris condimentum nibh, ut fermentum massa justo sit amet risus. Etiam porta sem malesuada magna mollis euismod.</p>
`.trim();

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

async function main() {
    const args = process.argv.slice(2);
    const insertFlagIndex = args.indexOf('--insert');
    const skipInsert = insertFlagIndex !== -1 && args[insertFlagIndex + 1] === 'false';
    const outputPath = args.find(a => !a.startsWith('--') && (insertFlagIndex === -1 || args.indexOf(a) !== insertFlagIndex + 1)) || './export/files/posts/';

    const startTime = Date.now();

    const ctx = new MigrateContext({dbPath: join(__dirname, 'posts.db'), ephemeral: false});
    await ctx.init();

    try {
        console.log('Database initialized');

        if (skipInsert) {
            console.log('Skipping insert (--insert false)');
        } else {
            console.log(`About to generate ${POST_COUNT.toLocaleString()} posts...`);
        }

        for (let batchStart = 0; !skipInsert && batchStart < POST_COUNT; batchStart += BATCH_SIZE) {
            const batchEnd = Math.min(batchStart + BATCH_SIZE, POST_COUNT);
            const batchTime = Date.now();

            await ctx.transaction(async () => {
                for (let i = batchStart; i < batchEnd; i++) {
                    const post = await ctx.addPost({lookupKey: `https://example.com/post-number-${i + 1}`});
                    post.set('title', `Post Number ${i + 1}`);
                    post.set('slug', `post-number-${i + 1}`);
                    post.set('status', 'published');
                    const postDate = new Date(2025, 0, 1, 0, i * 6);
                    post.set('created_at', postDate);
                    post.set('updated_at', postDate);
                    post.set('published_at', postDate);
                    post.set('html', html.replace('Lorem ipsum', `Post ${i + 1}: Lorem ipsum`));
                    post.addTag(tags[i % tags.length]);
                    post.addTag(tags[(i + 1) % tags.length]);
                    post.addAuthor(authors[i % authors.length]);

                    if (i === 10050) {
                        post.addTag({name: 'Art', slug: 'art'});
                        post.addAuthor({name: 'Ron', slug: 'ron', email: 'ron@example.com'});
                    }

                    await post.save(ctx.db);
                }
            });

            const batchDuration = ((Date.now() - batchTime) / 1000).toFixed(1);
            console.log(`- Inserted ${batchEnd.toLocaleString()} posts (${batchDuration}s)`);
        }

        // Second pass: update HTML on every post
        console.log('Updating HTML on all posts...');
        let updateBatchTime = Date.now();
        await ctx.forEachPost(async (post: any) => {
            // post.set('html', post.data.html + '\n<p><em>Not inserted first.</em></p>');
            post.set('meta_title', `Post meta title`);
            if (post.get('title').includes('Post Number 200')) {
                post.addTag({
                    name: 'Post 200x',
                    slug: 'post-200x'
                });
            }
        }, {
            batchSize: BATCH_SIZE,
            progress(processed, total) {
                const batchDuration = ((Date.now() - updateBatchTime) / 1000).toFixed(1);
                console.log(`- Updated ${processed.toLocaleString()}/${total.toLocaleString()} posts (${batchDuration}s)`);
                updateBatchTime = Date.now();
            }
        });

        console.log('Writing Ghost JSON...');
        const writeTime = Date.now();
        const writtenFiles = await ctx.writeGhostJson(outputPath, {
            batchSize: 5000,
            filename: 'export',
            // filter: {
            //     publishedAt: {onOrAfter: new Date('2025-10-01')}
            // },
            onWrite(f) {
                const sizeMB = (f.size / 1024 / 1024).toFixed(1);
                console.log(`  Saved ${f.name} (${f.posts.toLocaleString()} posts, ${sizeMB} MB)`);
            }
        });
        const writeDuration = ((Date.now() - writeTime) / 1000).toFixed(1);
        console.log(`Wrote ${writtenFiles.length} file(s) in ${writeDuration}s`);

        const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`Done in ${totalTime}s`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
