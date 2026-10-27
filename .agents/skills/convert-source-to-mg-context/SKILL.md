---
name: convert-source-to-mg-context
description: Convert a source adapter and its migration runner in this Ghost migration toolkit to mg-context's shared source records, repeatable mapping, and bounded processing. Use when porting another source away from migration-wide arrays or removed post-owned source APIs.
---

# Convert a source to mg-context

Keep the adapter independently usable as an npm package. The runner owns ingestion policy, workspace selection, processing, delivery, and resource closure. Core stores originals and mapped Ghost content and provides shared mapping helpers; it does not interpret source formats or decide when input changed.

## Read the current contracts

Resolve repository paths from this skill's directory with `../../../`. Follow the repository's `AGENTS.md`; use the implementation when an older example or API-reference paragraph disagrees with it.

- Start with the [source-record migration guide](../../../packages/mg-context/docs/source-records.md), [core README](../../../packages/mg-context/README.md), the [API reference](../../../packages/mg-context/docs/api-reference.md) (especially "Mapping utilities"), and the [source API types](../../../packages/mg-context/src/lib/SourceRecords.ts).
- Read the target adapter, its runner under `packages/migrate/sources/`, CLI options, fixtures, and existing tests before changing behavior.
- File-based template: WordPress XML [ingestion](../../../packages/mg-wp-xml/src/lib/ingest.ts), [mapping](../../../packages/mg-wp-xml/src/lib/map.ts), [mapping state](../../../packages/mg-wp-xml/src/lib/mapping-state.ts), and [runner](../../../packages/migrate/sources/wp-xml.js). Its [runner tests](../../../packages/migrate/test/wp-xml-context.test.js) cover delivery and failures.
- Paginated-API template: WordPress API [fetch tasks](../../../packages/mg-wp-api/src/lib/fetch.ts), [ingestion](../../../packages/mg-wp-api/src/lib/ingest.ts), [mapping](../../../packages/mg-wp-api/src/lib/map.ts), [runner](../../../packages/migrate/sources/wp-api.js), and nock-based [runner tests](../../../packages/migrate/test/wp-api-context.test.js). The [Ghost fetch tasks](../../../packages/mg-ghost-api/src/lib/fetch.ts) and [Ghost runner](../../../packages/migrate/sources/ghost.js) follow the same lifecycle.

## Plan the change set

Each source keeps its own complete task runner in `packages/migrate/sources/<source>.js`, written out in full. Do not create a shared runner helper module; copy the generic steps from `wp-xml.js` or `wp-api.js` and adapt them in place.

Put shared code where it belongs, and split the work into commits that each build and pass on their own, in this order:

1. **`mg-fs-utils`, only if needed:** any new or changed way of reading input files, with tests, before an adapter uses it. Source-specific formats (such as a WordPress users file) stay in the adapter or command. XML parsing stays in `mg-utils`.
2. **`mg-context`, only if needed:** a utility that a second adapter needs and that is not source-specific. Switch every existing adapter to the core version in the same commit so nothing stays duplicated, keep core at 100% coverage, and update the API reference. Source-specific parsing and mapping never go into core.
3. **Adapter:** the TypeScript port, `parse`/`ingest`/`map`, tests, and README.
4. **Runner:** `sources/<source>.js`, `commands/<source>.js`, `test/<source>-context.test.js`, and the runner's name in the "uses this lifecycle" sentence of `mg-context/README.md` and `docs/source-records.md`.

Commit only when the user requests it.

## Establish the source contract

Inventory the behavior to preserve: record types, content transformations, filters, author fallbacks, tag ordering, custom types/taxonomies, image metadata, author matching, links, output options, and public entrypoints. Existing fixtures are the behavior baseline, not just examples to replace. Find other packages that import the adapter (for example, `mg-wp-xml` imports `processShortcodes`, `processContent` and `processExcerpt` from `mg-wp-api`) and keep those exports working and typed.

Resolve source-specific decisions from the code and tests first. Ask focused questions when record boundaries, canonical duplicate selection, stable identities, or public API compatibility remain unclear. A conversion does not authorize changing those semantics or porting unrelated sources. Fix clear bugs found while covering the code, and list each behavior change in your report.

Use these terms consistently:

- **Source record:** a caller-defined original, stored as opaque text with a kind, optional canonical key, format label, and JSON ingestion metadata. Parsed XML serialized as JSON, an API object serialized as JSON, and a Markdown file's text are all valid originals.
- **Completed source data:** the one current logical input dataset in a context, including a successfully ingested empty dataset.
- **Ingestion attempt:** an attempt to stage and publish replacement input. Internal staging generations are not a public snapshot/history model.
- **Mapped entity:** a derived post, author, or tag. A **mapped lookup key** is an optional mapped-post reuse key, not a source record's internal ID or an automatic source identity.

