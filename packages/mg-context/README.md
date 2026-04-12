# Migrate Context

A SQLite-backed data store for building Ghost import files. Provides a validated, typed interface for posts, tags, and authors with batched iteration for large migrations.

Data is persisted to SQLite (in-memory by default), so migrations with tens of thousands of posts don't require excessive memory. Content is validated against Ghost's schema on write, and HTML is converted to Lexical or Mobiledoc during an explicit preparation step before export.

## Install

```bash
npm install @tryghost/mg-context --save
# or
pnpm add @tryghost/mg-context
```

## Quick start

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext();
await context.init();

// Add a few posts
for (let i = 1; i <= 3; i++) {
    const post = await context.addPost();
    post.set('title', `Post ${i}`);
    post.set('slug', `post-${i}`);
    post.set('status', 'published');
    post.set('created_at', new Date(`2025-01-${10 + i}T10:00:00Z`));
    post.set('html', '<p>Hello world</p>');
    post.addTag({name: 'News', slug: 'news'});
    post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
    await post.save(context.db);
}

// Update every post — find-replace content and add a tag
await context.forEachPost(async (post) => {
    const html = post.get('html');
    post.set('html', html.replace('Hello world', 'Lorem ipsum'));
    post.addTag({name: 'Updated', slug: 'updated'});
});

// Prepare for export (deduplicate slugs, convert HTML to Lexical)
await context.prepareForExport();

await context.writeGhostJson('./output/');
await context.close();
```

See the [examples/](examples/) directory for complete runnable scripts, including bulk generation and iteration patterns.

## Architecture

```
MigrateContext
 └─ PostContext
     ├─ TagContext
     └─ AuthorContext
```

`MigrateContext` manages the database and provides methods for adding, finding, iterating, and exporting posts. Each post holds references to its tags and authors. All data is stored in SQLite with JSON columns for flexible schema storage and indexed columns for fast lookups.

---

# API Reference

## MigrateContext

The top-level class that manages the database and all entity operations.

### Constructor

```js
new MigrateContext(options?)
```

| Option                     | Type                                 | Default             | Description                                  |
|----------------------------|--------------------------------------|---------------------|----------------------------------------------|
| `contentFormat`            | `'lexical' \| 'mobiledoc' \| 'html'` | `'lexical'`         | Target format for HTML conversion on export  |
| `dbPath`                   | `string`                             | —                   | Path to a SQLite file for persistent storage |
| `ephemeral`                | `boolean`                            | `true` if no dbPath | Use in-memory database                       |
| `emitEvents`               | `boolean`                            | `true`              | Emit progress events (see [Events](#events)) |
| `warnOnLookupKeyDuplicate` | `boolean`                            | `false`             | Log when a duplicate lookupKey is skipped    |

```js
// In-memory (default)
const ctx = new MigrateContext();

// Persistent file-based
const ctx = new MigrateContext({dbPath: './migration.sqlite'});

// Mobiledoc output instead of Lexical
const ctx = new MigrateContext({contentFormat: 'mobiledoc'});

// Server mode — disable events for zero overhead
const ctx = new MigrateContext({emitEvents: false});
```

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

// With source metadata (preserved but not exported)
const post = await ctx.addPost({source: {originalId: 123}});
```

When called with a `PostContext` instance, saves it immediately instead.

#### `addPost(postContext): Promise<PostContext>`

