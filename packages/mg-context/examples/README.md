# Examples

These runnable scripts show how to create Ghost exports, rerun migrations, and work with posts, tags, and authors.

Run any example from the `packages/mg-context/` directory:

```bash
pnpm exec tsx examples/<filename>.ts
```

## generate-and-export.ts

Creates 500 posts in a managed temporary on-disk database with tags and authors, then exports them to Ghost JSON. A good starting point for understanding the basic workflow: create a context, add posts in batched transactions, and write the output.

```bash
pnpm exec tsx examples/generate-and-export.ts
```

## generate-large-export.ts

Stress-test that stores **500,000 raw source posts** in a persistent on-disk SQLite database (`posts.db`), maps them from that stored source on every run, then writes the Ghost JSON export. Tracks peak memory usage throughout. Changes to the mapping code take effect on the next run without regenerating source posts.

```bash
# Full run — ingest + map + export
pnpm exec tsx examples/generate-large-export.ts

# Skip source ingestion when the database already has posts, but map them again
pnpm exec tsx examples/generate-large-export.ts --insert false

# Clear context content, then regenerate and remap the synthetic source
pnpm exec tsx examples/generate-large-export.ts --reread-source
```

## deduplicate-slugs.ts

Shows how saving posts assigns unique slugs and how to read the duplicate-slug report after export. The first saved post keeps a requested slug; later collisions receive numbered suffixes.

```bash
pnpm exec tsx examples/deduplicate-slugs.ts
```

## reorder-tags-authors.ts

Demonstrates tag and author ordering. Creates a post with several tags and authors, then shows how to reorder them using `setTagOrder`, `setAuthorOrder`, `setPrimaryTag`, and `addTag` with a `sortOrder` option. Verifies that order persists through save/load cycles and that `sort_order` appears in the exported Ghost JSON.

```bash
pnpm exec tsx examples/reorder-tags-authors.ts
```

## foreach-ghost-post.ts

Reads posts from an existing on-disk database (`posts.db`) and iterates over them in Ghost JSON format using `forEachGhostPost`. Each post is logged with its slug, title, tag count, and author count. Requires a database that was previously populated (e.g. by `generate-large-export.ts`).

```bash
pnpm exec tsx examples/foreach-ghost-post.ts
```

## stream-posts.ts

Stores **50,000 raw source posts** in `stream-posts.db`, maps them from that stored source on every run, then iterates with `streamPosts()` while tracking peak memory usage. Pass `--reread-source` to regenerate the source posts. If you have a database from an older version of this example, use that flag once because the stored source format changed.

```bash
pnpm exec tsx examples/stream-posts.ts

# Replace an older database or regenerate the synthetic source
pnpm exec tsx examples/stream-posts.ts --reread-source
```
