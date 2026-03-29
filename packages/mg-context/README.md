# Migrate Context

A SQLite-backed data store for building Ghost import files. Provides a validated, typed interface for posts, tags, and authors with batched iteration for large migrations.

Data is persisted to SQLite (in-memory by default), so migrations with tens of thousands of posts don't require excessive memory. Content is validated against Ghost's schema on write, and HTML is lazily converted to Lexical or Mobiledoc on export.

## Install

```bash
npm install @tryghost/mg-context --save
# or
yarn add @tryghost/mg-context
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
| `warnOnLookupKeyDuplicate` | `boolean`                            | `false`             | Log when a duplicate lookupKey is skipped    |

```js
// In-memory (default)
const ctx = new MigrateContext();

// Persistent file-based
const ctx = new MigrateContext({dbPath: './migration.sqlite'});

// Mobiledoc output instead of Lexical
const ctx = new MigrateContext({contentFormat: 'mobiledoc'});
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

### Iterating posts

#### `forEachPost(callback, options?): Promise<void>`

Iterate all posts in batches. Each post is automatically saved after the callback.

```js
await ctx.forEachPost(async (post) => {
    post.set('status', 'published');
    // post is saved automatically after callback
}, {batchSize: 200});
```

#### `forEachGhostPost(callback, options?): Promise<void>`

Iterate posts as processed Ghost JSON with tags and authors inlined. Read-only — mutations are not saved.

```js
await ctx.forEachGhostPost(async (json, post) => {
    // json: { id, title, slug, tags: [...], authors: [...], ... }
    await ghostApi.posts.add(json);
}, {batchSize: 50});
```

#### Iteration options

| Option      | Type                         | Default | Description                                   |
|-------------|------------------------------|---------|-----------------------------------------------|
| `batchSize` | `number`                     | `100`   | Posts loaded per batch                        |
| `filter`    | `PostFilter`                 | —       | Filter criteria (see [Filtering](#filtering)) |
| `progress`  | `(processed, total) => void` | —       | Progress callback                             |

### Exporting

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

---

## PostContext

Represents a single post with validated properties, tag/author relationships, and source metadata.

### Properties

#### `post.get(prop): any`

Get a property value.

#### `post.set(prop, value): PostContext`

Set a property value. Validates against the schema (type, max length, allowed values). Returns `this` for chaining.

Setting `html` invalidates cached `lexical`/`mobiledoc` — conversion is deferred until export.

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

#### `post.addTag(tag): TagContext | false`

Add a tag by object or `TagContext`. Returns `false` if the slug already exists on this post.

```js
post.addTag({name: 'News', slug: 'news'});
```

#### `post.removeTag(slug): void`

Remove a tag by slug.

#### `post.hasTagSlug(slug): boolean` / `post.hasTagName(name): boolean`

Check if the post has a specific tag.

#### `post.setPrimaryTag(tag): void`

Set a tag as primary (moves it to position 0). Adds the tag if it doesn't exist.

#### `post.setTagOrder(callback): void`

Reorder tags. The callback receives the tags array and should return the reordered array.

### Authors

#### `post.addAuthor(author): AuthorContext | false`

Add an author by object or `AuthorContext`. Returns `false` if the slug already exists on this post.

```js
post.addAuthor({name: 'Alice', slug: 'alice', email: 'alice@example.com'});
```

#### `post.removeAuthor(slug): void`

Remove an author by slug.

#### `post.hasAuthorSlug(slug): boolean` / `post.hasAuthorName(name): boolean` / `post.hasAuthorEmail(email): boolean`

Check if the post has a specific author.

#### `post.setPrimaryAuthor(author): void`

Set an author as primary (moves them to position 0). Adds the author if they don't exist.

#### `post.setAuthorOrder(callback): void`

Reorder authors. The callback receives the authors array and should return the reordered array.

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
- **generate-large-export.ts** — Stress-test with 500k posts, benchmarking memory and performance
- **foreach-ghost-post.ts** — Iterate an existing database and log each post as Ghost JSON

Run any example from the package directory:

```bash
npx tsx examples/generate-and-export.ts
```

## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and yarn workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
