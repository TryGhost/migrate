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
        sourceContent: '<p>Welcome to the new site.</p>',
        sourceMeta: {id: '123'}
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

1. **Ingest** — `addPost()` creates a post, and `post.save(context.db)` validates and persists it with its tags and authors. For a persistent migration, save the original per-post text in `sourceContent`, related JSON in `sourceMeta`, and a stable `lookupKey`.
2. **Transform** — A persistent context replays saved raw posts through `mapSourcePost` on every resume. `forEachPost()` loads mapped posts in batches for later enrichment and saves each one automatically. `streamPosts()` is available when the caller needs to control persistence or concurrency.
3. **Export** — `writeGhostJson()` automatically repairs export invariants, writes one or more Ghost import files with the stored HTML, and removes stale files owned by the previous export manifest.

By default, `MigrateContext` uses a managed temporary SQLite file and removes it on `close()`. Pass `dbPath` for resumable migrations, or `{storage: 'memory'}` when an in-memory database is explicitly preferable.

## Common recipes

### Resume a persistent migration

`hasContent()` returns existing content counts, or `false` for an empty database.

```js
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {MigrateContext} from '@tryghost/mg-context';

// Hash the source file without loading the whole export into memory.
const hash = createHash('sha256');
for await (const chunk of createReadStream('./site.xml')) {
    hash.update(chunk);
}
const sourceFileSha256 = hash.digest('hex');
const mapSourcePost = (post) => {
    const item = parseSourceItem(post.sourceContent);
    post.set('title', item.title);
    post.set('slug', item.slug);
    post.set('html', item.html);
    post.set('created_at', new Date(item.createdAt));
    for (const tag of item.tags ?? []) post.addTag(tag);
    for (const author of item.authors ?? []) post.addAuthor(author);
};

const context = new MigrateContext({
    dbPath: './migration.sqlite',
    contentIdentity: {
        source: 'wordpress-example-com',
        revision: sourceFileSha256
    },
    mapSourcePost,
    rereadSource: cliOptions.rereadSource ?? false
});
await context.init();

try {
    const stats = context.hasContent();
    if (stats) {
        console.log(`Reprocessed ${stats.posts} posts and ${stats.pages} pages from SQLite`);
    } else {
        for await (const item of readSourceItems('./site.xml')) {
            await context.addSourcePost({
                lookupKey: item.id,
                sourceContent: item.rawText,
                sourceMeta: {url: item.url}
            });
        }
    }
} finally {
    await context.close();
}
```

`mapSourcePost` is the adapter's mapping function. `mg-context` calls it for every stored post on each resume, using a fresh post object built from `sourceContent` and `sourceMeta`; it then saves the mapped fields and relationships. Change this function freely while developing a migration—no mapper version or configuration change is needed. A resumed run does not parse the export file. The example hashes the file for source-identity verification; if the export will be unavailable on later runs, retain its original digest in the adapter's configuration.

Persistent resume requires `contentIdentity`, even for a new database. `source` is any stable, nonblank name for this migration source; `wordpress-example-com` is fine. `revision` identifies the raw source snapshot. Here it is a digest of the XML file's bytes. The identity describes the input, not the mapper.

`options` is optional. Include only settings that change which raw records are ingested or the raw text retained for them. Mapping options such as feature-image handling or shortcode conversion are deliberately excluded: replay applies the current mapper to the saved raw input. Values must be JSON-compatible (no functions, `undefined`, `Date`, or cycles).

mg-context hashes the source identity and rejects an incompatible populated database rather than silently using the wrong raw snapshot. Do not use a per-run timestamp. Stored raw content is the replay input; a changed source snapshot requires `rereadSource: true`.

`readSourceItems()` and `parseSourceItem()` in the example are your adapter's source parser. The first must provide the original per-post XML, HTML, JSON, or other text as `rawText`; the second converts that same text into values the mapper can use. Do not store already-transformed Ghost HTML as the source. `sourceMeta` carries related JSON such as the original URL. The existing `post.meta` is separate adapter metadata.

### Refresh transformed content

Set `rereadSource` from a CLI boolean flag when the original export should be fetched or parsed again. It clears managed migration content and reports without touching separately managed asset caches. A normal resume reprocesses the saved raw content instead.

```js
const context = new MigrateContext({
    dbPath: './migration.sqlite',
    contentIdentity: {source: 'wordpress-example-com', revision: newSourceFileSha256},
    mapSourcePost,
    rereadSource: true
});
```

Rereading does not require an identity, but passing one lets the next run resume safely. Older databases that lack raw per-post content also require a reread. `mode: 'refresh'` remains an equivalent compatibility option.

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
        await context.addSourcePost({
            lookupKey: sourcePost.id,
            sourceContent: sourcePost.rawText,
            sourceMeta: {url: sourcePost.url}
        });
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
- [Resume, refresh, and content identity](docs/api-reference.md#resume-refresh-and-content-identity)
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
