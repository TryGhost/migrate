# Examples

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

Stress-test that generates **500,000 posts** in a persistent on-disk SQLite database (`posts.db`), runs a second pass to update metadata, then writes the Ghost JSON export. Later runs reuse the mapped posts. Tracks peak memory usage throughout.

```bash
# Full run — insert + update + export
pnpm exec tsx examples/generate-large-export.ts

# Skip source insertion and use posts already in the database
pnpm exec tsx examples/generate-large-export.ts --insert false

# Clear context content, then regenerate and remap the synthetic source
pnpm exec tsx examples/generate-large-export.ts --reread-source
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

Iterates **50,000 posts** using `streamPosts()` and tracks peak memory usage. On the first run, source posts are mapped into `stream-posts.db`. Subsequent runs reuse the mapped posts; pass `--reread-source` to regenerate them.

```bash
pnpm exec tsx examples/stream-posts.ts
```
