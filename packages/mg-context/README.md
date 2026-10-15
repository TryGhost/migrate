# Migrate Context

SQLite-backed staging for building Ghost migration imports from posts, tags, and authors.

`@tryghost/mg-context` is intended for migration adapter authors. It validates and sanitizes content as it is saved, supports batched processing through an on-disk database, and writes Ghost-compatible JSON in batches.

## Install

```bash
pnpm add @tryghost/mg-context
```

## Quick start

This is the complete lifecycle: open a context, ingest content, export it, and close the database.

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext();

await context.init();

try {
    const post = await context.addPost({
        lookupKey: 'source-post-123',
        source: {id: '123'}
    });

    post.set('title', 'Hello world');
    post.set('slug', 'hello-world');
    post.set('status', 'published');
    post.set('created_at', new Date('2025-01-15T10:00:00Z'));
    post.set('published_at', new Date('2025-01-15T10:00:00Z'));
    post.set('html', '<p>Welcome to the new site.</p>');
    post.addTag({name: 'News', slug: 'news'});
    post.addAuthor({
        name: 'Alice',
        slug: 'alice',
        email: 'alice@example.com'
    });
    post.save(context.db);

    const files = await context.writeGhostJson('./output');

    console.log(`Wrote ${files.length} file(s)`);
} finally {
    await context.close();
}
```

## How it works

The normal data flow has three stages:

1. **Ingest** — `addPost()` creates a post, and `post.save(context.db)` validates and persists it with its tags and authors. A stable `lookupKey` makes repeated ingestion retry-safe.
2. **Transform** — `forEachPost()` loads posts in batches, runs a callback, and saves each post automatically. `streamPosts()` is available when the caller needs to control persistence or concurrency.
3. **Export** — `writeGhostJson()` automatically repairs export invariants, writes one or more Ghost import files with the stored HTML, and removes stale files owned by the previous export manifest.

By default, `MigrateContext` uses a managed temporary SQLite file and removes it on `close()`. Pass `dbPath` for resumable migrations, or `{storage: 'memory'}` when an in-memory database is explicitly preferable.

## Common recipes

### Resume a persistent migration

`hasContent()` returns existing content counts, or `false` for an empty database.

```js
const context = new MigrateContext({
    dbPath: './migration.sqlite',
    mode: 'resume',
    contentFingerprint: sourceAndOptionsFingerprint
});
await context.init();

const stats = context.hasContent();
if (stats) {
    console.log(`Reusing ${stats.posts} posts and ${stats.pages} pages`);
} else {
    await ingestSource(context);
}
```

`contentFingerprint` should identify the source and every option that affects stored content. Resume rejects an incompatible database with an actionable error instead of silently exporting stale rows.

### Refresh transformed content

Use refresh mode when a changed source or transformation should rebuild the context database. It clears managed migration content and reports without touching separately managed asset caches.

```js
const context = new MigrateContext({
    dbPath: './migration.sqlite',
    mode: 'refresh',
    contentFingerprint: sourceAndOptionsFingerprint
});
```

Within one compatible run, a stable `lookupKey` still defaults to retry-safe `skip`. Advanced integrations can use `onDuplicate: 'replace'` or a resolver.

### Transform every post

`forEachPost()` saves each post after the callback completes.

```js
await context.forEachPost(async (post) => {
    post.set('status', 'published');
    post.addTag({name: 'Migrated', slug: 'migrated'});
}, {batchSize: 200});
```

### Export part of a migration

Filters combine with `AND` logic. Relationship filters accept a tag or author identity, while date filters accept ranges.

```js
await context.writeGhostJson('./output', {
    filename: 'news',
    filter: {
        tag: {slug: 'news'},
        publishedAt: {onOrAfter: new Date('2025-01-01')}
    }
});
```

### Process a large migration

Use an on-disk database, save ingestion batches inside `transaction()`, and use the batched iterators rather than `getAllPosts()`.

```js
await context.transaction(async () => {
    for (const sourcePost of sourceBatch) {
        const post = await context.addPost({
            lookupKey: sourcePost.id,
            source: sourcePost
        });
        post.set('title', sourcePost.title);
        post.set('slug', sourcePost.slug);
        post.set('html', sourcePost.html);
        post.save(context.db);
    }
});
```

See the [large export and streaming examples](examples/README.md) for complete runnable programs.

## Defaults and guarantees

Source data routinely carries values Ghost will not accept — a title over 255 characters, a tag name over 191, an email that is not an address. Rather than failing the migration, each context normalizes its own data against [Ghost's schema](https://github.com/TryGhost/Ghost/blob/main/ghost/core/server/data/schema/schema.js) before anything is written.

| Behaviour | Default |
| --- | --- |
| Storage | Managed temporary on-disk SQLite; persistent when `dbPath` is provided |
| Post content | HTML is preserved and exported unchanged |
| Duplicate lookup key | Skip the incoming post |
| Resume mode | Reuse a compatible persistent database |
| Progress and change events | Typed EventEmitter events; no listeners means no presentation work |
| Post iteration batch | 100 records |
| JSON export batch | 5,000 posts per file |
| Export preparation | Automatic |
| Existing export files | Only stale files owned by the previous export manifest are removed |
| Tag and author scope | `referenced`; pass `scope: 'all'` explicitly for standalone entities |

Save-time sanitization trims strings, enforces Ghost field limits, repairs invalid author emails, drops invalid URL fields, and records every change. `getMigrationReport()` persists inserted, skipped, replaced, sanitized, and renamed outcomes across resumptions. Live typed events provide immediate progress and complete before/after replacement snapshots.

## Advanced integration

The [API reference](docs/api-reference.md) covers every method, option, field, and report. The sections most useful to adapter authors are:

- [Transactions](docs/api-reference.md#transactions)
- [Finding and iterating entities](docs/api-reference.md#finding-entities)
- [Filtering](docs/api-reference.md#filtering)
- [Resume, refresh, and fingerprints](docs/api-reference.md#resume-refresh-and-content-fingerprints)
- [Events and durable reports](docs/api-reference.md#events-and-durable-reports)
- [Field sanitization](docs/api-reference.md#field-sanitization)
- [Slug reports](docs/api-reference.md#slug-deduplication)

The [examples](examples/README.md) demonstrate bulk generation, streaming, tag and author ordering, per-post Ghost JSON, and duplicate-slug reporting.

## Development

From the repository root:

```bash
pnpm install
pnpm --filter @tryghost/mg-context test:local
pnpm lint
```

The package requires the Node version declared by the repository. Schema limits are generated from Ghost; use the documented package scripts rather than editing the generated profile manually.

---

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE). Ghost and the Ghost Logo are trademarks of Ghost Foundation Ltd. Please see our [trademark policy](https://ghost.org/trademark/) for info on acceptable usage.