Callers choose the workspace/database for a dataset. Reuse policy belongs to the runner: ingest when `!context.sources.hasCompletedIngestion || options.rereadSource`, then remap on every run. Do not use mapped post counts to infer completion. Core does not compare filenames, hashes, source revisions, or command options. Successful empty ingestion is reusable.

## Separate parsing, ingestion, and mapping

Expose typed `parse(input)`, `ingest(input, context, options)`, and `map(options, context, services)`. The caller owns and closes the context. Keep a compatibility API only if the task requires one; do not add a wrapper by default. Remove the old in-memory entrypoints (such as a `process.all(ctx)` that fills `ctx.result`) once the runner no longer uses them.

Keep parsing streaming: yield one logical original at a time, paginate API requests, and discover files without reading all bodies. Use `mg-utils` for parsing; XML already has `xmlUtils.streamXmlRecords()`. Keep source-specific discovery and validation in the adapter.

Store originals before migration transformations and retain supporting records needed by later passes: authors, taxonomy definitions, attachments, channel/site metadata, and currently excluded content. Key records by stable source IDs, such as `id:<n>`, `<type>:id:<n>`, a URL, or a zip path.

Apply replayable selection options (`posts`, `pages`, `drafts`, custom types, `maxPosts`, `onlyURLs`, `addTag`) in `map()`, so changing them needs no new read. For API sources, fetch the full replayable set and let mapping filter. Options that must narrow the fetch for cost or correctness (server-side date bounds, `maxPosts` page limits, `--batch`, extra endpoints) also apply at map time, and the docs must say that widening them needs `--rereadSource`. Select by how a record was fetched (for example, its endpoint in ingestion metadata) when an option names endpoints rather than types.

Use `context.sources.ingest({replace, metadata}, callback)`:

- For API sources, have `ingest()` drive the paged fetch. Return one task per page from `fetch.tasks(url, ctx)`, with each task writing into `ctx.sourceIngestion`, as `mg-ghost-api` and `mg-wp-api` do. Apply `--batch` by selecting tasks inside the callback, and report each page through an `onProgress(title)` callback so the runner can show it. Fetch pages in a deterministic order: record order decides which entity keeps a contested slug.
- Use `stage.reconcile(record, {choose, reportIdentical})` when the same key can arrive more than once. `choose(existing, incoming)` returns `keep` or `replace` (for example, newest `modified_gmt`), and core records a `source:conflict` diagnostic when the versions differ. Use plain `stage.put()`/`stage.write()` only when keys are guaranteed unique; their default duplicate policy is an error.
- `stage.write(iterable)` commits batches of 250 records or 4 MiB by default, allowing one oversized record alone. Await writes before the callback returns. Do not wrap ingestion in a long transaction spanning input/network waits.
- Ordinary source reads see completed originals; only the ingestion handle sees staging. Keep mapped writes out of ingestion. Completion publishes staged records atomically and clears derived content. Failed replacement preserves the previous originals and mapped result; interrupted staging restarts rather than resumes.
- Completed content and ingestion metadata are immutable. Record fetch scope (URL, limits, date bounds, batch) in ingestion metadata, not mutable mapper state. Unkeyed records can remain available for diagnostics; choose their mapping policy explicitly without inventing stable identities from array positions or internal database IDs.

Do not restore removed APIs: `contentIdentity`, `addSourcePost()`, post constructor `sourceContent`/`sourceMeta`/`source`/`meta`, `setSource()`, `getSourceValue()`, or source-attribute post filtering. Do not use a full `reset()` to implement safe rereading. Incompatible older databases require an explicit rebuild; do not silently delete them or downloaded assets.

## Rebuild mapped content from the database

Have one layer own `context.rebuildMappedContent(callback)` per mapping pass. It resets mapped entities, relationships, links, diagnostics, and counters, preserving originals and ingestion diagnostics. An unexpected callback failure restores the preceding mapped result. Avoid wrapping a mapper that already owns rebuilding in a second rebuild.

Inside it, map records with `context.mapRecords(records, mapper)`. Each record gets its own savepoint. A mapper that returns `false` leaves the record unselected. A thrown `RecordDataError` (from `@tryghost/mg-context`) rolls back that record and records a `record:skipped` diagnostic. Any other error fails the mapping. It returns `{selected, imported, skipped}`:

```ts
return context.rebuildMappedContent(() =>
    context.mapRecords(context.sources.records({kind: 'content'}), async record => {
        const item = JSON.parse(record.content);
        if (!selected(record, item, options)) {
            return false;
        }
        const post = await mapRecord(record, item, state, options); // throws RecordDataError for bad data
        post.save(context.db);
        context.sources.link(record.id, {type: 'post', id: post.dbId!});
    })
);
```

