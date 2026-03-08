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

You can optionally set the content format to `lexical` or `mobiledoc` on the context. By default, only `html` is exported. All posts added to the context will use this format.

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

When you call `post.set('html', '<p>...</p>')`, the content is automatically converted based on the `contentFormat`:

- **`html`** (default): Only `html` is populated in the export. `mobiledoc` and `lexical` will be `null`.
- **`lexical`**: Both `html` and `lexical` are populated. The HTML is automatically converted to Lexical format. `mobiledoc` will be `null`.
- **`mobiledoc`**: Both `html` and `mobiledoc` are populated. The HTML is automatically converted to Mobiledoc format. `lexical` will be `null`.

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

## Adding posts from another source

If you have post data in another format, get it in to some sort of array or object that can be iterated over. Then, for each row, create a new post and set the data with the same methods as above.

```js
const arrayOfPostData = [...];

for (const row of arrayOfPostData) {
    const post = await context.addPost();
    post.set('title', row.title);
    // ...
    await post.save(context.db);
}
```


### Get a Ghost JSON file

```js
const writtenFiles = await context.writeGhostJson('/path/to/output.json');
// Writes one or more `.json` files that can be imported into Ghost
// Returns an array of written file paths
```

For large sites, posts are batched into separate files (default: 5,000 posts per file). Each file is a complete Ghost JSON import with all tags and authors for the posts in that file. You can configure the batch size:

```js
const writtenFiles = await context.writeGhostJson('/path/to/output.json', {batchSize: 2000});
// With 10,000 posts, this creates: output-1.json, output-2.json, output-3.json, output-4.json, output-5.json
// If all posts fit in a single batch, the file is written as-is without a suffix
```

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
- `await context.addPost(post)`
- `await context.findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail})`
- `await context.findTags({slug, name})`
- `await context.findAuthors({slug, name, email})`
- `await context.forEachPost(callback, batchSize?)`
- `await context.getAllPosts()`
- `await context.writeGhostJson(filePath, {batchSize?})`
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

This is a mono repository, managed with [lerna](https://lernajs.io/).

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
