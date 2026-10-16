# API reference

Complete reference for `@tryghost/mg-context`. Start with the package [README](../README.md) for the normal ingest, transform, and export workflow.

- [MigrateContext](#migratecontext)
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
| `contentIdentity`    | `ContentIdentity`                     | —             | Required for persistent resume; identifies the raw source snapshot |
| `rereadSource`       | `boolean`                             | `false`       | Clear staged content so the adapter can read the export again |
| `onDuplicate`        | `'skip' \| 'replace' \| resolver`     | `'skip'`      | Default lookup-key duplicate policy                       |
| `ephemeral`          | `boolean`                             | —             | Deprecated compatibility alias for memory storage         |
| `emitEvents`         | `boolean`                             | `true`        | Deprecated; omit listeners to opt out naturally           |
| `warnOnLookupKeyDuplicate` | `boolean`                     | —             | Deprecated; duplicate outcomes are never logged directly  |

```js
// Managed temporary on-disk database (default)
const ctx = new MigrateContext();

// Persistent and resumable
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    contentIdentity: {
        source: 'wordpress-example-com',
        revision: sourceFileSha256
    }
});

// Rebuild stored content while leaving separately managed asset caches alone
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    rereadSource: true
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

Schema version 4 is current. `init()` transactionally migrates version 2 and 3 databases, marks new databases with the current version, and reopens databases already at that version. Existing mapped rows without raw source content remain readable, but must be reread before they can be saved under the current persistent-post requirements. It rejects unversioned, unsupported older, and newer databases.

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

The returned object contains `posts`, `pages`, `users`, `tags`, `userAssociations`, `tagAssociations`, and `links`. Authors are reported as users because that is how they appear in the Ghost import. Stored source identity metadata does not count as content.

#### `reset(): void`

Atomically removes every post, tag, author, relationship, and link mapping and clears the related in-memory caches and reports. It resets row ID sequences but keeps the SQLite database file open; it does not remove the database, its WAL/SHM files, downloaded assets, or an asset scraper's separate database.

The stored source identity is cleared with the content it describes.

```js
if (ctx.hasContent()) {
    ctx.reset();
}
```

Objects loaded before `reset()` should be discarded because their database IDs no longer refer to stored rows.

#### Resume, refresh, and content identity

On a persistent resume, `init()` leaves stored mapped posts unchanged. The adapter can check `hasContent()` and skip source ingestion when content is present. Mapping happens when the adapter ingests new records, not on resume. To apply changes to the mapper, set `rereadSource: true` and ingest the original source again. This clears mg-context content, reports, and source identity before ingestion; it does not touch separately managed asset files or databases.

Persistent `resume` requires `contentIdentity`, including for a newly created database. There is no unsafe resume option. Each field has a distinct purpose:

| Field | Meaning | Example |
| --- | --- | --- |
| `source` | Any stable, nonblank identifier for the site, export, or collection. It need not be a path and is not a per-post `lookupKey`. | `'wordpress-example-com'` |
| `revision` | A stable revision of the source content. Change it when the source changes; hash file bytes when the source has no revision ID. | `sourceFileSha256` |
| `options` | Optional, JSON-compatible settings that change source selection or raw text retained. Mapping-only settings do not belong here. | `{includeDrafts: true}` |

For a single XML file, calculate `sourceFileSha256` with a streaming SHA-256 hash:

```js
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';

const hash = createHash('sha256');
for await (const chunk of createReadStream('./site.xml')) {
    hash.update(chunk);
}
const sourceFileSha256 = hash.digest('hex');
```

For multiple files, hash selected file names and contents in a deterministic order. Avoid `Date.now()` or another per-run value. Do not put transformation settings such as feature-image handling or shortcode conversion in the identity; explicitly reread the source when those settings change. Options must contain only plain JSON values, not `undefined`, functions, `Date` objects, or cycles. Object key order does not matter, but array order does. Avoid secrets in identity fields; include a digest if a secret affects source selection.

mg-context hashes the source identity. A changed identity rejects a populated resume database and requires `rereadSource: true` to rebuild it. Ghost schema and mapper changes do not alter this identity; callers must explicitly reread when they want those changes reflected in stored posts.

```js
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    rereadSource: cliOptions.rereadSource,
    contentIdentity: {
        source: 'wordpress-example-com',
        revision: sourceFileSha256,
        options: {includeDrafts}
    }
});
await ctx.init();
```

`init()` rejects a populated resume database with a missing or different source identity. Saving a persistent post requires raw source content and a lookup key. Rereading clears context content but not separately managed asset caches. A one-shot temporary or memory migration does not need an identity. For a live source without a revision, treat the first fetch as a frozen snapshot and use the explicit reread flag when a newer snapshot is wanted.

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

// With original source text and related metadata (not exported)
const post = await ctx.addPost({
    lookupKey: '123',
    sourceContent: '<item>...</item>',
    sourceMeta: {originalId: 123}
});
```

