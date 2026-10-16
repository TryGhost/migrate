# Migrate Context

Build Ghost import JSON from source posts. `@tryghost/mg-context` stores them in SQLite, checks Ghost's field rules, and writes the export in batches.

## Install

```bash
pnpm add @tryghost/mg-context
```

## Export one post

Save this as `create-import.mjs`, then run `node create-import.mjs`. It creates a Ghost JSON file in `./output`.

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext();

await context.init();

try {
    const post = await context.addPost();

    post.set('title', 'Hello world');
    post.set('slug', 'hello-world');
    post.set('status', 'published');
    post.set('created_at', new Date('2025-01-15T10:00:00Z'));
    post.set('published_at', new Date('2025-01-15T10:00:00Z'));
    post.set('html', '<p>Welcome to the new site.</p>');
    post.save(context.db);

    await context.writeGhostJson('./output');
} finally {
    await context.close();
}
```

`addPost()` creates a post; `post.save()` stores it. `writeGhostJson()` prepares titles and slugs, then exports the stored HTML. The default database is a temporary file, removed when you close the context. The JSON output remains.

## Rerun a completed migration

Give the database a path so it survives the first run. When you run the adapter again, it can export the posts already stored there without parsing and mapping the source a second time. `hasContent()` returns stored content counts, or `false` if the database is empty.

When saving a post to a persistent database, both `post.setSource('lookupKey', ...)` and `post.setSource('content', ...)` are required. `content` holds the original source record, not the transformed Ghost HTML; `meta` is optional.

This is an **adapter outline**, not a standalone program: your adapter supplies `sourceFileSha256`, `readSourceItems()`, and `parseSourceItem()`. See [how to calculate the source file hash](docs/api-reference.md#resume-refresh-and-content-identity).

```js
import {MigrateContext} from '@tryghost/mg-context';

// This will come from your integration, such as a CLI flag, passed to this constructor
const refreshData = false;

const context = new MigrateContext({
    dbPath: './migration.sqlite',
    contentIdentity: {
        source: 'wordpress-example-com',
        revision: sourceFileSha256
    },
    rereadSource: refreshData
});
await context.init();

try {
    if (!context.hasContent()) {
        for await (const item of readSourceItems('./site.xml')) {
            await context.addSourcePost((post) => {
                post.setSource('lookupKey', item.id);
                post.setSource('content', item.rawText);
                const source = parseSourceItem(post.sourceContent);
                post.set('title', source.title);
                post.set('slug', source.slug);
                post.set('html', source.html);
                post.set('created_at', new Date(source.createdAt));
            });
        }
    }

    await context.writeGhostJson('./output');
} finally {
    await context.close();
}
```

On the first run, the adapter maps each source record to Ghost fields. The `lookupKey` identifies the record if ingestion is retried. On later runs, the stored posts are exported again; the mapping callback does not run. Pass `--reread-source` after changing the source or mapping logic to clear and rebuild the context database. Separately managed asset caches are untouched.

Persistent databases require `contentIdentity`: `source` is a stable name you choose, and `revision` identifies the source snapshot. A changed identity cannot reuse old content. The [identity guide](docs/api-reference.md#resume-refresh-and-content-identity) explains how to hash source files and when to use optional `options`.

## What to expect

- HTML is stored and exported without converting formats, though save-time sanitization may trim or limit fields.
- Duplicate lookup keys are skipped by default; `getMigrationReport()` shows what was skipped.
- Export prepares titles and slugs automatically. On a later export, it removes only stale files listed in its previous export manifest.

For bulk processing, filters, tags and authors, events, and all options, see the [API reference](docs/api-reference.md) and [runnable examples](examples/README.md).

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
