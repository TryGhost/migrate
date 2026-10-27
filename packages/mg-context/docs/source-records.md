# Moving to shared source records

Source storage belongs to `context.sources`. Mapped `PostContext`, `TagContext`, and `AuthorContext` represent derived Ghost content. Parsing and mapping remain the responsibility of independently usable source adapters; runners decide when to ingest, always map from database records, and then process/export the mapped result.

## Removed APIs

| Previous API | Replacement |
| --- | --- |
| Constructor `contentIdentity`, exported `ContentIdentity` | Caller-owned reuse policy; optional opaque ingestion metadata |
| `addSourcePost(callback)` | `sources.ingest(options, callback)` and staged writes |
| `post.sourceContent`, `source`, `sourceMeta`, `setSource()`, `getSourceValue()` | `SourceRecord.content`, `.metadata`, canonical lookups, and provenance traversal |
| Post constructor `sourceContent`, `sourceMeta`, `source`, `meta` | Source records; removed constructor options throw explicitly |
| `post.meta`, `setMeta()`, `getMetaValue()` | Keep derived mapper state local; persist diagnostics or explicit relationships where appropriate |
| `findPosts({sourceAttr})` | Source lookup followed by `entitiesFor()` |
| `hasContent()` as evidence of ingestion | `sources.hasCompletedIngestion` |
| `resetContent` for safe rereading | Staged `sources.ingest({replace: true}, callback)` |
| `forEachPost()` as a raw-source remapping pass | `rebuildMappedContent()` and `sources.records()` |

A mapped lookup key is optional and distinct from source identity. Direct mapped creation remains valid in persistent databases. Scraping responses remain on `post.webscrapeData`.

## Ingestion contract

Each record has a caller-defined kind and optional key, opaque text content, a format label, and JSON ingestion metadata. Metadata may include file/request provenance but must not become mutable mapping state. Keys are unique within a kind; unkeyed records are retained independently. Explicit duplicate policies select a canonical version without core timestamp rules.

`stage.write()` accepts an iterable or async iterable. It commits at 250 records or 4 MiB by default and allows an oversized record alone. No transaction remains open while awaiting input. Await every write before returning from the ingestion callback. Staging handles and their iterators are invalid after the callback ends.

Only the ingestion handle reads staged data. Ordinary source reads continue to see completed data. Core blocks mapped writes through its public APIs during ingestion. The low-level SQLite handle remains an advanced escape hatch, not a lifecycle-managed write interface.

Successful promotion clears mapped entities, relationships, links, mapping diagnostics, and counters. Failed replacement leaves completed data usable. On the next ingestion attempt, abandoned staging is discarded and ingestion starts from the beginning. Empty ingestion can complete. Failed-attempt diagnostics remain queryable using their ingestion IDs even after their source payloads are discarded.

No public snapshots, revision comparisons, or retained payload history are involved. Callers may store hashes or labels in opaque metadata and compare them themselves. One migration owner may write a database at a time.

## Rebuilding and diagnostics

Always call `rebuildMappedContent()` on a migration run, including immediately after first ingestion. It clears derived content and executes the mapper within a transaction. An unexpected mapper error restores the preceding mapped result. Use `savepoint()` around an individual record's mapping if a known error can be skipped; core never classifies or silently skips mapper exceptions.

Use `sources.link(recordId, {type, id})` after saving each mapped entity. This supports multiple contributors and multiple outputs without assigning a primary source. Deleting a mapped entity removes its links. Stable destination IDs belong to the adapter, not internal database IDs.

Ingestion diagnostics survive remapping. Mapping diagnostics do not. Explicit `getMigrationReport()`, `sanitizedFields`, and duplicate-slug reports return arrays; streaming interfaces avoid this materialization. Slug diagnostic URLs use mapped canonical URLs when present, otherwise an empty string; original URLs can be resolved separately through provenance.

## Compatibility and delivery

All incompatible existing databases must be rebuilt. Rejection leaves their contents untouched; an operator or runner must explicitly replace the database. Downloaded assets are managed separately and need not be deleted.

The WordPress XML, WordPress API, Ghost API and Substack runners use completed source records for reuse and rebuild mapped content on every run. `mg-webscraper.scrapePost()` accepts the URL chosen by its caller, while retaining support for older duck-typed targets. Adapters remain independent packages; source-specific parsing and mapping do not belong in core.

Core's streaming export/report APIs produce local files and descriptors only. ZIP creation, remote upload streams, report placement, CLI flags, and orchestration belong to runners.

## Output ownership

Consumers own output directories and cleanup of earlier exports. Core writes the requested targets without deleting old chunks or differently named JSON, CSV, tag, or author exports. Use a new directory per run, or remove previous output before writing another export. Ownership manifests are no longer created or consulted; any legacy manifest already on disk is left untouched for the consumer to remove. `replaceExisting` has been removed from the API. Author/tag caches have also been removed; canonical reuse reads the indexed database rows.

Each JSON file is written through a temporary file and renamed when complete. Its descriptor and callback/event are delivered immediately, before later batches are written. A failure can leave earlier completed files in place; consumers must discard that partial staging directory. Core provides no whole-export rollback, backups, journals, or recovery of previous runs. Consumers should publish their staging directory only after the whole export succeeds.
