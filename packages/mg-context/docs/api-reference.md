# API reference

Complete reference for `@tryghost/mg-context`. Start with the package [README](../README.md) for the normal ingest, transform, and export workflow.

- [MigrateContext](#migratecontext)
- [Source records](#source-records)
- [Mapping utilities](#mapping-utilities)
- [PostContext](#postcontext)
- [TagContext](#tagcontext)
- [AuthorContext](#authorcontext)

## MigrateContext

The top-level class that manages the database and all entity operations.

### Constructor

```js
new MigrateContext(options?)
```

| Option               | Type                                  | Default       | Description                                               |
| -------------------- | ------------------------------------- | ------------- | --------------------------------------------------------- |
| `dbPath`             | `string`                              | —             | Path to a SQLite file for persistent, resumable storage   |
| `storage`            | `'temporary' \| 'memory'`             | `'temporary'` | Storage used when `dbPath` is absent                       |
| `resetContent`       | `boolean`                             | `false`       | Clear stored migration content during `init()`; the caller decides whether to ingest again |
| `onDuplicate`        | `'skip' \| 'replace' \| resolver`     | `'skip'`      | Default lookup-key duplicate policy                       |
| `ephemeral`          | `boolean`                             | —             | Deprecated compatibility alias for memory storage         |
| `emitEvents`         | `boolean`                             | `true`        | Deprecated; omit listeners to opt out naturally           |
| `warnOnLookupKeyDuplicate` | `boolean`                     | —             | Deprecated; duplicate outcomes are never logged directly  |

```js
// Managed temporary on-disk database (default)
const ctx = new MigrateContext();

// Persistent and resumable
const ctx = new MigrateContext({
    dbPath: './migration.sqlite'
});

// Clear stored content before the caller ingests again; asset caches are untouched
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    resetContent: true
});

// Explicit in-memory storage, mainly for small jobs and tests
const ctx = new MigrateContext({storage: 'memory'});
```

Pass either `dbPath` or `storage`, never both. The default temporary database is deleted when the context closes. A `dbPath` is not deleted.

### Lifecycle

#### `init(): Promise<void>`

Initialize the database. Must be called before any other operations. Throws if called twice without `close()` in between.

#### `close(): Promise<void>`

Close the database connection. Always call this when done, ideally in a `finally` block.

```js
const ctx = new MigrateContext();
await ctx.init();
try {
    // ... work
} finally {
    await ctx.close();
}
```

#### `schemaVersion: number`

The version of the mg-context schema stored in the open SQLite database. The current version is also exported as `MIGRATE_CONTEXT_SCHEMA_VERSION`.

Schema version 5 is current. init() creates fresh databases or validates compatible version-five layouts. Other versions and incompatible experimental layouts are rejected with a rebuild instruction; existing files are not migrated or deleted.

#### `databasePath: string`

The SQLite path in use after `init()`. Returns `':memory:'` for explicit memory storage. The path for default temporary storage is owned by the context and becomes invalid after `close()`.

#### `hasContent(): ContentStats | false`

Returns `false` when the database is empty. When it contains migration data, it returns counts while remaining truthy for existing resume checks:

```js
const stats = ctx.hasContent();
if (stats) {
    console.log(`${stats.posts} posts, ${stats.pages} pages`);
}
```

The returned object contains `posts`, `pages`, `users`, `tags`, `userAssociations`, `tagAssociations`, and `links`. Authors are reported as users because that is how they appear in the Ghost import. Original source records do not count as mapped content; use sources.hasCompletedIngestion to check ingestion completion.

#### `reset(): void`

Atomically removes every post, tag, author, relationship, and link mapping and clears the related reports. It resets row ID sequences but keeps the SQLite database file open; it does not remove the database, its WAL/SHM files, downloaded assets, or an asset scraper's separate database.

Original records, ingestion completion, attempt metadata, diagnostics, and provenance links are cleared too. Separately managed asset caches are untouched.

```js
if (ctx.hasContent()) {
    ctx.reset();
}
```

Objects loaded before `reset()` should be discarded because their database IDs no longer refer to stored rows.

#### `resetMappedContent(): void`

Clear posts, tags, authors, relationships, link mappings, mapping diagnostics, and derived counters, preserving completed originals and ingestion diagnostics.

#### `rebuildMappedContent(callback): Promise<T>`

Atomically reset mapped content and execute the callback. Read originals through `sources.records()` and explicitly save newly mapped entities. Unexpected callback failure restores the previous mapped result. This is the runner's remapping step on every run, including the first.

#### `savepoint(callback): Promise<T>`

Isolate a record's writes inside an existing transaction, rolling them back if the callback throws. Outside a transaction this starts one. The caller decides which errors may be skipped; existing nested `transaction()` calls retain their flattened behavior.

#### `mapRecords(records, mapper): Promise<MappingSummary>`

Run `mapper(record)` for each record of a sync or async iterable, each inside its own `savepoint()`. Call it from inside `rebuildMappedContent()`. Returns `{selected, imported, skipped}`:

- A mapper that returns `false` leaves the record unselected; it is not counted.
- Any other return value counts the record as selected and imported.
- A thrown `RecordDataError` rolls back that record's writes, counts it as selected and skipped, and records a `record:skipped` diagnostic with the record's metadata, the error message as `reason`, and the record's ID.
- Any other error propagates. Core never classifies or skips other mapper exceptions.

```js
const summary = await context.rebuildMappedContent(() =>
    context.mapRecords(context.sources.records({kind: 'item'}), async record => {
        const item = JSON.parse(record.content);
        if (item.type === 'attachment') {
            return false;
        }
        if (!item.date) {
            throw new RecordDataError('Missing publication date');
        }
        // build, save, and link entities
    })
);
```

#### `countWarnings(): number`

Count stored diagnostics, from both ingestion and mapping, whose type is in `WARNING_EVENT_TYPES`. Runners report this as the `warnings` summary field.

#### `db: DatabaseModels`

Access the underlying database models. Needed for `post.save(ctx.db)`.

### Adding posts

#### `addPost(options?): Promise<PostContext>`

Create a new post. Returns an unsaved `PostContext` — call `post.save(ctx.db)` to persist.

```js
// Empty post
const post = await ctx.addPost();

// With a lookup key for deduplication
const post = await ctx.addPost({lookupKey: 'https://example.com/original-url'});

// Override the context's duplicate policy for one post
const post = await ctx.addPost({
    lookupKey: 'https://example.com/original-url',
    onDuplicate: 'replace'
});

```

Mapped posts may be saved without source records or lookup keys. Optional lookup keys distinguish mapped outputs; they do not identify original input. The old source/meta constructor options throw explicitly.

#### `addPost(postContext): Promise<PostContext>`

```js
const post = new PostContext();
post.set('title', 'Pre-built');
post.set('slug', 'pre-built');
post.set('created_at', new Date());
await ctx.addPost(post); // saves immediately
```

### Transactions

#### `transaction(callback): Promise<T>`

Wrap operations in a database transaction. Significantly improves write performance for bulk inserts.

```js
await ctx.transaction(async () => {
    for (const row of data) {
        const post = await ctx.addPost();
        post.set('title', row.title);
        // ...
        await post.save(ctx.db);
    }
});
```

### Links

MigrateContext stores URL mappings for link fixing — old URLs that should be rewritten to new relative Ghost paths. Links are stored in a dedicated `Links` table with an indexed lookup column.

#### `addLink(oldUrl, newUrl): void`

Store a URL mapping. Keys should be cleaned URLs (`host/path`, no protocol or query params) to match how LinkFixer normalizes hrefs. Duplicate `oldUrl` entries are silently ignored (first write wins).

```js
ctx.addLink('example.com/my-post/', '/my-post/');
ctx.addLink('example.com/tag/news/', '/tag/news/');
ctx.addLink('example.com/author/alice/', '/author/alice/');
```

For multi-domain support, store an entry for each domain:

```js
const hosts = ['example.com', 'olddomain.com'];
for (const host of hosts) {
    ctx.addLink(`${host}/my-post/`, '/my-post/');
}
```

#### `findLink(oldUrl): string | null`

Look up a single URL mapping. Returns the new URL or `null` if no match. This is an indexed lookup — fast enough to call per-link within a single post's content.

```js
ctx.findLink('example.com/my-post/');    // '/my-post/'
ctx.findLink('example.com/unknown/');    // null
```

Designed to be used as a lookup function with [mg-linkfixer](../../mg-linkfixer)'s `fixPost`:

```js
import LinkFixer from '@tryghost/mg-linkfixer';

const linkFixer = new LinkFixer();
const lookup = (url) => ctx.findLink(url);

await ctx.forEachPost(async (post) => {
    await linkFixer.fixPost(post, lookup);
});
```

### Finding entities

#### `findPosts(options): Promise<PostContext[] | null>`

Find posts by various criteria. Only one criterion is used at a time (first match wins).

| Option        | Type           | Description                                      |
|---------------|----------------|--------------------------------------------------|
| `slug`        | `string`       | Match post slug                                  |
| `title`       | `string`       | Match post title                                 |
| `tagSlug`     | `string`       | Find posts with this tag slug                    |
| `tagName`     | `string`       | Find posts with this tag name                    |
| `authorSlug`  | `string`       | Find posts by this author slug                   |
| `authorName`  | `string`       | Find posts by this author name                   |
| `authorEmail` | `string`       | Find posts by this author email                  |

```js
const posts = await ctx.findPosts({tagSlug: 'news'});
const posts = await ctx.findPosts({authorEmail: 'alice@example.com'});
```

#### `findTags(options?): Promise<TagContext[] | null>`

Find tags by `slug` or `name`. `scope` is `'referenced'` by default, so standalone tags are omitted unless `{scope: 'all'}` is passed.

#### `findAuthors(options?): Promise<AuthorContext[] | null>`

Find authors by `slug`, `name`, or `email`, with the same `scope: 'referenced' | 'all'` behavior.

```js
const usedTags = await ctx.findTags({name: 'News'});
const everyTag = await ctx.findTags({name: 'News', scope: 'all'});
```

#### `getAllPosts(): Promise<PostContext[]>`

Load all posts. Use `forEachPost` for large datasets to avoid loading everything into memory.

#### `updatePostData(dbId, patch, options?): void`

Patch scalar post fields without loading or rewriting the post's tag and author relationships. This is useful for asset scraping and HTML enrichment when the adapter retained the internal SQLite ID from `post.dbId` during ingestion.

```js
ctx.updatePostData(postDbId, {
    html: enrichedHtml,
    feature_image: downloadedFeatureImage,
    updated_at: new Date()
}, {
    webscrapeData: scraperResult
});
```

The patch goes through the same validation and sanitization as a full save. Changing a date also updates the corresponding indexed SQLite column. Pass `webscrapeData` separately when the raw scraper result should be stored; omit it to leave the existing value unchanged.

`dbId` is mg-context's internal numeric database ID, not the eventual Ghost ID. This method does not query or write `PostTags` or `PostAuthors`. It deliberately rejects `slug`, `tags`, and `authors`: slugs require deduplication and redirect tracking, while relationships require junction-table handling. Load the post and use `PostContext.save()` when changing those fields.

### Iterating

#### `forEachPost(callback, options?): Promise<void>`

Iterate all posts in batches. Each post is automatically saved after the callback.

```js
await ctx.forEachPost(async (post) => {
    post.set('status', 'published');
    // post is saved automatically after callback
}, {batchSize: 200});
```

#### `forEachTag(callback, options?): Promise<void>`

Iterate tags in batches. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone tags. Each tag is automatically saved after the callback.

```js
await ctx.forEachTag(async (tag) => {
    tag.set('description', `Articles about ${tag.data.name}`);
});
```

| Option      | Type                    | Default        | Description           |
|-------------|-------------------------|----------------|-----------------------|
| `batchSize` | `number`                | `100`          | Tags loaded per batch |
| `scope`     | `'referenced' \| 'all'` | `'referenced'` | Which tags to include |

#### `forEachAuthor(callback, options?): Promise<void>`

Iterate authors in batches. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone authors. Each author is automatically saved after the callback.

```js
await ctx.forEachAuthor(async (author) => {
    author.set('bio', 'Updated bio');
});
```

| Option      | Type                    | Default        | Description              |
|-------------|-------------------------|----------------|--------------------------|
| `batchSize` | `number`                | `100`          | Authors loaded per batch |
| `scope`     | `'referenced' \| 'all'` | `'referenced'` | Which authors to include |

#### `forEachGhostPost(callback, options?): Promise<void>`

Iterate posts as processed Ghost JSON with tags and authors inlined. Read-only — mutations are not saved.

```js
await ctx.forEachGhostPost(async (json, post) => {
    // json: { id, title, slug, tags: [...], authors: [...], ... }
    await ghostApi.posts.add(json);
}, {batchSize: 50});
```

#### `streamPosts(options?): AsyncGenerator<PostContext>`

Async generator that yields posts one at a time. Unlike `forEachPost`, posts are not auto-saved — you control when to persist changes. Ideal for feeding posts into a concurrent task queue.

```js
for await (const post of ctx.streamPosts({batchSize: 200})) {
    const html = post.get('html');
    post.set('html', html.toUpperCase());
    post.save(ctx.db);
}
```

Or with a task queue:

```js
async function* postTasks() {
    for await (const post of ctx.streamPosts()) {
        yield {
            title: post.get('slug'),
            task: async () => {
                // process post concurrently
                post.set('html', transform(post.get('html')));
                post.save(ctx.db);
            }
        };
    }
}

await queue.run(postTasks());
```

#### `streamTags(options?): AsyncGenerator<TagContext>`

Async generator that yields referenced tags by default. Pass `{scope: 'all'}` for every tag. Tags are not auto-saved.

```js
for await (const tag of ctx.streamTags()) {
    console.log(tag.data.slug, tag.data.name);
}
```

#### `streamAuthors(options?): AsyncGenerator<AuthorContext>`

Async generator that yields referenced authors by default. Pass `{scope: 'all'}` for every author. Authors are not auto-saved.

```js
for await (const author of ctx.streamAuthors()) {
    console.log(author.data.slug, author.data.name);
}
```

#### Iteration options

| Option      | Type         | Default | Description                                   |
|-------------|--------------|---------|-----------------------------------------------|
| `batchSize` | `number`     | `100`   | Posts loaded per batch                        |
| `filter`    | `PostFilter` | —       | Filter criteria (see [Filtering](#filtering)) |

Tag and author iteration accepts `batchSize` and `scope` instead of a post filter. The same scope terms apply to find, iteration, streaming, and standalone export methods.

Unfiltered `forEachPost()`, `streamPosts()`, `forEachTag()`, `streamTags()`, `forEachAuthor()`, and `streamAuthors()` use keyset pagination. They retain only the current batch plus the highest database ID present when iteration starts, so memory use stays bounded and rows added later are left for the next iteration.

Supplying a post `filter` with at least one criterion deliberately uses a different strategy: `forEachPost()` and `streamPosts()` snapshot every matching post ID before invoking the first callback or yielding the first post. Matching IDs are staged in SQLite rather than a JavaScript array, preserving iteration membership without migration-sized memory use when callbacks change filtered fields.

Progress is reported via the `progress` event (see [Events](#events)).

### Exporting

#### `prepareForExport(options?): Promise<void>`

Prepare all posts for export. Export methods call this automatically. Calling it directly is useful only when code needs to inspect prepared data before writing. This:

1. Normalizes blank post titles to `(Untitled)`
2. Leaves duplicate-slug report materialization to an explicit getter/method call

The method is idempotent.

| Option      | Type     | Default | Description               |
|-------------|----------|---------|---------------------------|
| `batchSize` | `number` | `200`   | Posts processed per batch |

```js
await ctx.prepareForExport();
```

#### `writeGhostJson(outputDir, options?): Promise<WrittenFile[]>`

Write posts, tags, authors, and junction tables to Ghost JSON files.

| Option            | Type                          | Default   | Description                                                   |
|-------------------|-------------------------------|-----------|---------------------------------------------------------------|
| `batchSize`       | `number`                      | `5000`    | Posts per output file                                         |
| `filename`        | `string`                      | `'posts'` | Base filename (without `.json`)                               |
| `filter`          | `PostFilter`                  | —         | Filter criteria                                               |
| `onWrite`         | `(file: WrittenFile) => void` | —         | Callback after each file is complete                           |

Returns an array of `WrittenFile` objects:

| Field   | Type     | Description                    |
|---------|----------|--------------------------------|
| `path`  | `string` | Absolute path to the file      |
| `name`  | `string` | Filename (e.g. `posts-1.json`) |
| `size`  | `number` | File size in bytes             |
| `posts` | `number` | Number of posts in this file   |

Export preparation is automatic. Consumers own the output directory and removal of previous exports. Core overwrites the requested target filenames but leaves old chunks and differently named exports untouched, including when an export shrinks or its base name changes. Use a fresh directory or remove prior files before exporting; returned descriptors identify files produced by this call. No ownership manifest is created, read, or updated. Each file is written to a temporary path and renamed only when complete. A failure preserves that file's previous target and may leave earlier completed batches in place. Consumers own whole-export staging, publication, cleanup, and recovery; publish a fresh staging directory only after the export succeeds.

```js
const files = await ctx.writeGhostJson('./output/', {
    filename: 'export',
    batchSize: 2000,
    onWrite(f) {
        console.log(`Wrote ${f.name} (${f.posts} posts)`);
    }
});
```

#### `writeGhostCSV(outputDir, options?): Promise<WrittenFile>`

Write one streamed post CSV. It uses the same stored posts and `PostFilter` as `writeGhostJson()`, but does not export standalone authors or tags.

| Option     | Type         | Default   | Description                                  |
|------------|--------------|-----------|----------------------------------------------|
| `filename` | `string`     | `'posts'` | Base filename (without `.csv`)                |
| `filter`   | `PostFilter` | —         | Include only posts matching these criteria   |

```js
const file = await ctx.writeGhostCSV('./output', {
    filename: 'selected-posts',
    filter: {tag: {slug: 'news'}}
});
// file.name === 'selected-posts.csv'
```

The return value is one `WrittenFile` with `path`, `name`, `size`, and `posts`. An empty selection still writes a header-only CSV. Preparation is automatic. Rows are read in bounded database batches and streamed to a temporary file; a completed file replaces the destination. A previous CSV with a different filename remains for the consumer to remove. CSV export creates no ownership metadata and leaves other files untouched.

Columns follow Ghost's post CSV import order: `title`, `html`, `slug`, `custom_excerpt`, `type`, `status`, `visibility`, `featured`, `created_at`, `updated_at`, `published_at`, `feature_image`, `feature_image_alt`, `feature_image_caption`, `meta_title`, `meta_description`, `canonical_url`, `og_image`, `og_title`, `og_description`, `twitter_image`, `twitter_title`, `twitter_description`, `custom_template`, `codeinjection_head`, `codeinjection_foot`, `authors`, `author_emails`, `tags`. The optional `markdown`, `frontmatter`, and `show_title_and_feature_image` columns are omitted. Only stored HTML is exported.

The `authors`, `author_emails`, and `tags` cells contain comma-separated values in relationship order. Author names, corresponding emails, and tag names retain that order. To keep names unambiguous in those lists, the exporter replaces commas in names with spaces, collapses repeated whitespace, and trims them. **The destination Ghost site must already contain the matching authors and tags under these normalized names.** The exporter does not create or verify them.

Nulls become empty cells, dates use ISO timestamps, and booleans are `true` or `false`. `scheduled` and `sent` posts export as `draft` for CSV import; their other fields are unchanged. This conversion does not modify SQLite or JSON output. Quotes, commas, and multiline HTML are CSV-escaped.

#### `writeGhostTagsJson(outputDir, options?): Promise<WrittenFile>`

Export tags as a standalone JSON file. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone tags. Preparation is automatic. Consumers manage previous files; no ownership metadata is created.

#### `writeGhostUsersJson(outputDir, options?): Promise<WrittenFile>`

Export authors/users as a standalone JSON file. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone authors. Preparation is automatic. Consumers manage previous files; no ownership metadata is created.

```js
await ctx.writeGhostTagsJson('./output/', {filename: 'my-tags'});
await ctx.writeGhostUsersJson('./output/', {filename: 'my-users', scope: 'all'});
```

### Filtering

All iteration and export methods accept a `filter` option. Criteria combine with AND logic.

```js
await ctx.forEachPost(async (post) => { /* ... */ }, {
    filter: {
        tag: {slug: 'news'},
        createdAt: {onOrAfter: new Date('2025-01-01')}
    }
});
```

| Filter                                                      | Type     | Description                |
|-------------------------------------------------------------|----------|----------------------------|
| `tag.slug`                                                  | `string` | Posts with this tag slug   |
| `tag.name`                                                  | `string` | Posts with this tag name   |
| `author.slug`                                               | `string` | Posts by this author slug  |
| `author.name`                                               | `string` | Posts by this author name  |
| `author.email`                                              | `string` | Posts by this author email |
| `createdAt.before` / `after` / `onOrBefore` / `onOrAfter`   | `Date`   | Filter by `created_at`     |
| `publishedAt.before` / `after` / `onOrBefore` / `onOrAfter` | `Date`   | Filter by `published_at`   |

Posts with `null` `published_at` (drafts) are excluded by a `publishedAt` filter.

### Events and durable reports

MigrateContext has typed `on`/`off` methods powered by `node:events`.

#### `on(event, listener): this`

Register an event listener. Returns `this` for chaining.

#### `off(event, listener): this`

Remove an event listener.

Events are synchronous and live; they are not replayed after a database reopens. Durable mutations are recorded and committed before their events are emitted. If a listener throws, its error propagates, but the committed database change remains. Register no listeners when events are not needed. The deprecated `emitEvents` option remains for one transition release.

Mutation events carry before and after state. Outcome events that do not change an existing value do not invent those fields.

```js
ctx.on('progress', ({operation, processed, total}) => {
    console.log(`[${operation}] ${processed}/${total}`);
});

ctx.on('slug:renamed', ({oldSlug, newSlug, url}) => {
    console.log(`${oldSlug} -> ${newSlug}: ${url}`);
});
```

| Event | Payload | When it fires |
|-------|---------|---------------|
| `progress` | `{operation, processed, total}` | After each iteration or preparation batch |
| `post:skipped` | `{lookupKey, existingPostId}` | A duplicate lookup key uses the `skip` outcome |
| `post:replaced` | `{lookupKey, postId, previous, current}` | A duplicate lookup key uses the `replace` outcome |
| `field:sanitized` | `{context, slug, field, reason, oldValue, newValue}` | A value is changed to satisfy Ghost's schema |
| `slug:renamed` | `{postId, lookupKey, oldSlug, newSlug, url}` | The final stored slug differs from the requested slug |
| `export:file-written` | `{path, name, size, posts}` | An output file has been completed |

`slug:renamed` is emitted only after suffixing and length enforcement, and never for a skipped duplicate that did not claim a slug. `oldSlug` is the requested slug and `newSlug` is the final persisted slug.

`post:replaced` carries complete detached snapshots. Each snapshot contains databaseId, ghostId, lookupKey, data, and webscrapeData. Original source payloads are excluded. Tags and authors inside `data` are plain values, not live context objects. Full HTML and relationships are included. Mutating a snapshot cannot change the stored post or a later event.

#### `getMigrationReport(): MigrationReport`

Returns the durable migration report from SQLite. Its `summary` counts `post:inserted`, `post:skipped`, `post:replaced`, `field:sanitized`, and `slug:renamed`; `events` contains their identities, compact details, and timestamps. The report survives reopening a persistent database and is cleared by `reset()` or `resetContent: true`.

Replacement report rows contain changed field names and summary data rather than duplicating the live event's complete before/after snapshots. Export and progress events are operational and are not persisted.

---

## PostContext

Represents a mapped post with validated properties, tag/author relationships, and optional scraping data.

### Properties

#### `post.get(prop): any`

Get a property value.

#### `post.set(prop, value): PostContext`

Set a property value. Validates against the schema (type, max length, allowed values). Returns `this` for chaining.

#### `post.remove(prop): PostContext`

Reset a property to its default value (or `null`).

#### `post.save(db): void`

Persist the post and its tag/author relationships to the database.

### Post fields

| Field                   | Type      | Max   | Default    | Notes                                     |
|-------------------------|-----------|-------|------------|-------------------------------------------|
| `title`                 | `string`  | 255   | —          | **Required**                              |
| `slug`                  | `string`  | 191   | —          | **Required**                              |
| `html`                  | `string?` | —     | `null`     | HTML content exported to Ghost            |
| `status`                | `enum`    | —     | `'draft'`  | `published`, `draft`, `scheduled`, `sent` |
| `type`                  | `enum`    | —     | `'post'`   | `post`, `page`                            |
| `visibility`            | `enum`    | —     | `'public'` | `public`, `members`, `paid`               |
| `featured`              | `boolean` | —     | `false`    |                                           |
| `created_at`            | `Date`    | —     | —          | **Required**                              |
| `updated_at`            | `Date?`   | —     | `null`     |                                           |
| `published_at`          | `Date?`   | —     | `null`     |                                           |
| `feature_image`         | `string?` | 2000  | `null`     |                                           |
| `feature_image_alt`     | `string?` | 191   | `null`     |                                           |
| `feature_image_caption` | `string?` | 65535 | `null`     |                                           |
| `custom_excerpt`        | `string?` | 300   | `null`     |                                           |
| `canonical_url`         | `string?` | 2000  | `null`     |                                           |
| `meta_title`            | `string?` | 300   | `null`     |                                           |
| `meta_description`      | `string?` | 500   | `null`     |                                           |
| `og_title`              | `string?` | 300   | `null`     |                                           |
| `og_description`        | `string?` | 500   | `null`     |                                           |
| `og_image`              | `string?` | 2000  | `null`     |                                           |
| `twitter_title`         | `string?` | 300   | `null`     |                                           |
| `twitter_description`   | `string?` | 500   | `null`     |                                           |
| `twitter_image`         | `string?` | 2000  | `null`     |                                           |
| `codeinjection_head`    | `string?` | 65535 | `null`     |                                           |
| `codeinjection_foot`    | `string?` | 65535 | `null`     |                                           |
| `custom_template`       | `string?` | 100   | `null`     |                                           |
| `comment_id`            | `string?` | 50    | `null`     |                                           |
| `plaintext`             | `string?` | —     | `null`     |                                           |

### Tags

Tags have a `sort_order` that is tracked automatically. When tags are added, their position in the list becomes their sort order. The sort order is persisted to the database and included in the exported Ghost JSON as a 1-based integer (`sort_order: 1, 2, 3, ...`).

#### `post.addTag(tag, options?): TagContext | false`

Add a tag by object or `TagContext`. Returns `false` if the slug already exists on this post.

```js
post.addTag({name: 'News', slug: 'news'});

// Insert at a specific position (0-based index)
post.addTag({name: 'Breaking', slug: 'breaking', sortOrder: 0});
```

| Option      | Type     | Required | Description                                      |
|-------------|----------|----------|--------------------------------------------------|
| `name`      | `string` | Yes      | Tag name                                         |
| `slug`      | `string` | Yes      | Tag slug                                         |
| `sortOrder` | `number` | No       | Position to insert at. Appends if out of bounds. |

#### `post.removeTag(slug): void`

Remove a tag by slug.

#### `post.hasTagSlug(slug): boolean` / `post.hasTagName(name): boolean`

Check if the post has a specific tag.

#### `post.setPrimaryTag({name, slug}): void`

Set a tag as primary (moves it to sort order 1). Adds the tag if it doesn't exist.

#### `post.setTagOrder(callback): void`

Reorder tags. The callback receives an array of `TagContext` instances and must return the same instances in the desired order. Access tag properties via `tag.data.slug`, `tag.data.name`, etc.

```js
// Move internal tags to the end
post.setTagOrder((tags) => {
    const regular = tags.filter(t => !t.data.slug.startsWith('hash-'));
    const internal = tags.filter(t => t.data.slug.startsWith('hash-'));
    return [...regular, ...internal];
});
```

### Authors

Authors follow the same ordering model as tags — `sort_order` is tracked automatically, persisted, and exported as a 1-based integer.

#### `post.addAuthor(author, options?): AuthorContext | false`

Add an author by object or `AuthorContext`. Returns `false` if the slug already exists on this post.

```js
post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});

// Insert at a specific position
post.addAuthor({name: 'Bob', slug: 'bob', email: 'bob@example.com', sortOrder: 0});
```

| Option      | Type     | Required | Description                                      |
|-------------|----------|----------|--------------------------------------------------|
| `name`      | `string` | Yes      | Author name                                      |
| `slug`      | `string` | Yes      | Author slug                                      |
| `email`     | `string` | Yes      | Author email                                     |
| `sortOrder` | `number` | No       | Position to insert at. Appends if out of bounds. |

#### `post.removeAuthor(slug): void`

Remove an author by slug.

#### `post.hasAuthorSlug(slug): boolean` / `post.hasAuthorName(name): boolean` / `post.hasAuthorEmail(email): boolean`

Check if the post has a specific author.

#### `post.setPrimaryAuthor({name, slug, email}): void`

Set an author as primary (moves them to sort order 1). Adds the author if they don't exist.

#### `post.setAuthorOrder(callback): void`

Reorder authors. The callback receives an array of `AuthorContext` instances and must return the same instances in the desired order. Access author properties via `author.data.slug`, `author.data.name`, etc.

```js
// Reverse the author order
post.setAuthorOrder((authors) => [...authors].reverse());
```

### Source ownership

Post source/meta fields and accessors have been removed. Original records belong to `context.sources`; provenance links identify their contributions. See the [migration guide](source-records.md).

### Web scrape data

#### `post.webscrapeData: any`

Get or set the raw web scrape response for this post. Stored as a JSON blob in a dedicated `webscrape_data` column on the Posts table. Defaults to `null`.

Retains optional scraped data before processing. The web scraper's integration is deferred: its next API must accept the chosen original URL explicitly, rather than requesting removed post-source accessors.

```js
// Set during scraping (done automatically by scrapePost)
post.webscrapeData = {meta_title: 'Page Title', og_image: 'https://example.com/img.jpg'};

// Read later in the pipeline
const scraped = post.webscrapeData;
if (scraped?.og_image) {
    post.set('feature_image', scraped.og_image);
}
```

### Deduplication

#### `post.lookupKey: string | null`

Get or set the lookup key. When a post with a matching lookup key already exists in the database, `save()` applies the post's `onDuplicate` policy.

```js
const post = await ctx.addPost({lookupKey: 'https://example.com/post-url'});
// ... set fields ...
await post.save(ctx.db);

// Second save with same key is a no-op
const dupe = await ctx.addPost({lookupKey: 'https://example.com/post-url'});
await dupe.save(ctx.db); // skipped
```

#### `post.onDuplicate: 'skip' | 'replace' | DuplicatePostResolver`

Controls what `save()` does when `lookupKey` matches a stored post:

- `skip` (default) leaves the stored post unchanged. This preserves the original retry-safe behavior.
- `replace` overwrites the stored post with the newly transformed post while preserving its database ID and Ghost ID. Mapped scalar fields, scraping data, tags, and authors are replaced.
- A resolver receives the stored and incoming `PostContext` objects and returns `skip` or `replace`. Resolvers are synchronous and can compare mapped dates or other mapped fields. Resolve original source revisions during ingestion before mapping.

Set a default for posts created by a context, or override it for one post:

```js
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    onDuplicate: 'skip'
});

const post = await ctx.addPost({lookupKey: 'original-1', onDuplicate: 'replace'});
```

The resolver must return `skip` or `replace`; any other result throws an `InternalServerError` without changing the stored row.

### Field sanitization

Source data routinely carries values Ghost will not accept — a title over 255 characters, a tag name over 191, an email that is not an address. Rather than failing the migration, each context normalizes its own data against [Ghost's schema](https://github.com/TryGhost/Ghost/blob/main/ghost/core/core/server/data/schema/schema.js) before anything is written.

The numeric limits are generated from an exact commit of that schema rather than repeated by hand. `GHOST_FIELD_LIMITS`, `GHOST_SCHEMA_VERSION`, and `GHOST_SCHEMA_SOURCE` are exported for adapters that need the same profile. When Ghost's schema changes, update the checked-in profile from the repository root:

```bash
pnpm --filter @tryghost/mg-context sync:ghost-schema
```

The generator prefers a field's `validations.isLength.max` over its storage `maxlength`. This is why a post title is limited to 255 even though its database column can hold 2000 characters, and why `feature_image_alt` is 191. The generated source URL is pinned to the Ghost commit used, so reviews can verify every change against the authoritative schema.

Enforcement lives in one place per context: `save()` calls `sanitize()`, which applies every rule and records what changed. That covers values set with `set()` as well as values handed to a constructor or loaded from a row, which bypass `set()` entirely.

The rules:

| Applies to | Rule |
|------------|------|
| Every string field | Surrounding whitespace is stripped |
| Every string field | Values over the field's maximum are truncated; a slug left with a dangling `-` has it removed |
| Post `title` | A missing or whitespace-only title becomes `(Untitled)`; export preparation also repairs rows already stored in SQLite |
| URL fields | An over-long URL is dropped to `null` rather than truncated — a cut URL is a broken link, not a shorter one. Covers `feature_image`, `og_image`, `twitter_image` and `canonical_url` on posts and tags, and `website`, `profile_image` and `cover_image` on authors |
| Post slugs | A deduplicating suffix (`-2`, `-3`) trims the base rather than overflowing the 191 character limit |
| Tag `name` | A leading comma is stripped — Ghost validates names with `matches: /^([^,]\|$)/` |
| Author `email` | An address Ghost would reject is replaced with a derived placeholder at `example.com` (see below) |
| Author `website` | Anything that is not a URL is dropped to `null`, on top of the length rule above |

An invalid email cannot be trimmed into shape, so it is replaced with a recognisable stand-in: the address is slugified, minus the bogus tail after its last dot, and given the reserved `example.com` domain. `hello@world.com123` becomes `hello-world@example.com`. When there is nothing usable to slugify, it falls back to the author's slug, then their name, then `author`. The local part is capped at 50 characters, which is Ghost's limit.

#### `sanitizedFields: SanitizedField[]`

Getter materializing persisted sanitization diagnostics for the current mapped result:

```js
for (const entry of ctx.sanitizedFields) {
    console.log(`[${entry.reason}] ${entry.context} ${entry.slug} — ${entry.field}: ${entry.newValue}`);
}
```

| Field      | Type     | Description                                                                       |
|------------|----------|-----------------------------------------------------------------------------------|
| `context`  | `string` | `PostContext`, `TagContext` or `AuthorContext`                                     |
| `slug`     | `string` | Slug of the post, tag or author, for locating it afterwards                        |
| `field`    | `string` | The field that changed                                                             |
| `reason`   | `string` | `truncated`, `trimmed` or `replaced`                                               |
| `oldValue` | `string` | The value before sanitization                                                      |
| `newValue` | `string \| null` | The value that was stored                                                  |

This getter reads persisted `field:sanitized` diagnostics into an array on request. They survive reopening the database and are cleared with mapped content; use `streamDiagnostics()` for bounded reads.

### Slug deduplication

#### `deduplicateSlugs(): Promise<DuplicateSlugEntry[]>`

Ghost requires unique slugs. Slugs are allocated when posts are saved: the first stored post keeps the requested slug, and later collisions receive `-2`, `-3`, and so on. This method rebuilds the resulting duplicate report; it does not defer slug allocation until export.

The report is read from the database on request. Export preparation does not collect this array; use streaming diagnostics when the full report would be too large.

Renaming happens at insert time, and the slug a post originally wanted is stored alongside it. The results are rebuilt from the database, so resuming against an existing `dbPath` still reports every rename, including those made on an earlier run. A slug changed after its post was inserted is not a duplicate and is not reported.

After exporting, access the results via the `duplicateSlugs` getter to log renamed slugs for redirect handling:

```js
await ctx.writeGhostJson('./output');

for (const entry of ctx.duplicateSlugs) {
    const label = entry.oldSlug === entry.newSlug ? 'kept' : 'renamed';
    console.log(`[${label}] ${entry.newSlug}  ${entry.url}`);
}
```

#### `duplicateSlugs: DuplicateSlugEntry[]`

Getter that rebuilds the duplicate-slug report from persisted allocation diagnostics. Results are grouped by original slug. The first entry in each group is the retained post (`oldSlug === newSlug`), followed by the renamed ones.

| Field     | Type     | Description                                                       |
|-----------|----------|-------------------------------------------------------------------|
| `oldSlug` | `string` | The original (duplicate) slug                                     |
| `newSlug` | `string` | The final slug — same as `oldSlug` for the retained post          |
| `url`     | `string` | Mapped canonical_url, or an empty string; resolve originals separately through provenance |

Entries follow database insertion order. If a suffix like `-2` already belongs to a real post, allocation skips to `-3`, and so on. Adapters that can encounter several source revisions should use a duplicate resolver or preselect the revision they want before saving.

See [examples/deduplicate-slugs.ts](../examples/deduplicate-slugs.ts) for a complete example.

---

## TagContext

Represents a tag with validated properties.

### Constructor

```js
new TagContext({name: 'News', slug: 'news'})
// or
new TagContext({initialData: {name: 'News', slug: 'news'}})
```

### Methods

- `tag.get(prop): any`
- `tag.set(prop, value): TagContext`
- `tag.remove(prop): TagContext`
- `tag.save(db): void`

### Tag fields

| Field                 | Type      | Max   | Notes        |
|-----------------------|-----------|-------|--------------|
| `name`                | `string`  | 255   | **Required** |
| `slug`                | `string`  | 191   | **Required** |
| `description`         | `string?` | 500   |              |
| `feature_image`       | `string?` | 2000  |              |
| `og_image`            | `string?` | 2000  |              |
| `og_title`            | `string?` | 300   |              |
| `og_description`      | `string?` | 500   |              |
| `twitter_image`       | `string?` | 2000  |              |
| `twitter_title`       | `string?` | 300   |              |
| `twitter_description` | `string?` | 500   |              |
| `meta_title`          | `string?` | 300   |              |
| `meta_description`    | `string?` | 500   |              |
| `codeinjection_head`  | `string?` | 65535 |              |
| `codeinjection_foot`  | `string?` | 65535 |              |
| `canonical_url`       | `string?` | 2000  |              |

---

## AuthorContext

Represents an author with validated properties.

### Constructor

```js
new AuthorContext({name: 'Alice', slug: 'alice', email: 'alice@example.com'})
```

### Methods

- `author.get(prop): any`
- `author.set(prop, value): AuthorContext`
- `author.remove(prop): AuthorContext`
- `author.save(db): void`

### Author fields

| Field              | Type      | Max  | Notes                                                        |
|--------------------|-----------|------|--------------------------------------------------------------|
| `name`             | `string`  | 191  | **Required**                                                 |
| `slug`             | `string`  | 191  | **Required**                                                 |
| `email`            | `string`  | 191  | **Required**, validated                                      |
| `profile_image`    | `string?` | 2000 |                                                              |
| `cover_image`      | `string?` | 2000 |                                                              |
| `bio`              | `string?` | 250  |                                                              |
| `website`          | `string?` | 2000 |                                                              |
| `location`         | `string?` | 150  |                                                              |
| `facebook`         | `string?` | 2000 |                                                              |
| `twitter`          | `string?` | 2000 |                                                              |
| `meta_title`       | `string?` | 300  |                                                              |
| `meta_description` | `string?` | 500  |                                                              |
| `roles`            | `enum[]`  | —    | Defaults to `['Contributor']`. Each entry one of `Contributor`, `Author`, `Editor`, `Administrator` |


## Source records

`context.sources` requires an initialized context. Core stores one completed dataset and private staging generations; callers decide when to reuse or replace data. There is no identity comparison or public snapshot API.

| Member | Behavior |
| --- | --- |
| `hasCompletedIngestion: boolean` | True even when completed ingestion contains zero records |
| `currentIngestion: IngestionInfo | null` | ID, detached opaque metadata, start time, and completion time |
| `count(kind?): number` | Count current records, optionally within one kind |
| `get(kind, key): SourceRecord | null` | Indexed canonical lookup |
| `getById(id): SourceRecord | null` | Lookup restricted to completed data |
| `records({kind?, batchSize?})` | Async iterator, default batch size 25 |
| `ingest({replace?, metadata?}, callback)` | Stage records, then atomically replace completed data and clear mapped content |
| `link(recordId, {type, id})` | Idempotent many-to-many link; type is post, tag, or author |
| `unlink(recordId, {type, id})` | Remove one provenance link |
| `recordsFor({type, id}, {batchSize?})` | Iterate contributing source records |
| `entitiesFor(recordId, {batchSize?})` | Iterate mapped entity references |

`SourceRecordInput` contains `kind: string`, optional nullable `key: string`, `content: string`, `format: string`, and optional JSON-object `metadata`. Kind/format/key must be nonblank when supplied; content may be empty. Core never parses the payload. Returned `SourceRecord` adds an internal ID and detached metadata. Internal IDs are not stable destination IDs.

The staging callback receives `SourceIngestion`:

- `put(record, {onDuplicate?})` writes one record and returns its canonical stored representation.
- `write(iterable, {onDuplicate?, batchSize?, maxBatchBytes?})` consumes synchronous or asynchronous input and returns its submitted record count. Defaults are 250 records and 4 MiB per transaction; oversized records are written alone. Counts include explicitly kept/replaced duplicates.
- `onDuplicate` is `error` by default, or explicitly `keep`/`replace`. Core does not choose revisions or timestamps.
- `get`, `getById`, `count`, and `records` read this staging generation only.
- `reconcile(record, {choose?, reportIdentical?})` puts a record whose key may already be staged and returns `{record, previous, replaced}`. `choose(existing, incoming)` returns `keep` or `replace`; the default keeps the earlier record. When a duplicate's content differs, or always with `reportIdentical: true`, it records a `source:conflict` diagnostic against the stored record. The details are the incoming metadata plus `kind`, `key`, `reason`, and the `retained` record's metadata. Unkeyed records are always inserted.
- `recordDiagnostic(type, details?, sourceRecordId?)` persists ingestion diagnostics tied to this attempt.

Await writes before returning. Completed data has no write API. Replacement requires `replace: true`; failed ingestion preserves previous originals and mapped data, deletes staged payloads, and retains attempt diagnostics. Interrupted staging is discarded on the next attempt. Public mapped writes cannot overlap ingestion. One migration owner writes each database.

Provenance accepts existing mapped entities and completed originals. Entities may have no originals; one original may have multiple outputs, and one output multiple contributors. There is no primary-source role or alias index.

## Mapping utilities

Helpers shared by source adapters. Source-specific parsing and mapping stay in the adapters.

#### `ghostId(namespace, site, kind, key): string`

A deterministic 24-character hex ID: the first 24 characters of the SHA-256 of `JSON.stringify([namespace, site, kind, key])`. Use a namespace that names the adapter and its ID scheme version, such as `mg-wp-xml:1`, so the same source item keeps its Ghost ID across runs.

#### `RecordDataError`

An `Error` subclass for known problems with one source record. `mapRecords()` skips and reports it.

#### `WARNING_EVENT_TYPES: readonly string[]`

The frozen list of diagnostic types counted by `countWarnings()`: `source:conflict`, `operation:warning`, `field:sanitized`, `slug:renamed`, and `record:skipped`.

#### `MappingState`

`new MappingState(context, name)` creates disk-backed scratch state for one mapping run in SQLite temp tables. Creating a state clears earlier state with the same name; states with different names are independent. Adapters may subclass it to add source-specific lookups.

| Member | Behavior |
| --- | --- |
| `get(namespace, key)` / `set(namespace, key, value)` | JSON key-value store |
| `bind(kind, key, id)` / `getBinding(kind, key)` | Remember the mapped entity database ID a source key produced |
| `index(kind, key, recordId)` | Index a completed source record under a lookup key; one key may index several records |
| `find(kind, key, limit = 2)` | Indexed records, oldest first. Two results are enough to detect an ambiguous lookup |
| `reserveSlug(kind, slug, ownerId)` | Hold an author or tag slug for one owner, such as a matched Ghost user |
| `uniqueSlug(kind, desired, ownerId?)` | An author or tag slug not used by a saved row or another owner's reservation |

`uniqueSlug()` clamps the slug to Ghost's length limit, falls back to the kind name for a blank slug, and appends `-2`, `-3`, and so on. A changed slug records a `slug:renamed` diagnostic with `entityKind`, `oldSlug`, and `newSlug`. Post slugs are de-duplicated by `post.save()`; saving a tag or author instead reuses any row with the same slug, so distinct source entities that share a slug need `uniqueSlug()` first.

## Streaming output and diagnostics

`writeGhostJsonStream(outputDir, options?)` is an async generator of `WrittenFile`. Options match JSON export: batchSize defaults to 5000, filename to posts, with optional filters and onWrite. Both JSON APIs accept the existing nonempty filename bases without path separators and strip an optional `.json` extension, including Unicode and punctuation in base names. Events/callbacks run after each file completes, before later files are written. Both JSON APIs share batching and serialization. Consumers manage previous output files. No ownership manifest is created or consulted, and old chunks are retained. The generator yields each completed descriptor directly without a descriptor journal. Per-file temporary writes preserve incomplete targets; earlier completed files remain after a later failure. Consumers own whole-export publication and recovery, including discarding a partially completed staging directory. Core never scans old backups or journals.

`streamDiagnostics({phase?, ingestionId?, batchSize?})` streams report entries; batchSize defaults to 25. Each entry includes phase (ingestion/mapping), nullable ingestionId/sourceRecordId, type, details, timestamps, and existing post references. `recordDiagnostic(type, details?, sourceRecordId?)` writes mapping diagnostics; source references must name completed records.

`writeMigrationReport(path, summary?)` atomically writes the requested JSON path, merging supplied summary fields with diagnostic counts and streaming events. Reports are not automatically placed or uploaded by core.

`getMigrationReport()`, `sanitizedFields`, and `duplicateSlugs` still explicitly materialize arrays. Authors and tags reuse indexed database rows without application-level caches. Transaction events are queued in SQLite until commit; rollback discards them, and listener failure after commit does not roll back committed content.
