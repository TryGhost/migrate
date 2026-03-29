// Run this with: `npx tsx scripts/foreach-ghost-post.ts`
import {MigrateContext} from '../src/index.js';

async function main() {
    const ctx = new MigrateContext({dbPath: '/Users/paul/Sites/migrate/packages/mg-context/scripts/yolo.db', ephemeral: false});
    await ctx.init();

    const startTime = Date.now();

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

    await ctx.close();

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Done in ${duration}s`);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