```js
const post = new PostContext({contentFormat: 'html'});
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

Designed to be used as a lookup function with [mg-linkfixer](../mg-linkfixer)'s `fixPost`:

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

#### `findTags(options): Promise<TagContext[] | null>`

Find tags by `slug` or `name`.

#### `findAuthors(options): Promise<AuthorContext[] | null>`

Find authors by `slug`, `name`, or `email`.

#### `getAllPosts(): Promise<PostContext[]>`

Load all posts. Use `forEachPost` for large datasets to avoid loading everything into memory.

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

Iterate all tags that are referenced by at least one post, in batches. Each tag is automatically saved after the callback.

```js
await ctx.forEachTag(async (tag) => {
    tag.set('description', `Articles about ${tag.data.name}`);
});
```

| Option      | Type     | Default | Description            |
|-------------|----------|---------|------------------------|
| `batchSize` | `number` | `100`   | Tags loaded per batch |

#### `forEachAuthor(callback, options?): Promise<void>`

Iterate all authors that are referenced by at least one post, in batches. Each author is automatically saved after the callback.

```js
await ctx.forEachAuthor(async (author) => {
    author.set('bio', 'Updated bio');
});
```

| Option      | Type     | Default | Description              |
|-------------|----------|---------|--------------------------|
| `batchSize` | `number` | `100`   | Authors loaded per batch |

#### `forEachGhostPost(callback, options?): Promise<void>`

Iterate posts as processed Ghost JSON with tags and authors inlined. Read-only — mutations are not saved.

```js
await ctx.forEachGhostPost(async (json, post) => {
    // json: { id, title, slug, tags: [...], authors: [...], ... }
    await ghostApi.posts.add(json);
}, {batchSize: 50});
```

#### Iteration options

| Option      | Type         | Default | Description                                   |
|-------------|--------------|---------|-----------------------------------------------|
| `batchSize` | `number`     | `100`   | Posts loaded per batch                        |
| `filter`    | `PostFilter` | —       | Filter criteria (see [Filtering](#filtering)) |

Progress is reported via the `progress` event (see [Events](#events)).

### Exporting

#### `prepareForExport(options?): Promise<void>`

Prepare all posts for export. Must be called before `writeGhostJson()` or `forEachGhostPost()`. This:

1. Deduplicates slugs (calls `deduplicateSlugs()` internally)
2. Converts HTML to Lexical or Mobiledoc for all posts that need it

The method is idempotent — posts that already have converted content are skipped. Call it again after modifying posts via `forEachPost()` to re-convert changed content.

| Option      | Type     | Default | Description               |
|-------------|----------|---------|---------------------------|
| `batchSize` | `number` | `200`   | Posts processed per batch |

```js
await ctx.prepareForExport();
```

#### `writeGhostJson(outputDir, options?): Promise<WrittenFile[]>`

Write posts, tags, authors, and junction tables to Ghost JSON files.

| Option      | Type                          | Default   | Description                         |
|-------------|-------------------------------|-----------|-------------------------------------|
| `batchSize` | `number`                      | `5000`    | Posts per output file               |
| `filename`  | `string`                      | `'posts'` | Base filename (without `.json`)     |
| `filter`    | `PostFilter`                  | —         | Filter criteria                     |
| `onWrite`   | `(file: WrittenFile) => void` | —         | Callback after each file is written |

Returns an array of `WrittenFile` objects:

| Field   | Type     | Description                    |
|---------|----------|--------------------------------|
| `path`  | `string` | Absolute path to the file      |
| `name`  | `string` | Filename (e.g. `posts-1.json`) |
| `size`  | `number` | File size in bytes             |
| `posts` | `number` | Number of posts in this file   |

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

Export tags as a standalone JSON file. Only tags referenced by at least one post are included.

#### `writeGhostUsersJson(outputDir, options?): Promise<WrittenFile>`

Export authors/users as a standalone JSON file. Only authors referenced by at least one post are included.

```js
await ctx.writeGhostTagsJson('./output/', {filename: 'my-tags'});
await ctx.writeGhostUsersJson('./output/', {filename: 'my-users'});
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

### Events

MigrateContext emits events via `on`/`off`, powered by `node:events`. This lets you set up a single listener for progress across all operations instead of passing callbacks to each method.

#### `on(event, listener): this`

Register an event listener. Returns `this` for chaining.

#### `off(event, listener): this`

Remove an event listener.

#### `progress` event

Emitted after each batch during `prepareForExport()`, `forEachPost()`, and `forEachGhostPost()`.

```js
ctx.on('progress', (event, processed, total) => {
    console.log(`[${event}] ${processed}/${total}`);
});
```

| Argument    | Type     | Description                                                  |
|-------------|----------|--------------------------------------------------------------|
| `event`     | `string` | Operation name: `prepareForExport`, `forEachPost`, or `forEachGhostPost` |
| `processed` | `number` | Posts processed so far                                       |
| `total`     | `number` | Total posts to process                                       |

Events can be disabled entirely at construction with `emitEvents: false` for server environments where the overhead is unwanted:

```js
const ctx = new MigrateContext({emitEvents: false});
```

---

## PostContext

Represents a single post with validated properties, tag/author relationships, and source metadata.

### Properties

#### `post.get(prop): any`

Get a property value.

#### `post.set(prop, value): PostContext`

Set a property value. Validates against the schema (type, max length, allowed values). Returns `this` for chaining.

Setting `html` invalidates cached `lexical`/`mobiledoc` — call `prepareForExport()` again to re-convert.

