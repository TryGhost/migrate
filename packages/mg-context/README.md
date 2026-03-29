# Migrate Context

This package makes it easier to create post objects that can be used in the Ghost migration tools. It aims to provide a consistent, typed interface for posts, pages, tags, and authors. It also validates input data to ensure that the resulting object is valid for importing into Ghost.

It can also be used for custom migrations, and can output a JSON file that can be imported in Ghost.

Data is persisted to a SQLite database (in-memory by default), which allows migrating large sites with tens of thousands of posts without excessive memory usage.

This package exports a few different classes: `MigrateContext`, `PostContext`, `TagContext`, and `AuthorContext`.
Most of the time, you'll want the `MigrateContext` class, which is the top-level class that manages all the other classes.

## Install

`npm install @tryghost/mg-context --save`

or

`yarn add @tryghost/mg-context`


# Usage

Let's walk through adding a post to a context, and then outputting the final JSON that can be imported into Ghost.

### Create a context

```js
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext();
await context.init();
```

You can optionally set the content format to `html` or `mobiledoc` on the context. By default, `lexical` is exported. All posts added to the context will use this format.

```js
const context = new MigrateContext({contentFormat: 'lexical'});
await context.init();
```

For persistent storage (survives process restarts), provide a `dbPath`:

```js
const context = new MigrateContext({dbPath: '/tmp/migration.sqlite'});
await context.init();
```

By default, providing a `dbPath` creates a file-based database. If no `dbPath` is given, an in-memory database is used. You can also explicitly control this with the `ephemeral` option:

```js
// In-memory, no file created
const context = new MigrateContext({ephemeral: true});

// File-based, persists to disk
const context = new MigrateContext({dbPath: '/tmp/migration.sqlite', ephemeral: false});
```

### Create a post

```js
const post = await context.addPost();
post.set('title', 'My Post');
post.set('slug', 'my-post');
post.set('status', 'published');
post.set('published_at', new Date('2023-12-08T13:34:22.000Z'));
post.set('created_at', new Date('2023-12-08T13:23:03.000Z'));
post.set('updated_at', new Date('2023-12-08T13:36:42.000Z'));
post.set('html', '<p>My post content</p>');
await post.save(context.db);
```

After mutating a post, call `await post.save(context.db)` to persist changes to the database.

When you call `post.set('html', '<p>...</p>')`, cached `lexical` and `mobiledoc` values are invalidated but conversion is deferred. The HTML is only converted to the target format when explicitly needed — by calling `convertContent()`, accessing `getFinal`, or during `writeGhostJson()`. The `contentFormat` (default `'lexical'`) controls which format is generated:

- **`lexical`** (default): HTML is converted to Lexical format. `mobiledoc` will be `null`.
- **`html`**: Only `html` is populated in the export. `mobiledoc` and `lexical` will be `null`.
- **`mobiledoc`**: HTML is converted to Mobiledoc format. `lexical` will be `null`.

### Add a tag

```js
post.addTag({
    name: 'My Tag',
    slug: 'my-tag'
});
await post.save(context.db);
```

### Add an author

```js
post.addAuthor({
    name: 'Author Name',
    slug: 'author-name',
    email: 'name@example.com'
});
await post.save(context.db);
```

### Deduplicating posts with a lookup key

When migrating from a source that might be processed more than once (e.g. resuming a failed migration), you can provide a `lookupKey` to prevent duplicate posts. If a post with the same `lookupKey` already exists, the insert is silently skipped.

```js
const post = await context.addPost({lookupKey: 'https://example.com/original-post-url'});
post.set('title', 'My Post');
post.set('slug', 'my-post');
post.set('created_at', new Date('2023-12-08T13:23:03.000Z'));
await post.save(context.db);

// Adding a post with the same lookupKey is a no-op — the original is preserved
const duplicate = await context.addPost({lookupKey: 'https://example.com/original-post-url'});
duplicate.set('title', 'Different Title');
await duplicate.save(context.db); // skipped, original post unchanged
```

To log a warning when duplicates are skipped, set `warnOnLookupKeyDuplicate` on the context:

```js
const context = new MigrateContext({warnOnLookupKeyDuplicate: true});
await context.init();
```

## Adding posts from another source

If you have post data in another format, get it in to some sort of array or object that can be iterated over. Then, for each row, create a new post and set the data with the same methods as above.

```js
const arrayOfPostData = [...];

for (const row of arrayOfPostData) {
    const post = await context.addPost({lookupKey: row.url});
    post.set('title', row.title);
    // ...
    await post.save(context.db);
}
```


### Using transactions for bulk inserts

When inserting many posts, wrapping batches in a transaction significantly improves write performance (especially for file-based databases):

```js
const BATCH_SIZE = 1000;

for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE);

    await context.transaction(async () => {
        for (const row of batch) {
            const post = await context.addPost({lookupKey: row.url});
            post.set('title', row.title);
            // ...
            await post.save(context.db);
        }
    });
}
```

### Get a Ghost JSON file

