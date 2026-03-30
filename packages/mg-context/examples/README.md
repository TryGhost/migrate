# Examples

Run any example from the `packages/mg-context/` directory:

```bash
npx tsx examples/<filename>.ts
```

## generate-and-export.ts

Creates 500 posts in an **in-memory** database with tags and authors, then exports them to Ghost JSON. A good starting point for understanding the basic workflow: create a context, add posts in batched transactions, and write the output.

```bash
npx tsx examples/generate-and-export.ts
```

## generate-large-export.ts

Stress-test that generates **500,000 posts** in a persistent on-disk SQLite database (`posts.db`), runs a second pass to update metadata, then writes the Ghost JSON export. Tracks peak memory usage throughout. Useful for benchmarking and verifying that batched iteration keeps memory bounded.

```bash
# Full run — insert + update + export
npx tsx examples/generate-large-export.ts

# Skip insert (reuse existing DB) and just re-export
npx tsx examples/generate-large-export.ts --insert false
```

## reorder-tags-authors.ts

Demonstrates tag and author ordering. Creates a post with several tags and authors, then shows how to reorder them using `setTagOrder`, `setAuthorOrder`, `setPrimaryTag`, and `addTag` with a `sortOrder` option. Verifies that order persists through save/load cycles and that `sort_order` appears in the exported Ghost JSON.

```bash
npx tsx examples/reorder-tags-authors.ts
```

## foreach-ghost-post.ts

Reads posts from an existing on-disk database (`posts.db`) and iterates over them in Ghost JSON format using `forEachGhostPost`. Each post is logged with its slug, title, tag count, and author count. Requires a database that was previously populated (e.g. by `generate-large-export.ts`).

```bash
npx tsx examples/foreach-ghost-post.ts
```