#### `post.remove(prop): PostContext`

Reset a property to its default value (or `null`).

#### `post.save(db): void`

Persist the post and its tag/author relationships to the database.

### Post fields

| Field                   | Type      | Max   | Default    | Notes                                     |
|-------------------------|-----------|-------|------------|-------------------------------------------|
| `title`                 | `string`  | 255   | —          | **Required**                              |
| `slug`                  | `string`  | 191   | —          | **Required**                              |
| `html`                  | `string?` | —     | `null`     | Source HTML content                       |
| `lexical`               | `string?` | —     | `null`     | Auto-generated on export                  |
| `mobiledoc`             | `string?` | —     | `null`     | Auto-generated on export                  |
| `status`                | `enum`    | —     | `'draft'`  | `published`, `draft`, `scheduled`, `sent` |
| `type`                  | `enum`    | —     | `'post'`   | `post`, `page`                            |
| `visibility`            | `enum`    | —     | `'public'` | `public`, `members`, `paid`               |
| `featured`              | `boolean` | —     | `false`    |                                           |
| `created_at`            | `Date`    | —     | —          | **Required**                              |
| `updated_at`            | `Date?`   | —     | `null`     |                                           |
| `published_at`          | `Date?`   | —     | `null`     |                                           |
| `feature_image`         | `string?` | 2000  | `null`     |                                           |
| `feature_image_alt`     | `string?` | 125   | `null`     |                                           |
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

#### `post.source`

Access the source data object (set at construction). Not exported to Ghost JSON — use this to store original platform data for reference during migration.

#### `post.getSourceValue(key): any`

Get a single value from the source data.

#### `post.meta`

Access the metadata object.

#### `post.setMeta(value): void`

Replace the metadata object.

#### `post.getMetaValue(key): any`

Get a single metadata value.

### Web scrape data

#### `post.webscrapeData: any`

Get or set the raw web scrape response for this post. Stored as a JSON blob in a dedicated `webscrape_data` column on the Posts table. Defaults to `null`.

This is set automatically by [mg-webscraper](../mg-webscraper)'s `scrapePost` method, preserving the raw scraped response before any post-processing. Use it to access or reprocess scraped metadata in later pipeline steps without re-scraping.

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

Get or set the lookup key. When a post with a matching lookup key already exists in the database, `save()` silently skips the insert.

```js
const post = await ctx.addPost({lookupKey: 'https://example.com/post-url'});
// ... set fields ...
await post.save(ctx.db);

// Second save with same key is a no-op
const dupe = await ctx.addPost({lookupKey: 'https://example.com/post-url'});
await dupe.save(ctx.db); // skipped
```

### Slug deduplication

#### `deduplicateSlugs(): Promise<DuplicateSlugEntry[]>`

Ghost requires unique slugs. When a migration source contains multiple posts with the same slug, this method renames newer duplicates by appending `-2`, `-3`, etc., while the oldest post keeps the original slug.

Called automatically by `prepareForExport()`, so you typically don't need to call it directly. It only runs once — subsequent calls reuse the cached result.

After preparing, access the results via the `duplicateSlugs` getter to log renamed slugs for redirect handling:

```js
await ctx.prepareForExport();

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
| `url`     | `string` | Original URL from `source.url` or `canonical_url` (empty if none) |

Ordering is determined by `published_at` (falling back to `created_at`), so the earliest post keeps the original slug. If a suffix like `-2` already belongs to a real post, it skips to `-3`, etc.

See [examples/deduplicate-slugs.ts](examples/deduplicate-slugs.ts) for a complete example.

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
| `role`             | `enum`    | —    | `Contributor` (default), `Author`, `Editor`, `Administrator` |

---

## Examples

The [examples/](examples/) directory contains runnable scripts demonstrating common patterns:

- **generate-and-export.ts** — Create 500 posts in-memory and export to Ghost JSON
- **reorder-tags-authors.ts** — Reorder tags and authors using `setTagOrder`, `setPrimaryTag`, and `addTag` with `sortOrder`
- **generate-large-export.ts** — Stress-test with 500k posts, benchmarking memory and performance
- **foreach-ghost-post.ts** — Iterate an existing database and log each post as Ghost JSON
- **deduplicate-slugs.ts** — Detect and rename duplicate slugs, then log the changes for manual redirect handling

Run any example from the package directory:

```bash
npx tsx examples/generate-and-export.ts
```

## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.

## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests
- `pnpm test:local` build and run tests (for single-package development)

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
