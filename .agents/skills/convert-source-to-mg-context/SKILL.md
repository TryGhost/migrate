---
name: convert-source-to-mg-context
description: Convert a source adapter and its migration runner in this Ghost migration toolkit to mg-context's shared source records, repeatable mapping, and bounded processing. Use when porting another source away from migration-wide arrays or removed post-owned source APIs.
---

# Convert a source to mg-context

Keep the adapter independently usable as an npm package. The runner owns ingestion policy, workspace selection, processing, delivery, and resource closure. Core stores originals and mapped Ghost content; it does not interpret source formats or decide when input changed.

## Read the current contracts

Resolve repository paths from this skill's directory with `../../../`. Follow the repository's `AGENTS.md`; use the implementation when an older example or API-reference paragraph disagrees with it.

- Start with the [source-record migration guide](../../../packages/mg-context/docs/source-records.md), [core README](../../../packages/mg-context/README.md), and [source API types](../../../packages/mg-context/src/lib/SourceRecords.ts).
- Read the target adapter, its runner under `packages/migrate/sources/`, CLI options, fixtures, and existing tests before changing behavior.
- Use [WordPress ingestion](../../../packages/mg-wp-xml/src/lib/ingest.ts), [mapping](../../../packages/mg-wp-xml/src/lib/map.ts), and its [runner](../../../packages/migrate/sources/wp-xml.js) for the complete streaming pipeline. Its [integration tests](../../../packages/migrate/test/wp-xml-context.test.js) cover delivery and failures.
- For paginated APIs, read [Ghost fetch tasks](../../../packages/mg-ghost-api/src/lib/fetch.ts) and the [Ghost runner](../../../packages/migrate/sources/ghost.js). Ghost preserves some older convenience/delivery behavior; its buffer-based ZIP upload is not a streaming-upload template.

## Establish the source contract

Inventory the behavior to preserve: record types, content transformations, filters, author fallbacks, tag ordering, custom types/taxonomies, image metadata, author matching, links, output options, and public entrypoints. Existing fixtures are the behavior baseline, not just examples to replace.

Resolve source-specific decisions from the code and tests first. Ask focused questions when record boundaries, canonical duplicate selection, stable identities, or public API compatibility remain unclear. A conversion does not authorize changing those semantics or porting unrelated sources.

Use these terms consistently:

- **Source record:** a caller-defined original, stored as opaque text with a kind, optional canonical key, format label, and JSON ingestion metadata. Parsed XML serialized as JSON, an API object serialized as JSON, and a Markdown file's text are all valid originals.
- **Completed source data:** the one current logical input dataset in a context, including a successfully ingested empty dataset.
- **Ingestion attempt:** an attempt to stage and publish replacement input. Internal staging generations are not a public snapshot/history model.
- **Mapped entity:** a derived post, author, or tag. A **mapped lookup key** is an optional mapped-post reuse key, not a source record's internal ID or an automatic source identity.

Callers choose the workspace/database for a dataset. Reuse policy belongs to the runner: ingest when `!context.sources.hasCompletedIngestion || options.rereadSource`, then remap on every run. Do not use mapped post counts to infer completion. Core does not compare filenames, hashes, source revisions, or command options. Successful empty ingestion is reusable.

## Separate parsing, ingestion, and mapping

Expose typed parsing and record-mapping entrypoints, with ingestion and whole-dataset mapping orchestration as appropriate. For a replacement API, the WordPress shape is `parse(input)`, `ingest(input, context, options)`, and `map(options, context, services)`. The caller owns and closes the context. Keep a compatibility API only if the task requires one; do not add a wrapper by default.

Keep parsing streaming: yield one logical original at a time, paginate API requests, and discover files without reading all bodies. Bound in-flight requests and scheduled task lists, not just response pages. Use `mg-utils` for parsing; XML already has `xmlUtils.streamXmlRecords()`. Keep source-specific discovery and validation in the adapter. Do not move file discovery, API fetching, or format parsing into core.

Store originals before migration transformations and retain supporting records needed by later passes: authors, taxonomy definitions, attachments, channel/site metadata, and currently excluded content. Apply replayable selection options during mapping. If an API filter necessarily limits ingestion, document that changing it requires fresh input.

Use `context.sources.ingest({replace, metadata}, callback)`:

