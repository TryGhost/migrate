# Migrate Context

SQLite-backed staging for building Ghost migration imports from posts, tags, and authors.

`@tryghost/mg-context` is intended for migration adapter authors. It validates and sanitizes content as it is saved, supports batched processing through an on-disk database, and writes Ghost-compatible JSON in batches.

## Install

```bash
pnpm add @tryghost/mg-context
```

## Quick start

This is the complete lifecycle: open a context, ingest content, prepare it, export it, and close the database.

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext({
    dbPath: './migration.sqlite'
});

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

    await context.prepareForExport();
    const files = await context.writeGhostJson('./output', {
        replaceExisting: true
    });

    console.log(`Wrote ${files.length} file(s)`);
} finally {
    await context.close();
}
```

## How it works

The normal data flow has three stages:

1. **Ingest** — `addPost()` creates a post, and `post.save(context.db)` validates and persists it with its tags and authors. A stable `lookupKey` makes repeated ingestion retry-safe.
2. **Transform** — `forEachPost()` loads posts in batches, runs a callback, and saves each post automatically. `streamPosts()` is available when the caller needs to control persistence or concurrency.
3. **Export** — `prepareForExport()` repairs export invariants and deduplicates slugs. `writeGhostJson()` then writes one or more Ghost import files with the stored HTML.

`MigrateContext` uses an in-memory SQLite database when `dbPath` is omitted. Pass a path for large or resumable migrations.

## Common recipes

### Resume a persistent migration

`hasContent()` returns existing content counts, or `false` for an empty database.

```js
const context = new MigrateContext({dbPath: './migration.sqlite'});
await context.init();

const stats = context.hasContent();
if (stats) {
    console.log(`Reusing ${stats.posts} posts and ${stats.pages} pages`);
} else {
    await ingestSource(context);
}
```

Use [fingerprints](docs/api-reference.md#fingerprints) when reuse also depends on source files or transformation options. Use `reset()` when stored content is no longer valid but external asset caches should remain intact.

### Replace posts during a refresh

With a stable `lookupKey`, the default duplicate policy is `skip`. Use `replace` when rescanning the source should update stored content.

```js
const context = new MigrateContext({
    dbPath: './migration.sqlite',
    onDuplicate: 'replace'
});
```

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
await context.prepareForExport();
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
| Storage | In-memory when `dbPath` is omitted; persistent SQLite when it is provided |
| Post content | HTML is preserved and exported unchanged |
| Duplicate lookup key | Skip the incoming post |
| Progress events | Enabled |
| Post iteration batch | 100 records |
| JSON export batch | 5,000 posts per file |
| Existing export files | Preserved unless `replaceExisting: true` |
| Standalone tag and author export | Only entities referenced by a post |

Save-time sanitization trims strings, enforces Ghost field limits, repairs invalid author emails, drops invalid URL fields, and records every change in `context.sanitizedFields`. Export preparation normalizes blank titles and records duplicate slug changes in `context.duplicateSlugs`.

## Advanced integration

The [API reference](docs/api-reference.md) covers every method, option, field, and report. The sections most useful to adapter authors are:

- [Transactions](docs/api-reference.md#transactions)
- [Finding and iterating entities](docs/api-reference.md#finding-entities)
- [Filtering](docs/api-reference.md#filtering)
- [Fingerprints](docs/api-reference.md#fingerprints)
- [Progress events](docs/api-reference.md#events)
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
