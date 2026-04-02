// Run this with: `npx tsx examples/deduplicate-slugs.ts`
//
// Demonstrates slug deduplication. When multiple posts share the same slug,
// the oldest keeps the original; newer duplicates get -2, -3, etc.
//
// Call prepareForExport() before exporting to deduplicate slugs and convert content.
// Access ctx.duplicateSlugs for the list of renamed slugs.

import {MigrateContext} from '../src/index.js';

async function main() {
    const ctx = new MigrateContext();
    await ctx.init();

    try {
        // Simulate a migration source with duplicate slugs
        const sourceData = [
            {title: 'Welcome to our Blog', slug: 'welcome', url: 'https://old-site.com/blog/welcome', date: '2023-01-15'},
            {title: 'Welcome to our Community', slug: 'welcome', url: 'https://old-site.com/community/welcome', date: '2023-06-01'},
            {title: 'Welcome New Members', slug: 'welcome', url: 'https://old-site.com/members/welcome', date: '2024-03-10'},
            {title: 'About the Company', slug: 'about', url: 'https://old-site.com/company/about', date: '2023-02-01'},
            {title: 'About the Team', slug: 'about', url: 'https://old-site.com/team/about', date: '2024-01-15'},
            {title: 'Contact', slug: 'contact', url: 'https://old-site.com/contact', date: '2023-03-01'}
        ];

        // 1. Import all posts
        await ctx.transaction(async () => {
            for (const item of sourceData) {
                const post = await ctx.addPost({source: {url: item.url}});
                post.set('title', item.title);
                post.set('slug', item.slug);
                post.set('status', 'published');
                post.set('created_at', new Date(item.date));
                post.set('published_at', new Date(item.date));
                post.set('html', `<p>Content for ${item.title}</p>`);
                post.addAuthor({name: 'Editor', slug: 'editor', email: 'editor@example.com'});
                await post.save(ctx.db);
            }
        });

        console.log(`Imported ${sourceData.length} posts\n`);

        // 2. Prepare for export (deduplicates slugs + converts content)
        await ctx.prepareForExport();

        // 3. Export to Ghost JSON
        const files = await ctx.writeGhostJson('./export/', {
            filename: 'deduplicated',
            onWrite(f) {
                console.log(`Wrote ${f.name} (${f.posts} posts, ${(f.size / 1024).toFixed(1)} KB)`);
            }
        });

        // 4. Log duplicate slug groups for redirect handling
        //    Results are grouped by slug. The first entry in each group is the
        //    retained post (oldSlug === newSlug), followed by the renamed ones.
        if (ctx.duplicateSlugs.length > 0) {
            console.log(`\nDuplicate slug groups:\n`);
            let currentGroup = '';
            for (const entry of ctx.duplicateSlugs) {
                if (entry.oldSlug !== currentGroup) {
                    currentGroup = entry.oldSlug;
                    console.log(`  ${currentGroup}/`);
                }
                const kept = entry.oldSlug === entry.newSlug;
                const label = kept ? '(kept)   ' : '(renamed)';
                console.log(`    ${label}  ${entry.newSlug.padEnd(18)} ${entry.url}`);
            }
        } else {
            console.log('\nNo duplicate slugs found.');
        }

        console.log(`\nDone — ${files.length} file(s) written`);
    } finally {
        await ctx.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