- `stage.write(iterable)` provides committed batches of 250 records or 4 MiB by default, allowing one oversized record alone. Await writes before the callback returns. Do not wrap ingestion in a long transaction spanning input/network waits.
- Use `stage.put()` and staged lookups when canonical duplicate selection needs source-specific logic. Keys are unique within a kind. The default duplicate policy is an error; explicitly choose `keep` or `replace`. Interpret timestamps in the adapter.
- Ordinary source reads see completed originals; the ingestion handle alone sees staging. Keep mapped writes out of ingestion. Completion publishes staged records atomically and clears derived content. Failed replacement preserves the previous originals and mapped result; interrupted staging restarts rather than resumes.
- Completed content and ingestion metadata are immutable. Metadata records ingestion provenance, not mutable mapper state. Unkeyed records can remain available for diagnostics; choose their mapping policy explicitly without inventing stable identities from array positions or internal database IDs.

Do not restore removed APIs: `contentIdentity`, `addSourcePost()`, post constructor `sourceContent`/`sourceMeta`/`source`/`meta`, `setSource()`, `getSourceValue()`, or source-attribute post filtering. Do not use a full `reset()` to implement safe rereading. Incompatible older databases require an explicit rebuild; do not silently delete them or downloaded assets.

## Rebuild mapped content from the database

Have one layer own `context.rebuildMappedContent(callback)` per mapping pass. It resets mapped entities, relationships, links, diagnostics, and counters, preserving originals and ingestion diagnostics. An unexpected callback failure restores the preceding mapped result. Avoid wrapping a mapper that already owns rebuilding in a second rebuild.

Iterate `context.sources.records()` and look up related originals with indexed canonical queries. Handle references to records appearing later by staging the complete input before mapping. Use `context.savepoint()` for an individual record when known record-data errors may be skipped; existing nested `transaction()` calls do not provide that isolation.

The mapper's per-record structure should be equivalent to:

```ts
for await (const record of context.sources.records({kind: 'post'})) {
    try {
        await context.savepoint(async () => {
            const post = await mapRecord(record, context, options);
            // mapRecord supplies complete scalar fields and relationships.
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
        });
    } catch (error) {
        if (!(error instanceof RecordDataError)) throw error;
        context.recordDiagnostic('record:skipped', {reason: error.message}, record.id);
    }
}
```

Adapt the kind, selection, mapper, and known-error class to the source. Record a skipped diagnostic after its savepoint rolls back. Do not turn storage, programming, or malformed-document errors into skippable data errors. Keep summary counters consistent with committed per-record work.

Construct the complete post before its first `save()`, so slug allocation sees its final title/slug. Use core schema normalization and limits rather than copying sanitization rules into adapters. Preserve existing title decoding, dates, author fallbacks, public-before-internal tag ordering, and `hash-` internal-tag conventions where the source already supports them.

Assign stable Ghost IDs from source-defined stable identity when the adapter promises stable IDs; preserve valid existing Ghost IDs and matched destination-author IDs. Generated Ghost IDs are 24-character hexadecimal strings; namespace their inputs by adapter, logical dataset/site, entity kind, and stable source key. Core source-record IDs are not stable destination IDs. Distinct authors or terms must not merge just because their desired or normalized slugs collide. Resolve identity separately, allocate deterministic suffixes within schema limits, and reuse saved entities through indexed database lookups. Destination-user lookup already has `streamGhostUsers()` in `mg-ghost-authors`.

Link saved entities to all contributing originals with `sources.link(record.id, {type, id: entity.dbId})`; the ID here is the internal mapped database ID, not `ghostId`. Provenance is optional and many-to-many, with no primary source. Direct mapped creation without originals remains supported.

Keep per-run mapper state local. If canonical lookup is insufficient for secondary names, bindings, or destination matches, use a narrowly scoped adapter-owned database index rebuilt each pass, as in [WordPress mapping state](../../../packages/mg-wp-xml/src/lib/mapping-state.ts). Do not add a generic mutable metadata bag or alias API to core. Avoid whole-migration maps/sets; database reuse must work without an application entity cache.

## Process and deliver without collecting the migration

