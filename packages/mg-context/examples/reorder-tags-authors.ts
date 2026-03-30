// Run this with: `npx tsx examples/reorder-tags-authors.ts`
import {MigrateContext} from '../src/index.js';

async function main() {
    const ctx = new MigrateContext();
    await ctx.init();

    try {
        // Post 1: Several tags and authors that we'll reorder
        const post1 = await ctx.addPost();
        post1.set('title', 'Reorder Example');
        post1.set('slug', 'reorder-example');
        post1.set('status', 'published');
        post1.set('created_at', new Date('2025-01-15'));
        post1.set('published_at', new Date('2025-01-15'));
        post1.set('html', '<p>A post demonstrating tag and author reordering.</p>');
        post1.addTag({name: 'News', slug: 'news'});
        post1.addTag({name: 'Technology', slug: 'technology'});
        post1.addTag({name: 'Guides', slug: 'guides'});
        post1.addTag({name: 'Opinion', slug: 'opinion'});
        post1.addAuthor({name: 'Alice Johnson', slug: 'alice-johnson', email: 'alice@example.com'});
        post1.addAuthor({name: 'Bob Smith', slug: 'bob-smith', email: 'bob@example.com'});
        post1.addAuthor({name: 'Carol Davis', slug: 'carol-davis', email: 'carol@example.com'});
        await post1.save(ctx.db);

        // Post 2: Shares some tags/authors with post 1
        const post2 = await ctx.addPost();
        post2.set('title', 'Shared Tags Post');
        post2.set('slug', 'shared-tags-post');
        post2.set('status', 'published');
        post2.set('created_at', new Date('2025-01-16'));
        post2.set('published_at', new Date('2025-01-16'));
        post2.set('html', '<p>This post shares some tags and authors with the first.</p>');
        post2.addTag({name: 'News', slug: 'news'});
        post2.addTag({name: 'Technology', slug: 'technology'});
        post2.addAuthor({name: 'Alice Johnson', slug: 'alice-johnson', email: 'alice@example.com'});
        await post2.save(ctx.db);

        // Post 3: Different tags and authors entirely
        const post3 = await ctx.addPost();
        post3.set('title', 'Different Everything');
        post3.set('slug', 'different-everything');
        post3.set('status', 'published');
        post3.set('created_at', new Date('2025-01-17'));
        post3.set('published_at', new Date('2025-01-17'));
        post3.set('html', '<p>Completely different tags and authors.</p>');
        post3.addTag({name: 'Sports', slug: 'sports'});
        post3.addTag({name: 'Culture', slug: 'culture'});
        post3.addTag({name: 'Music', slug: 'music'});
        post3.addAuthor({name: 'Dan Evans', slug: 'dan-evans', email: 'dan@example.com'});
        post3.addAuthor({name: 'Eve Foster', slug: 'eve-foster', email: 'eve@example.com'});
        await post3.save(ctx.db);

        // Post 4: Mix of shared and unique, using sortOrder on add
        const post4 = await ctx.addPost();
        post4.set('title', 'Mixed Bag');
        post4.set('slug', 'mixed-bag');
        post4.set('status', 'published');
        post4.set('created_at', new Date('2025-01-18'));
        post4.set('published_at', new Date('2025-01-18'));
        post4.set('html', '<p>A mix of shared and unique tags, with explicit sort orders.</p>');
        post4.addTag({name: 'Opinion', slug: 'opinion'});
        post4.addTag({name: 'Sports', slug: 'sports'});
        post4.addTag({name: 'Technology', slug: 'technology', sortOrder: 0}); // insert at front
        post4.addAuthor({name: 'Bob Smith', slug: 'bob-smith', email: 'bob@example.com'});
        post4.addAuthor({name: 'Eve Foster', slug: 'eve-foster', email: 'eve@example.com'});
        await post4.save(ctx.db);

        console.log('=== All posts ===');
        const allPosts = await ctx.getAllPosts();
        for (const p of allPosts) {
            console.log(`\n  "${p.get('title')}"`);
            printOrder(p);
        }

        // Reorder tags on post 1: move "Guides" to the front
        console.log('\n=== Reorder post 1 tags: Guides to front ===');
        post1.setTagOrder((tags: any[]) => {
            const guides = tags.find(t => t.data.slug === 'guides');
            const rest = tags.filter(t => t.data.slug !== 'guides');
            return [guides, ...rest];
        });

        // Reverse authors on post 1
        post1.setAuthorOrder((authors: any[]) => [...authors].reverse());
        await post1.save(ctx.db);
        printOrder(post1);

        // Use setPrimaryTag on post 1 to bump "Opinion" to position 0
        console.log('\n=== setPrimaryTag("opinion") on post 1 ===');
        post1.setPrimaryTag({name: 'Opinion', slug: 'opinion'});
        await post1.save(ctx.db);
        printOrder(post1);

        // Add a new tag at a specific position on post 1
        console.log('\n=== addTag("breaking", sortOrder: 1) on post 1 ===');
        post1.addTag({name: 'Breaking', slug: 'breaking', sortOrder: 1});
        await post1.save(ctx.db);
        printOrder(post1);

        // Verify ordering persists through save/load cycle
        console.log('\n=== Loaded from DB ===');
        const reloaded = await ctx.getAllPosts();
        for (const p of reloaded) {
            console.log(`\n  "${p.get('title')}"`);
            printOrder(p);
        }

        // Export and show sort_order in the JSON
        const files = await ctx.writeGhostJson('./export/', {filename: 'reorder-example'});
        const fs = await import('node:fs/promises');
        const json = JSON.parse(await fs.readFile(files[0].path, 'utf-8'));

        console.log('\n=== posts_tags in Ghost JSON ===');
        for (const pt of json.data.posts_tags) {
            const post = json.data.posts.find((p: any) => p.id === pt.post_id);
            const tag = json.data.tags.find((t: any) => t.id === pt.tag_id);
            console.log(`  ${post.slug} -> ${tag.slug} (sort_order: ${pt.sort_order})`);
        }

        console.log('\n=== posts_authors in Ghost JSON ===');
        for (const pa of json.data.posts_authors) {
            const post = json.data.posts.find((p: any) => p.id === pa.post_id);
            const author = json.data.users.find((u: any) => u.id === pa.author_id);
            console.log(`  ${post.slug} -> ${author.slug} (sort_order: ${pa.sort_order})`);
        }

        // await fs.rm('./export/', {recursive: true});
    } finally {
        await ctx.close();
    }
}

function printOrder(post: any) {
    console.log('  Tags:', post.data.tags.map((t: any) => t.data.slug).join(', '));
    console.log('  Authors:', post.data.authors.map((a: any) => a.data.slug).join(', '));
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