Throw `RecordDataError` only for classified data problems, such as an invalid date or URL, or more than 500 tags or authors. Do not turn storage, programming, or malformed-document errors into skippable data errors. Look up related originals with indexed canonical queries; stage the complete input before mapping so references to later records resolve.

Construct the complete post before its first `save()`, so slug allocation sees its final title/slug. Use core schema normalization and limits rather than copying sanitization rules into adapters. Convert legacy field shapes to the schema: date fields need `Date` objects, and `comment_id` is a string. Preserve existing title decoding, author fallbacks, public-before-internal tag ordering (sort `#` tags last), and `hash-` internal-tag conventions where the source already supports them.

Parse dates explicitly. `new Date('2018-07-23 00:57:23')` uses the machine's timezone, so append `Z` to zoneless timestamps (WordPress `*_gmt` fields, and site-local fields when no timezone is known). Prefer the most authoritative field and fall back before skipping. WordPress drafts that were never published have an empty or `-0001` `pubDate` and a zeroed `post_date_gmt`, so use `post_date_gmt`, then `pubDate`, then `post_date`. Take `updated_at` from the modified date when one exists.

Assign stable Ghost IDs with `ghostId(namespace, site, kind, key)` from `@tryghost/mg-context`. Use a namespace that names the adapter and ID scheme version (`mg-wp-xml:1`, `mg-wp-api:1`) and a stable source key. Preserve valid existing Ghost IDs and matched destination-author IDs. Core source-record IDs are not stable destination IDs.

Use `new MappingState(context, name)` from core for per-run lookups: a disk-backed key-value store, `index`/`find` from lookup keys to source records, `bind`/`getBinding` from source keys to mapped database IDs, and `reserveSlug`/`uniqueSlug`. Subclass it for source-specific lookups, as [WordPress mapping state](../../../packages/mg-wp-xml/src/lib/mapping-state.ts) does. Distinct authors or terms must not merge just because their slugs collide: `post.save()` de-duplicates post slugs, but saving a tag or author reuses any row with the same slug, so call `state.uniqueSlug()` first. Avoid whole-migration maps/sets and application entity caches.

For destination authors, stream users with `streamGhostUsers()` from `mg-ghost-authors`, `reserveSlug()` each Ghost slug, index users by lowercase email, and merge matches with `mergeUsersWithGhost()`. Replace unsupported roles with supported Ghost roles and record an `operation:warning`. Delete any source-native user ID before saving; only a matched Ghost user supplies an author ID.

Link saved entities to all contributing originals with `sources.link(record.id, {type, id: entity.dbId})`; the ID is the internal mapped database ID, not `ghostId`. Register old URLs with `context.addLink(stringUtils.cleanURL(oldUrl), newPath)` for posts (keeping any dated-permalink prefix), tags, and authors, using final saved slugs. This replaces `LinkFixer.buildMap()`.

## Process and deliver without collecting the migration

Copy the runner's steps from `wp-xml.js` or `wp-api.js`: initialize, fetch/ingest, map, web scrape, assets, link fixing, staged export and report, ZIP and upload, all inside the same `run` wrapper. Drop `toGhostJSON`, `mgHtmlLexical.convert(ctx)`, `assetScraper.getTasks()`, `linkFixer.buildMap/fix`, and `webScraper.hydrate()`. Keep any `getInfoTaskList` the runner had, passing CLI options (not `ctx`) to discovery.

Choose the workspace carefully:

- Name the `FileCache` so different inputs never share a workspace. `cacheNameFromPath('https://example.com')` and `cacheNameFromPath('https://example.org')` both give `example`. Use `--cacheName` when given, otherwise something unique, such as the full URL.
- Put the database at `join(fileCache.tmpDir, 'mg-context.sqlite')`. With `--batch`, use `mg-context-batch-<n>.sqlite`: `FileCache` batch names don't change the cache directory, so batches sharing one database would reuse batch 1's stored source.

Use bounded entity iterators. `forEachPost()`/`forEachTag()`/`forEachAuthor()` save callback changes; tag/author iteration defaults to referenced entities.

