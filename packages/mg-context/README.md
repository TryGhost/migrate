# Migrate Context

This package makes it easier to create post objects that can be used in the Ghost migration tools. It aims to provide a consistent, typed interface for posts, pages, tags, and authors. It also validates input data to ensure that the resulting object is valid for importing into Ghost.

It can also be used for custom migrations, and can output a JSON file that can be imported in Ghost.

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
```

### Create a post

```js
const post = context.addPost();
post.set('title', 'My Post');
post.set('slug', 'my-post');
post.set('status', 'published');
post.set('published_at', new Date('2023-12-08T13:34:22.000Z'));
post.set('created_at', new Date('2023-12-08T13:23:03.000Z'));
post.set('updated_at', new Date('2023-12-08T13:36:42.000Z'));
post.set('html', '<p>My post content</p>');
```

You can optionally set the content format to `lexical` or `mobiledoc`. By default, only `html` is exported. This can be done in the constructor or by setting the property directly.

```js
const post = context.addPost({contentFormat: 'lexical'});

const post = context.addPost();
post.contentFormat = 'lexical';
```

### Add a tag

```js
post.addTag({
    name: 'My Tag',
    slug: 'my-tag'
});
```

### Add an author

```js
post.addAuthor({
    name: 'Author Name',
    slug: 'author-name',
    email: 'name@example.com'
});
```

## Adding posts from another source

If you have post data in another format, get it in to some sort of array or object that can be iterated over. Then, for each row, create a new post and set the data with the same methods as above.

```js
const arrayOfPostData = [...];

arrayOfPostData.forEach((row) => {
    const post = context.addPost();
    // post.set('title', row.title);
    // ...
});
```


### Get a Ghost JSON string

```js
const json = await context.json();
// `json` is a JSON string. Save it to a `.json` file and import it into Ghost
```





# Classes & Methods

There's 4 main classes: `MigrateContext`, `PostContext`, `TagContext`, and `AuthorContext`. Most of the time, `MigrateContext` is what you'll use, but more advanced usage may require the usage of the other classes.


### `MigrateContext`

This is the main class that manages all the other classes. It has methods for adding posts, tags, and authors, and also has methods for finding posts, tags, and authors.

- `context.addPost(post`
- `context.findPosts({slug, title, sourceAttr, tagSlug, tagName, authorSlug, authorName, authorEmail})`
- `context.findTags({slug, name})`
- `context.findAuthors({slug, name, email})`
- `await context.forEachPost(callback)`
- `context.forEachPostSync(callback)`
- `context.allPosts`
- `context.json()`

### `PostContext`

This class is only for posts and related data. You can also set tags and authors.

- `post.get(prop)`
- `post.set(prop)`
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
- `post.meta`
- `post.source`

### `TagContext`

This class is used to create and manage individual tags.

- `tag.set(prop)`
- `tag.remove(prop)`
- `tag.get(prop)`
- `tag.meta`

### `AuthorContext`

This class is used to create and manage individual authors.

- `author.set(prop)`
- `author.remove(prop)`
- `author.get(prop)`
- `author.meta`

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

const posts = context.findPosts({tagSlug: 'my-tag'});
const posts = context.findPosts({tagName: 'My Tag'});

const posts = context.findPosts({authorSlug: 'author-name'});
const posts = context.findPosts({authorName: 'Author Name'});
const posts = context.findPosts({authorEmail: 'author@example.com'});

const posts = context.findPosts({slug: 'my-post'});
const posts = context.findPosts({title: 'My Post'});
const posts = context.findPosts({sourceAttr: {
    key: 'url',
    value: 'https://example.com/blog/2023/11/26/original-slug/'
}});
```

### Updating found posts

Add a new tag to all posts with a specific tag

```js
const posts = context.findPosts({tagSlug: 'my-tag'});

posts.forEach((post) => {
    post.addTag({
        name: 'My New Tag',
        slug: 'my-new-tag'
    });
});
```

## Updating found authors

Change the email for found authors

```js
const authors = context.findAuthors({slug: 'author-name'});

authors.forEach((author) => {
    author.set('email', 'real-email@exmapl.com');
});
```

## Updating found tags

Change the name of found tags

```js
const tags = context.findTags({slug: 'my-tag'});

tags.forEach((tag) => {
    tag.set('name', 'My New Tag');
});
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

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