Use bounded source/entity iterators and database filters. `forEachPost()`/`forEachTag()`/`forEachAuthor()` save callback changes; `streamPosts()` is useful for explicit iteration. Tag/author iteration defaults to referenced entities; use `scope: 'all'` only when unused entities should be processed too. Array-returning convenience APIs remain available for deliberate small callers, but do not use them to drive a large migration.

- Process scraping per record with bounded concurrency, supplying the original URL explicitly. Retain scraped responses on `post.webscrapeData`. Preserve draft-scraping skips and the precedence of nonempty scraped metadata where supported. Store binary assets outside primary source storage.
- Use AssetScraper's `retainFailures: false` and `onFailure` for persisted diagnostics instead of an expanding failure array. `strictErrors: true` distinguishes local processing/storage failures from optional download failures. Catch only the documented remote failure class; do not catch all scraper errors as warnings.
- Map HTML into the current post schema. Do not pass HTML-only context objects through a legacy Lexical hydration stage. `mg-linkfixer.fixPost()` supports HTML-only targets and database-backed link resolution. Build links from final saved slugs after destination-author matching, then fix HTML links.
- Reuse `writeGhostJsonStream()` and `writeMigrationReport()`. They extend the existing JSON exporter; do not add a competing exporter, descriptor journal, or core ownership manifest. Avoid collecting output descriptors, sanitization/slug reports, or diagnostics into arrays. Use `streamDiagnostics()` for bounded reporting.

The runner owns output filenames, chunk limits, publication, and obsolete-file cleanup. Stage a whole export before replacing owned output, and clean only that source's owned files after successful replacement. Core provides per-file atomic writes, not whole-export rollback. Preserve the adapter's established output contract; WordPress's `ghost-import`/2,000-post defaults are a source-specific reference.

For a streaming delivery conversion, ZIP and report uploads receive readable bodies with filenames and sizes, and must consume the stream before resolving. Keep local recovery files until both uploads succeed; expose output and report descriptors separately. Put durable reports beside the ZIP or unpacked import folder so successful cache cleanup does not delete them.

Skip and report only classified record-data errors. Partial valid output can succeed with visible warning counts; intentionally empty selection succeeds. If the runner skips invalid records and every selected item is invalid, write the report and fail. Failed runs retain caches and do not publish a new import artifact.

Wrap the entire runner, including initialization, in `finally`. Close resources that were initialized, use idempotent closure, and close before successful cache cleanup. For Listr progress, clear `task.output` with `null` only on success; retain useful failure output. Keep progress state bounded.

## Verify the port and document the boundary

Follow repository TypeScript build/package-export conventions, including `.js` relative imports and the development `source` condition with published exports pointing only to `build`. Preserve independently published adapter packages. Use existing shared utilities before adding dependencies or core abstractions.

Port the source's baseline tests and cover the behavior introduced by the conversion:

- Completed-empty versus absent ingestion; failed replacement; interrupted staging cleanup; ordinary reuse without reading the source; explicit rereading; changed mapping options replaying stored originals.
- Stable IDs; duplicate selection; unkeyed/invalid records; cross-record/file references; distinct entities with colliding slugs; author matching; fresh relationships and links on every rebuild.
- Known record errors versus unexpected failures; savepoint and whole-rebuild rollback; optional scraping failures; resource closure after initialization, mapping, export, and upload failures.
- Streaming JSON chunks/reports, owned-file cleanup, output publication failure, durable reports with cache cleanup, and stream-consuming remote storage.
- Existing nonconverted public callers when shared packages change, including array-returning and Lexical consumers.

Run package build/tests with 100% coverage for touched TypeScript packages, relevant runner integration tests, and repository lint/format checks. Run workspace build/tests when shared API changes affect downstream packages. For a full bounded-memory conversion, exercise the complete pipeline at scale; the [WordPress stress test](../../../packages/mg-wp-xml/test/stress.mjs) uses 100,000 records with 10 KiB bodies, a 256 MiB heap, peak RSS below 512 MiB, and stream-consuming uploads. Adapt the generator to the target source and report measured results.

Document the replacement API, caller-owned reuse/reread policy, ingestion-only versus replayable options, database rebuilding, output format, streaming storage requirements, report locations, and breaking changes in the package's existing docs. Keep context terminology in `mg-context`'s maintained documentation rather than introducing duplicate glossaries or ADRs for this conversion. Report any downstream incompatibilities explicitly. Commit only when the user requests it.
