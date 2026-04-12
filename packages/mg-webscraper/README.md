# Migrate WebScraper

Scrapes metadata from post URLs during a migration. Fetches each post's original URL and extracts fields like `meta_title`, `meta_description`, `og_image`, etc. using CSS selectors. Results are cached to disk so re-runs don't hit the network.

## Install

`npm install @tryghost/mg-webscraper --save`

or

`pnpm add @tryghost/mg-webscraper`

## Usage

### Constructor

```js
import WebScraper from '@tryghost/mg-webscraper';

const webScraper = new WebScraper(fileCache, config, postProcessor, skipFn);
```

| Parameter       | Type       | Description                                                                          |
|-----------------|------------|--------------------------------------------------------------------------------------|
| `fileCache`     | `object`   | File cache instance (from mg-fs-utils) for caching scraped responses                 |
| `config`        | `object`   | Scrape configuration with CSS selectors (see below)                                  |
| `postProcessor` | `function` | Optional transform applied to scraped data before merging. Defaults to identity.     |
| `skipFn`        | `function` | Optional function to skip specific posts in `hydrate()`. Not used by `scrapePost()`. |

### Post processor

The `postProcessor` function receives the raw scraped data and can clean, rename, or filter fields before they're applied to the post. It's called by both `hydrate` and `scrapePost`.

```js
const postProcessor = (scrapedData) => {
    // Use og:image as feature_image
    if (scrapedData.og_image) {
        scrapedData.feature_image = scrapedData.og_image;
        delete scrapedData.og_image;
    }

    // Strip trailing whitespace from titles
    if (scrapedData.meta_title) {
        scrapedData.meta_title = scrapedData.meta_title.trim();
    }

    return scrapedData;
};

const webScraper = new WebScraper(fileCache, config, postProcessor);
```

### Skip function

The `skipFn` is called once per post in `hydrate()` with the post object (`{url, data}`). Return a truthy value to skip scraping that post. Useful for skipping posts that already have the metadata you need, or filtering by post type.

```js
const skipFn = (post) => {
    // Skip pages, only scrape posts
    return post.data.type === 'page';
};

const webScraper = new WebScraper(fileCache, config, null, skipFn);
```

`scrapePost` does not use `skipFn` — when using `forEachPost`, control which posts are scraped via the `filter` option instead:

```js
await context.forEachPost(async (post) => {
    await webScraper.scrapePost(post);
}, {filter: {tag: {slug: 'news'}}});
```

### Scrape configuration

The `config.posts` object maps field names to [scrape-it](https://github.com/IonicaBizau/scrape-it) selectors:

```js
const config = {
    posts: {
        meta_title: {
            selector: 'title'
        },
        meta_description: {
            selector: 'meta[name="description"]',
            attr: 'content'
        },
        og_image: {
            selector: 'meta[property="og:image"]',
            attr: 'content'
        },
        og_title: {
            selector: 'meta[property="og:title"]',
            attr: 'content'
        }
    }
};
```

### Per-post scraping with MigrateContext

Use `scrapePost` when working with [mg-context](../mg-context)'s `MigrateContext`. It does two things:

1. **Sets fields automatically** — scrapes the post's source URL using `config.posts` selectors, runs the `postProcessor`, and sets the resulting fields (e.g. `meta_title`, `og_image`) on the post via `post.set()`. Fields not in the post's schema are silently skipped.
2. **Stores the raw scraped response** — saves the unprocessed scraped data on `post.webscrapeData`, persisted to the database as JSON. This is stored *before* post-processing, so later pipeline steps can access or reprocess the original data without re-scraping.

```js
const webScraper = new WebScraper(fileCache, config, postProcessor);

await context.forEachPost(async (post) => {
    await webScraper.scrapePost(post, {wait_after_scrape: 100});
});
```

The post is duck-typed — it needs `getSourceValue(key)` to provide the URL, `set(key, value)` for writing fields, and a `webscrapeData` setter. No explicit `save()` is needed — `forEachPost` saves each post automatically after the callback returns.

The raw response is available on the post in any later pipeline step:

```js
await context.forEachPost(async (post) => {
    const scraped = post.webscrapeData;
    if (scraped?.og_image && !post.get('feature_image')) {
        post.set('feature_image', scraped.og_image);
    }
});
```

### Legacy pipeline with `hydrate`

In the legacy pipeline, `hydrate` creates a Listr task array that scrapes all posts in `ctx.result.posts`:

```js
const tasks = webScraper.hydrate(ctx);
const runner = makeTaskRunner(tasks, options);
await runner.run();
```

Each task calls `scrapeUrl` for one post, then merges the result into `post.data` via `processScrapedData`.

## How it works

1. **`scrapeUrl(url, config, filename, wait)`** — checks the file cache for `{filename}.json`. If cached, returns it. Otherwise scrapes the URL, writes the response to the cache, strips empty fields, and optionally waits before returning.
2. **`scrapePost(post, options)`** — gets the URL from `post.getSourceValue('url')`, calls `scrapeUrl`, stores the raw response on `post.webscrapeData`, runs the `postProcessor`, then sets each non-empty field via `post.set()`.
3. **`hydrate(ctx)`** — maps `ctx.result.posts` to Listr task objects, each calling `scrapeUrl` then `processScrapedData` to merge into the post's mutable `data` object.

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