```js
const writtenFiles = await context.writeGhostJson('/path/to/output/');
// Writes posts.json (or posts-1.json, posts-2.json, etc. for large sites)
// Returns an array of WrittenFile objects: { path, name, size, posts }
```

You can customize the base filename and batch size:

```js
const writtenFiles = await context.writeGhostJson('/path/to/output/', {
    filename: 'export',  // default: 'posts'
    batchSize: 2000      // default: 5000
});
// With 10,000 posts, this creates: export-1.json, export-2.json, ... export-5.json
// If all posts fit in a single batch, the file is written as export.json (no suffix)
```

Each `WrittenFile` object contains:
- `path` — full absolute path to the file
- `name` — filename only (e.g. `export-1.json`)
- `size` — file size in bytes
- `posts` — number of posts in this file

### Export tags or users only

You can export just tags or just users as standalone JSON files, without posts or junction tables. Only tags and users that are referenced by at least one post are included — orphan entities with no post associations are omitted.

```js
// Export tags referenced by posts
const tagFile = await context.writeGhostTagsJson('/path/to/output/');
// Writes tags.json — { meta, data: { tags: [...] } }

// Export users referenced by posts
const userFile = await context.writeGhostUsersJson('/path/to/output/');
// Writes users.json — { meta, data: { users: [...] } }
```

Custom filenames are supported:

```js
const tagFile = await context.writeGhostTagsJson('/path/to/output/', {filename: 'my-tags'});
const userFile = await context.writeGhostUsersJson('/path/to/output/', {filename: 'my-users'});
```

Both return a single `WrittenFile` object (with `posts: 0`).

### Iterate posts as Ghost JSON

If you need to read posts one at a time (e.g. to import via the Ghost API), use `forEachGhostPost`. Each callback receives a flat post object with `tags` and `authors` inlined, plus the `PostContext` for access to source data or metadata.

```js
await context.forEachGhostPost(async (json, post) => {
    // json is a flat post: { title, slug, html, tags: [...], authors: [...], ... }
    await ghostApiClient.posts.add(json);
}, {
    batchSize: 50,
    progress(processed, total) {
        console.log(`${processed}/${total}`);
    }
});
```

This is read-only — mutations to the `PostContext` inside the callback are not saved to the database.

### Filtering posts

All three iteration methods (`forEachPost`, `forEachGhostPost`, `writeGhostJson`) accept a `filter` option to select a subset of posts. You can filter by tag, author, creation date, and publication date — all criteria combine with AND logic.

```js
// Filter by tag — only iterate posts tagged "news"
await context.forEachPost(async (post) => {
    post.set('status', 'published');
}, {
    filter: {tag: {slug: 'news'}}
});

// Filter by author
await context.forEachPost(async (post) => {
    post.addTag({name: 'Alice Posts', slug: 'alice-posts'});
}, {
    filter: {author: {email: 'alice@example.com'}}
});

// Filter by date range — export posts published on or after Oct 1 2025
await context.forEachGhostPost(async (json, post) => {
    await ghostApiClient.posts.add(json);
}, {
    filter: {
        publishedAt: {onOrAfter: new Date('2025-10-01')}
    }
});

// Combine filters (AND logic) — export only recent news posts
await context.writeGhostJson('/output', {
    filter: {
        tag: {slug: 'news'},
        createdAt: {after: new Date('2024-01-01')}
    }
});
```

The `PostFilter` interface:

| Filter | Field | Operator | Example |
|--------|-------|----------|---------|
| `tag.slug` | Tag slug | `=` | `{tag: {slug: 'news'}}` |
| `tag.name` | Tag name | `=` | `{tag: {name: 'News'}}` |
| `author.slug` | Author slug | `=` | `{author: {slug: 'alice'}}` |
| `author.name` | Author name | `=` | `{author: {name: 'Alice'}}` |
| `author.email` | Author email | `=` | `{author: {email: 'alice@example.com'}}` |
| `createdAt.before` | `created_at` | `<` | `{createdAt: {before: new Date('2025-01-01')}}` |
| `createdAt.after` | `created_at` | `>` | `{createdAt: {after: new Date('2025-01-01')}}` |
| `createdAt.onOrBefore` | `created_at` | `<=` | `{createdAt: {onOrBefore: new Date('2025-01-01')}}` |
| `createdAt.onOrAfter` | `created_at` | `>=` | `{createdAt: {onOrAfter: new Date('2025-01-01')}}` |
| `publishedAt.before` | `published_at` | `<` | `{publishedAt: {before: new Date('2025-01-01')}}` |
| `publishedAt.after` | `published_at` | `>` | `{publishedAt: {after: new Date('2025-01-01')}}` |
| `publishedAt.onOrBefore` | `published_at` | `<=` | `{publishedAt: {onOrBefore: new Date('2025-01-01')}}` |
| `publishedAt.onOrAfter` | `published_at` | `>=` | `{publishedAt: {onOrAfter: new Date('2025-01-01')}}` |

Notes:
- All criteria combine with AND logic
- Date filters accept any `Date` object, including times (e.g. `new Date('2025-10-01T14:30:00Z')`) — comparisons use the full ISO timestamp
- Posts with `null` `published_at` (drafts) are excluded by any `publishedAt` filter
- Tag and author filters are resolved via join tables at the SQL level

