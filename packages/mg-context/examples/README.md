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

# Skip source ingestion when the database has completed source ingestion, but map them again
pnpm exec tsx examples/generate-large-export.ts --insert false

# Stage replacement source, then remap after successful ingestion
pnpm exec tsx examples/generate-large-export.ts --reread-source
```

## generate-large-csv-export.ts

Generates and maps up to **500,000 posts**, then streams them into one Ghost post CSV. It tracks peak memory use and uses a temporary on-disk database by default; the CSV remains after the context closes. Start with a small run:

```bash
pnpm exec tsx examples/generate-large-csv-export.ts --count 1000
```

The default output is `./export/files/csv-posts/posts.csv`. Use `--output <directory>` to change it. Pass `--db <path>` to keep the source database for reruns; mapping runs again from stored source records, while `--reread-source` stages replacement originals.

```bash
pnpm exec tsx examples/generate-large-csv-export.ts --count 1000 --db ./csv-posts.db
pnpm exec tsx examples/generate-large-csv-export.ts --count 1000 --db ./csv-posts.db --reread-source
```

The CSV lists `Alice Johnson`, `Bob Smith`, `News`, and `Technology`, but does not create them. Create matching authors and tags in the destination Ghost site before importing it.

## generate-large-export-with-queue.ts

Like the large-export example, this stores raw source posts and maps them before streaming posts into `mg-queue` for bounded, concurrent HTML enrichment. The asynchronous enrichment is a stand-in for network or file work; queue errors stop the export. By default it uses a temporary on-disk database, which is removed when the run finishes. The Ghost JSON export remains in `./export/files/queue-posts/`.

Build the workspace dependency once, then run a small sample or the full **500,000-post** stress test:

```bash
pnpm --filter @tryghost/mg-queue build
pnpm exec tsx examples/generate-large-export-with-queue.ts --count 1000
pnpm exec tsx examples/generate-large-export-with-queue.ts
```

To keep the database for reruns, pass `--db`. Reruns with that database reuse stored source posts but redo mapping and enrichment. Pass `--reread-source` with `--db` to replace the stored source. Use `--output` to change the export directory.

```bash
pnpm exec tsx examples/generate-large-export-with-queue.ts --count 1000 --db ./queue-posts.db
pnpm exec tsx examples/generate-large-export-with-queue.ts --count 1000 --db ./queue-posts.db --reread-source
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

Stores **50,000 raw source posts** in `stream-posts.db`, maps them from that stored source on every run, then iterates with `streamPosts()` while tracking peak memory usage. Pass `--reread-source` to regenerate the source posts. Older database layouts must be explicitly rebuilt; --reread-source does not bypass schema validation.

```bash
pnpm exec tsx examples/stream-posts.ts

# Regenerate source in a compatible database
pnpm exec tsx examples/stream-posts.ts --reread-source
```

All source-replay examples use `utils/stream-posts.ts` to demonstrate caller-owned ingestion policy and atomic rebuilding from completed source records. Internal staging is private; no snapshot or identity comparison API is involved.

Consumers own output staging, publication, recovery, and cleanup. Choose a fresh staging directory, finish the export successfully, then publish or deliver that directory. A failed export may leave completed earlier chunks; discard that partial staging directory. These examples do not remove earlier or differently named exports.
