# Migrate Context

`@tryghost/mg-context` stores original source records and mapped Ghost content in SQLite. It supports bounded ingestion, rebuilding, processing, JSON/CSV export, and diagnostic reports.

## Install

```bash
pnpm add @tryghost/mg-context
```

## Storage model and terminology

Original input lives in one shared `SourceRecords` table, separate from mapped posts, tags, and authors. Input may include attachments, author definitions, or other records that do not map directly to a post. Keeping originals separate avoids duplicating them across mapped entities and allows mapping changes to rebuild Ghost content from the same input.

Each context holds one current logical source dataset. Callers choose record boundaries and decide when to ingest again; core tracks completion and safely replaces the stored data. Internal staging supports replacement, without exposing a public snapshot model or retaining historical source payloads.

| Term | Meaning |
| --- | --- |
| Source record | One caller-defined logical item of original input, before migration transformations. |
| Completed source data | The current collection of originals whose ingestion finished successfully, including an intentionally empty collection. |
| Ingestion attempt | One effort to collect initial or replacement input. A failed attempt preserves any previously completed data. |
| Mapped entity | A derived Ghost post, tag, or author, produced from source records or created directly by a caller. |
| Mapped lookup key | An optional caller-defined key for finding or reusing a mapped output, independent of its contributing source records' keys. |

## Ingest once, map on every run

The caller decides when to ingest. Core does not hash files, compare revisions, inspect command options, or fetch input. Use `sources.hasCompletedIngestion`, including when a completed ingestion contains zero records; mapped post counts are not an ingestion marker.

This runnable example uses synthetic input. A real runner supplies records from an adapter's streaming parser. The adapter's mapper then interprets the records read from the database.

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();

try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await context.sources.ingest({replace: rereadSource}, async (stage) => {
            await stage.write([
                {
                    kind: 'post',
                    key: 'original-1',
                    format: 'json',
                    content: JSON.stringify({title: 'Hello', slug: 'hello', html: '<p>Original HTML</p>'}),
                    metadata: {file: 'example.json'}
                }
            ]);
        });
    }

    await context.rebuildMappedContent(async () => {
        for await (const record of context.sources.records({kind: 'post'})) {
            const original = JSON.parse(record.content);
            const post = await context.addPost({lookupKey: record.key ?? undefined});
            post.set('title', original.title);
            post.set('slug', original.slug);
            post.set('html', original.html);
            post.set('created_at', new Date('2026-01-01T00:00:00Z'));
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId});
        }
    });

    for await (const file of context.writeGhostJsonStream('./output')) {
        console.log(file.path);
    }
    await context.writeMigrationReport('./report.json', {status: 'success'});
} finally {
    await context.close();
}
```

On the first run, mapping reads the newly stored originals. Subsequent runs reuse those originals and rebuild all mapped entities and relationships. Mapping-option changes therefore do not require fresh ingestion. Stable Ghost IDs are the adapter's responsibility; internal source-record IDs are not stable external identities.

`replace: true` stages fresh input in committed batches while completed data remains readable. Successful ingestion atomically replaces the originals and clears mapped content. Failure preserves the previous originals and mapped content. Interrupted staging restarts from the beginning; failed-attempt diagnostics survive. Core exposes no snapshot or source-identity API.

## Source records and provenance

A caller chooses each record's boundary: a post, an attachment, an author definition, a Markdown file, or another logical item. Content is opaque text with a caller-defined format label. Parsed XML/API records may be serialized as JSON; core does not require exact document bytes or validate the payload against its format.

Completed source content and ingestion metadata cannot be changed through the public API. Keyed records are unique by kind/key within an ingestion. Duplicate keys throw unless the caller explicitly selects `keep` or `replace`; timestamp interpretation belongs to adapters. Unkeyed records remain available for diagnostics.

One source record may contribute to several mapped entities, and each entity may have several source records. Use `sources.link()`, `recordsFor()`, and `entitiesFor()` to record and traverse these relationships. Core provides canonical lookups, not aliases. Direct construction of mapped entities without source records remains supported.

## Processing and output

- The default context uses a temporary file-backed database, removed on `close()`. Use `dbPath` for persistence or `storage: 'memory'` for small jobs.
- `resetMappedContent()` preserves originals and ingestion diagnostics. `rebuildMappedContent()` performs an atomic reset and rebuild. `savepoint()` isolates a record's writes when the caller handles a known data error.
- `reset()` clears all managed database state. `resetContent: true` does the same during initialization; use staged replacement for a safe reread.
- Authors and tags reuse indexed database rows without application-level entity caches. Streaming APIs bound buffers; explicit array-returning APIs materialize their results.
- `writeGhostJson()` and `writeGhostJsonStream()` share one batched JSON exporter. The first collects completed file descriptors into an array; the second yields them with bounded file tracking. Both default to 5,000 posts per file and the base name `posts`. HTML remains HTML.
- `writeGhostCSV()` writes one Ghost post CSV; destination authors and tags must already exist. See the [CSV reference](docs/api-reference.md#writeghostcsvoutputdir-options-promisewrittenfile).
- `streamDiagnostics()` and `writeMigrationReport()` avoid collecting report history in memory. The latter writes exactly the path supplied by the caller.
- Consumers own output staging, publication, recovery, and cleanup. Export into a fresh staging directory and publish it only after the whole call or iteration succeeds. Core completes each file through a temporary write and rename, then yields its descriptor and emits its callback/event. A later failure leaves earlier completed files in place. There are no export manifests, backups, journals, or automatic recovery of previous runs.

Scraping responses remain in `post.webscrapeData`; asset files and caches remain outside primary source storage. Source runners own scraping and delivery. Future scraper integrations must pass the original URL explicitly rather than requesting removed post-source fields.

## Breaking changes and rollout

Schema version 5 requires rebuilding older or incompatible experimental databases. Core rejects them without migrating or deleting data; even `resetContent: true` does not bypass layout validation.

Post source/content/meta fields and helpers, `addSourcePost()`, source-attribute filtering, `ContentIdentity`, and constructor identity validation have been removed. Automatic cleanup of previous exports, ownership manifests, whole-export recovery, and the `replaceExisting` option have also been removed; consumers manage that lifecycle. Author/tag caches have been removed in favor of indexed database reuse. See the [migration guide](docs/source-records.md) and [API reference](docs/api-reference.md).

This change delivers mg-context only. Existing adapters, the Ghost/WordPress runners, and the web scraper still need follow-up API changes; workspace-wide build and integration readiness are deferred. Adapters remain independently published npm packages with separate streaming parser and record-mapper entrypoints.

## Development

```bash
pnpm --dir packages/mg-context run build
pnpm --dir packages/mg-context run test
pnpm --dir packages/mg-context run test:stress
```

Tests require 100% coverage. The stress test ingests, rebuilds, and exports 100,000 records with 10 KiB bodies under a 256 MiB JavaScript heap and requires RSS below 512 MiB. `MG_CONTEXT_STRESS_RECORDS` can select a smaller local pilot.