### Clean up

Always close the context when you're done:

```js
await context.close();
```


# Classes & Methods

There's 4 main classes: `MigrateContext`, `PostContext`, `TagContext`, and `AuthorContext`. Most of the time, `MigrateContext` is what you'll use, but more advanced usage may require the usage of the other classes.


### `MigrateContext`

This is the main class that manages all the other classes. It has methods for adding posts, tags, and authors, and also has methods for finding posts, tags, and authors.

All methods that interact with the database are async.

- `await context.init()`
- `await context.close()`
- `await context.addPost(post)` — when called with options or no args, returns an unsaved post; when called with a `PostContext` instance, saves immediately
- `await context.transaction(callback)` — wrap operations in a database transaction for better write performance
- `await context.findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail})`
- `await context.findTags({slug, name})`
- `await context.findAuthors({slug, name, email})`
- `await context.forEachPost(callback, {batchSize?, filter?, progress?})`
- `await context.forEachGhostPost(callback, {batchSize?, filter?, progress?})` — read-only iteration with processed Ghost JSON
- `await context.getAllPosts()`
- `await context.writeGhostJson(filePath, {batchSize?, filter?})`
- `await context.writeGhostTagsJson(outputDir, {filename?})` — export all tags as a single JSON file
- `await context.writeGhostUsersJson(outputDir, {filename?})` — export all users as a single JSON file
- `context.db` — access the database models (for `post.save(context.db)`)

### `PostContext`

This class is only for posts and related data. You can also set tags and authors.

- `post.get(prop)`
- `post.set(prop, value)`
- `post.remove(prop)`
- `post.setMeta(value)`
- `post.getMetaValue(key)`
- `post.getSourceValue(key)`
- `post.hasTagSlug(tagSlug)`
- `post.hasTagName(tagName)`
- `post.addTag(value)`
- `post.removeTag(tagSlug)`
- `post.setTagOrder(callback)`
- `post.setPrimaryTag(value)`
- `post.hasAuthorSlug(authorSlug)`
- `post.hasAuthorName(authorName)`
- `post.hasAuthorEmail(authorEmail)`
- `post.addAuthor(value)`
- `post.removeAuthor(authorSlug)`
- `post.setAuthorOrder(callback)`
- `post.setPrimaryAuthor(value)`
- `await post.save(db)` — persist changes to the database
- `post.lookupKey` — get/set the lookup key used for deduplication
- `post.meta`
- `post.source`

### `TagContext`

This class is used to create and manage individual tags.

- `tag.set(prop, value)`
- `tag.remove(prop)`
- `tag.get(prop)`
- `await tag.save(db)` — persist changes to the database

### `AuthorContext`

This class is used to create and manage individual authors.

- `author.set(prop, value)`
- `author.remove(prop)`
- `author.get(prop)`
- `await author.save(db)` — persist changes to the database

# Tips & tricks

Knowing the methods is not that useful in itself. Here's some tips and tricks that are the heart of this package.

## Finding Posts

If you need to find posts that have a specific tag or author, use the `findPosts` method. You can supply an object with any of the following keys:

- `tagSlug`
- `tagName`
- `authorSlug`
- `authorName`
- `authorEmail`

```js
const context = new MigrateContext();
await context.init();

const posts = await context.findPosts({tagSlug: 'my-tag'});
const posts = await context.findPosts({tagName: 'My Tag'});

const posts = await context.findPosts({authorSlug: 'author-name'});
const posts = await context.findPosts({authorName: 'Author Name'});
const posts = await context.findPosts({authorEmail: 'author@example.com'});

const posts = await context.findPosts({slug: 'my-post'});
const posts = await context.findPosts({title: 'My Post'});
const posts = await context.findPosts({sourceAttr: {
    key: 'url',
    value: 'https://example.com/blog/2023/11/26/original-slug/'
}});
```

### Updating found posts

Add a new tag to all posts with a specific tag

```js
const posts = await context.findPosts({tagSlug: 'my-tag'});

for (const post of posts) {
    post.addTag({
        name: 'My New Tag',
        slug: 'my-new-tag'
    });
    await post.save(context.db);
}
```

## Updating found authors

Change the email for found authors

```js
const authors = await context.findAuthors({slug: 'author-name'});

for (const author of authors) {
    author.set('email', 'real-email@example.com');
    await author.save(context.db);
}
```

## Updating found tags

Change the name of found tags

```js
const tags = await context.findTags({slug: 'my-tag'});

for (const tag of tags) {
    tag.set('name', 'My New Tag');
    await tag.save(context.db);
}
```


### Class Flow

```
┌────────────────┐
│ MigrateContext │
└───┬────────────┘
   ┌▼─────────────────────────────┐
   │ PostContext                  │
   └┬─────────────────────────────┘
    └─────┬───────────────┐
   ┌──────▼─────┐ ┌───────▼───────┐
   │ TagContext │ │ AuthorContext │
   └────────────┘ └───────────────┘
```


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and yarn workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