- Scrape per post with `webScraper.scrapeUrl(url, scrapeConfig.posts, post.ghostId, wait)`, reading the original URL from the post's source record. Skip drafts and catch only `errorType === 'ScrapeError'` as an `operation:warning`. Store the response on `post.webscrapeData`, then run the post processor on a copy; pass `{html: post.get('html')}` as its data argument if it uses the post body. Set only schema fields with nonempty values.
- Use AssetScraper with `retainFailures: false`, `strictErrors: true`, and `onFailure` writing an `operation:warning` diagnostic.
- Fix links with `linkFixer.fixPost(post, url => context.findLink(url))`. Export HTML; Ghost's importer converts it, so remove `--fallBackHTMLCard`.
- Show progress as counted sub-tasks, not one listr task per item. Listr tasks for every post hold memory until the step ends. Return `task.newListr([...], {concurrent: false, exitOnError: true})` with a `Posts (n/total)` sub-task for scraping and `Posts`/`Tags`/`Authors` sub-tasks for assets. Take totals from `db.stmts.countPosts`/`countUsedTags`/`countUsedAuthors`, set the item being processed as `subtask.output`, and clear it with `null` on success. Don't push to `ctx.errors` in runners that don't create it.

Export with `writeGhostJsonStream()` into a `mkdtemp` staging directory under the cache's `tmpDir` (`filename: 'ghost-import'`, `batchSize: options.postsPerFile`, default 2,000). After it succeeds, remove only the source's own stale `ghost-import*.json` files from `zipDir` and move the staged files in. Set `ctx.warningCount = context.countWarnings()`.

Reports are opt-in: `--report` defaults to `false`. Only when it is set, plan `ctx.reportFile` beside the ZIP (or in the cache directory when `--zip false`). Write it with `writeMigrationReport()`, upload it after the ZIP, and write a `.failed-report.json` from the `run` wrapper on failure. When it is off, write nothing and leave the `Report:` path out of the command's summary line.

Write the ZIP to a temporary name and rename it into place. Streaming uploads to `outputStorage.upload({body, fileName, size})` pass readable bodies that must be consumed before resolving. Keep local recovery files until every upload succeeds, and set `ctx.outputFile` only after them.

If every selected item is invalid, fail the run; an intentionally empty selection succeeds. The `run` wrapper closes the asset scraper and context in `finally`, and empties the cache only after success with `--cache false` and `--zip`.

Add `--rereadSource`, `--postsPerFile`, `--cacheName`, and `--report` to the command, matching `commands/wp-xml.js`.

## Port the adapter to TypeScript

- Use the `AGENTS.md` package and tsconfig template and the c8 command from `mg-wp-xml/package.json` (`--all --100`, excluding tests and `.d.ts`). `git mv` existing files into `src/` so history follows them, and move tests to `src/test/*.test.ts`.
- Tests run from `build/`, so read fixtures relative to `new URL('../../src/test/', import.meta.url)`.
- Declare untyped dependencies in `src/types.d.ts`. Remove a consumer's `declare module` shim once the adapter ships its own types.
- Wrap interface-only modules in `/* c8 ignore start */` and `/* c8 ignore stop */`, as `mg-assetscraper-db/src/lib/types.ts` does. Otherwise `--all` counts them as uncovered.
- Reach 100% with targeted tests, and delete branches that cannot run rather than ignoring them.
- Mock HTTP with nock. In nock 15, a reply callback receives a Fetch `Request` (`request.url`, `request.headers`), not a URI string, and `this.req` is unavailable. Use `nock(site, {reqheaders})` to require credentials.

## Verify the port and document the boundary

Port the source's baseline tests and cover the behavior introduced by the conversion:

- Completed-empty versus absent ingestion; failed replacement; reuse without reading the source; explicit rereading; changed mapping options replaying stored originals; per-batch databases.
- Stable IDs; duplicate selection and conflict diagnostics; unkeyed/invalid records; cross-record references; distinct entities with colliding slugs; author matching; date fallbacks; links on every rebuild.
- Known record errors versus unexpected failures; optional scraping failures; resource closure after initialization, mapping, export, and upload failures.
- JSON chunks, owned-file cleanup, reports with and without `--report`, failed reports, stream-consuming uploads, and progress sub-task titles.
- Existing callers of shared packages, such as `mg-wp-xml` using `mg-wp-api` exports.

Run package tests with 100% coverage for each touched TypeScript package, the runner tests, `pnpm test` in `packages/migrate`, and `pnpm lint` at the root. Then run the CLI on a real export or site with `--scrape none --zip false --tmpPath <scratch dir>`. Run it a second time without `--rereadSource` and confirm it skips the fetch and writes identical `ghost-import.json`. For a full bounded-memory conversion, exercise the pipeline at scale; the [WordPress stress test](../../../packages/mg-wp-xml/test/stress.mjs) uses 100,000 records with 10 KiB bodies, a 256 MiB heap, and peak RSS below 512 MiB.

Document the `parse`/`ingest`/`map` API, caller-owned reuse and reread policy, which options narrow the fetch and which apply at map time, output format, `--report`, streaming storage requirements, and breaking changes in the adapter README. Keep context terminology in `mg-context`'s maintained documentation rather than introducing duplicate glossaries or ADRs for this conversion. Report any downstream incompatibilities and behavior changes explicitly.
