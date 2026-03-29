// Run this with: `npx tsx examples/foreach-ghost-post.ts`
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {MigrateContext} from '../src/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
    const ctx = new MigrateContext({dbPath: join(__dirname, 'posts.db'), ephemeral: false});
    await ctx.init();

    const startTime = Date.now();

    try {
        await ctx.forEachGhostPost(async (json, post) => {
            await new Promise(r => setTimeout(r, 250));
            console.log(`[${json.slug}] "${json.title}" — ${json.tags?.length ?? 0} tag(s), ${json.authors?.length ?? 0} author(s)`);
            console.log(json);
        }, {
            batchSize: 20,
            progress(processed, total) {
                console.log(`--- ${processed}/${total} posts processed ---`);
            }
        });

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