When called with a `PostContext` instance, saves it immediately instead.

Persistent posts require both `sourceContent` and `lookupKey`. `sourceContent` is the unmodified text of one source record, not mapped Ghost HTML. The deprecated `source` object option remains an alias for `sourceMeta` during the transition release.

#### `addSourcePost(mapPost): Promise<PostContext>`

Create, map, and save one source record using the supplied callback. Set the source `lookupKey` and `content` in the callback before it returns; `meta` is optional and defaults to `{}`. Set `post.onDuplicate` in the callback to override the context's duplicate policy for this post. The callback runs during ingestion only; a later resume uses the stored mapped post. Missing required source fields fail before saving.

```js
await ctx.addSourcePost((post) => {
    post.setSource('lookupKey', item.id);
    post.setSource('content', item.rawXml);
    post.setSource('meta', {url: item.url});
    const source = parseSourceItem(post.sourceContent);
    post.set('title', source.title);
    post.set('html', source.html);
});
```

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
| `sourceAttr`  | `{key, value}` | Match a key/value pair in the post's source data |
| `tagSlug`     | `string`       | Find posts with this tag slug                    |
| `tagName`     | `string`       | Find posts with this tag name                    |
| `authorSlug`  | `string`       | Find posts by this author slug                   |
| `authorName`  | `string`       | Find posts by this author name                   |
| `authorEmail` | `string`       | Find posts by this author email                  |

```js
const posts = await ctx.findPosts({tagSlug: 'news'});
const posts = await ctx.findPosts({authorEmail: 'alice@example.com'});
const posts = await ctx.findPosts({sourceAttr: {key: 'url', value: 'https://example.com/post'}});
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

Supplying a post `filter` with at least one criterion deliberately uses a different strategy: `forEachPost()` and `streamPosts()` snapshot every matching post ID before invoking the first callback or yielding the first post. This costs O(number of matches) memory, but it prevents a callback from skipping or duplicating posts when it saves changes to a date, tag, or author used by the filter.

Progress is reported via the `progress` event (see [Events](#events)).

### Exporting

#### `prepareForExport(options?): Promise<void>`

Prepare all posts for export. Export methods call this automatically. Calling it directly is useful only when code needs to inspect prepared data before writing. This:

1. Rebuilds the duplicate-slug report from the requested and final stored slugs
2. Normalizes blank post titles to `(Untitled)`

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
| `onWrite`         | `(file: WrittenFile) => void` | —         | Callback after each file is written                           |
| `replaceExisting` | `boolean`                     | —         | Deprecated compatibility option; cleanup is automatic         |

Returns an array of `WrittenFile` objects:

| Field   | Type     | Description                    |
|---------|----------|--------------------------------|
| `path`  | `string` | Absolute path to the file      |
| `name`  | `string` | Filename (e.g. `posts-1.json`) |
| `size`  | `number` | File size in bytes             |
| `posts` | `number` | Number of posts in this file   |

Export preparation is automatic. mg-context stores `.mg-context-export-manifest.json` beside the output and, after a later export succeeds, removes only obsolete files recorded for the same export. Files it does not own are untouched. The manifest is replaced only after output generation succeeds, so an interrupted export does not turn a partial file set into the recorded completed set.

```js
const files = await ctx.writeGhostJson('./output/', {
    filename: 'export',
    batchSize: 2000,
    onWrite(f) {
        console.log(`Wrote ${f.name} (${f.posts} posts)`);
    }
});
```

#### `writeGhostTagsJson(outputDir, options?): Promise<WrittenFile>`

Export tags as a standalone JSON file. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone tags. Preparation and manifest updates are automatic.

#### `writeGhostUsersJson(outputDir, options?): Promise<WrittenFile>`

Export authors/users as a standalone JSON file. The default scope is `referenced`; pass `{scope: 'all'}` to include standalone authors. Preparation and manifest updates are automatic.

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

`post:replaced` carries complete detached snapshots. Each snapshot contains `databaseId`, `ghostId`, `lookupKey`, `data`, `sourceContent`, `sourceMeta`, `meta`, and `webscrapeData`. Tags and authors inside `data` are plain values, not live context objects. Full HTML and relationships are included. Mutating a snapshot cannot change the stored post or a later event.

#### `getMigrationReport(): MigrationReport`

Returns the durable migration report from SQLite. Its `summary` counts `post:inserted`, `post:skipped`, `post:replaced`, `field:sanitized`, and `slug:renamed`; `events` contains their identities, compact details, and timestamps. The report survives reopening a persistent database and is cleared by `reset()` or `rereadSource: true`.

Replacement report rows contain changed field names and summary data rather than duplicating the live event's complete before/after snapshots. Export and progress events are operational and are not persisted.

---

## PostContext

Represents a single post with validated properties, tag/author relationships, and source metadata.

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

### Source & metadata

#### `post.setSource(field, value): PostContext`

Set a migration-only source field without adding it to the Ghost export data. `lookupKey` must be a nonblank string, `content` must be a string (an empty string is allowed), and `meta` must be an object. Invalid values fail immediately. For `addSourcePost()`, missing `lookupKey` or `content` fails after its callback completes, before the post is saved.

```js
post.setSource('lookupKey', item.id);
post.setSource('content', item.rawXml);
post.setSource('meta', {url: item.url}); // optional
```

#### `post.sourceContent`

The original per-post source text, or `null` for older or temporary posts that did not provide it. Persistent posts must provide it. A resume retains the existing mapped content; it does not rerun the mapper.

#### `post.sourceMeta`

Related source data stored as JSON, such as the original URL or ID. The deprecated `post.source` getter aliases this object for one transition release.

#### `post.getSourceValue(key): any`

Get a single value from `sourceMeta` (kept for web-scraper compatibility).

#### `post.meta`

Access the metadata object.

#### `post.setMeta(value): void`

Replace the metadata object.

#### `post.getMetaValue(key): any`

Get a single metadata value.

### Web scrape data

#### `post.webscrapeData: any`

Get or set the raw web scrape response for this post. Stored as a JSON blob in a dedicated `webscrape_data` column on the Posts table. Defaults to `null`.

This is set automatically by [mg-webscraper](../../mg-webscraper)'s `scrapePost` method, preserving the raw scraped response before any post-processing. Use it to access or reprocess scraped metadata in later pipeline steps without re-scraping.

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
- `replace` overwrites the stored post with the newly transformed post while preserving its database ID and Ghost ID. Scalar fields, source metadata, post metadata, tags, and authors are replaced.
- A resolver receives the stored and incoming `PostContext` objects and returns `skip` or `replace`. Resolvers are synchronous and can compare dates or other source-specific metadata without requiring a pre-indexing pass.

Set a default for posts created by a context, or override it for one post:

```js
const ctx = new MigrateContext({
    dbPath: './migration.sqlite',
    contentIdentity: {source: 'example.xml', revision: sourceFileSha256},
    onDuplicate: 'replace'
});

const post = await ctx.addPost({
    lookupKey: 'https://example.com/post-url',
    onDuplicate: 'skip' // optional per-post override
});
```

Use `replace` only when the rerun supplies a complete post. It intentionally replaces tags and authors as well as scalar content; it does not merge missing values from the stored row.

For example, an adapter that can encounter multiple source revisions in any order can keep the newest one:

```js
const newestRevisionWins = (existing, incoming) => {
    const existingUpdatedAt = existing.get('updated_at');
    const incomingUpdatedAt = incoming.get('updated_at');

    if (incomingUpdatedAt && (!existingUpdatedAt || incomingUpdatedAt > existingUpdatedAt)) {
        return 'replace';
    }
    return 'skip';
};

const ctx = new MigrateContext({onDuplicate: newestRevisionWins});
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

Getter listing every value changed during this run, so nothing is lost silently:

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

This getter is collected in memory as entities are saved, so it covers the current run only. The durable migration report retains compact `field:sanitized` entries across persistent database resumptions.

### Slug deduplication

#### `deduplicateSlugs(): Promise<DuplicateSlugEntry[]>`

Ghost requires unique slugs. Slugs are allocated when posts are saved: the first stored post keeps the requested slug, and later collisions receive `-2`, `-3`, and so on. This method rebuilds the resulting duplicate report; it does not defer slug allocation until export.

Called automatically by export methods through `prepareForExport()`, so you typically don't need to call it directly. It only runs once — subsequent calls reuse the cached result.

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

Getter that returns the results of the most recent deduplication. Results are grouped by original slug. The first entry in each group is the retained post (`oldSlug === newSlug`), followed by the renamed ones.

| Field     | Type     | Description                                                       |
|-----------|----------|-------------------------------------------------------------------|
| `oldSlug` | `string` | The original (duplicate) slug                                     |
| `newSlug` | `string` | The final slug — same as `oldSlug` for the retained post          |
| `url`     | `string` | Original URL from `sourceMeta.url` or `canonical_url` (empty if none) |

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
