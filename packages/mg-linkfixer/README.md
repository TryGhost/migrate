# Migrate LinkFixer

Finds and replaces internal links in migrated content. During a migration, post URLs change from their original form (e.g. `https://example.com/2020/06/27/my-post/`) to relative Ghost paths (e.g. `/my-post/`). LinkFixer scans HTML and Lexical content for links that point to known posts, pages, tags, and authors, and rewrites them to the correct relative URLs.

## Install

`npm install @tryghost/mg-linkfixer --save`

or

`pnpm add @tryghost/mg-linkfixer`

## Usage

LinkFixer operates on a migration context object (`ctx`) that is shared across all steps of a migration pipeline. It works in two steps:

1. **Build a link map** from `ctx` — scans all posts, pages, tags, and authors to create a mapping of original URLs to relative Ghost paths
2. **Fix links** — scans HTML and Lexical fields in the Ghost JSON output and replaces any matched URLs

### The `ctx` object

`ctx` is the shared migration context passed through every step of a migration pipeline. LinkFixer reads from two parts of it:

**`ctx.options`** — configuration for the migration:

| Property          | Type                   | Description                                                                                                              |
|-------------------|------------------------|--------------------------------------------------------------------------------------------------------------------------|
| `url`             | `string` or `string[]` | The source site URL(s). When an array is provided, links to any of the domains are recognized as internal and rewritten. |
| `datedPermalinks` | `string` (optional)    | The dated permalink format used by the source site. See [Dated permalinks](#dated-permalinks).                           |

**`ctx.result`** (or `ctx.data`) — the migration data. LinkFixer reads from `ctx.result.posts` (falling back to `ctx.data.posts`), where each post has:

| Property       | Type                 | Description                                                             |
|----------------|----------------------|-------------------------------------------------------------------------|
| `url`          | `string`             | The original full URL of the post (e.g. `https://example.com/my-post/`) |
| `data.slug`    | `string`             | The post slug, used as the target path when rewriting                   |
| `data.html`    | `string`             | HTML content — scanned for `<a>` links to rewrite                       |
| `data.lexical` | `string` (optional)  | Lexical JSON content — scanned for `url` properties to rewrite          |
| `data.tags`    | `array`  (optional)  | Tags with `url` and `data.slug` — mapped to `/tag/{slug}/`              |
| `data.author`  | `object` (optional)  | Author with `url` and `data.slug` — mapped to `/author/{slug}/`         |
| `data.authors` | `array`  (optional)  | Authors array, same shape as `data.author`                              |

After `fix()` runs, the rewritten content is written back to `ctx.result.data.posts` (the Ghost JSON output).

### Basic example

```javascript
import LinkFixer from '@tryghost/mg-linkfixer';

const linkFixer = new LinkFixer();

linkFixer.buildMap(ctx);

// After converting to Ghost JSON format, fix links in the output.
// `task` is a Listr task reference (used for skip messaging when the link map is empty).
const tasks = linkFixer.fix(ctx, task);
```

### Integration with a migration pipeline

LinkFixer is typically used as part of a Listr task chain in a source adapter:

```javascript
import LinkFixer from '@tryghost/mg-linkfixer';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

const tasks = [
    {
        title: 'Initialise',
        task: (ctx) => {
            ctx.linkFixer = new LinkFixer();
        }
    },
    // ... ingest and format data ...
    {
        title: 'Build Link Map',
        task: (ctx) => {
            ctx.linkFixer.buildMap(ctx);
        }
    },
    // ... convert to Ghost JSON, scrape assets, etc. ...
    {
        title: 'Update links in content via LinkFixer',
        task: (ctx, task) => {
            let subtasks = ctx.linkFixer.fix(ctx, task);
            return makeTaskRunner(subtasks, options);
        }
    }
];
```

### Per-post usage with MigrateContext

When using [mg-context](../mg-context)'s `MigrateContext`, use `fixPost` instead of `buildMap`/`fix`. This avoids loading the entire link map into memory — each post's links are looked up individually against the database.

`fixPost` takes a post object (anything with `get(field)` and `set(field, value)` methods) and a lookup function. It extracts all URLs from the post's `html` and `lexical` fields, cleans each one (stripping protocol and query params), and calls the lookup function. Matches are replaced; non-matches are left unchanged.

```javascript
import LinkFixer from '@tryghost/mg-linkfixer';
import {MigrateContext} from '@tryghost/mg-context';

const context = new MigrateContext();
await context.init();

// ... ingest posts, calling context.addLink() for each known URL ...

const linkFixer = new LinkFixer();
const lookup = (url) => context.findLink(url);

await context.forEachPost(async (post) => {
    await linkFixer.fixPost(post, lookup);
});
```

### Multiple domains

If the source site used multiple domains over its lifetime (e.g. it moved from `olddomain.com` to `newdomain.com`), links to any of those domains should be treated as internal and fixed.

**Legacy pipeline (`buildMap`/`fix`):** Call `expandForDomains` after `buildMap` to cross-populate the link map so every known path is reachable via every domain:

```javascript
linkFixer.buildMap(ctx);
linkFixer.expandForDomains(['https://newdomain.com', 'https://olddomain.com']);
```

A link to `https://olddomain.com/my-post/` will be rewritten the same way as `https://newdomain.com/my-post/`.

**MigrateContext pipeline (`fixPost`):** Domain expansion is handled at ingest time by calling `context.addLink()` for each domain. `fixPost` doesn't need to know about domains — it just looks up whatever URLs it finds.

### Dated permalinks

If the source site used dated permalink structures, set `ctx.options.datedPermalinks` so that dates are preserved in the rewritten URLs:

```javascript
// Supported formats:
ctx.options.datedPermalinks = '/yyyy/mm/dd/';   // e.g. /2020/06/27/my-post/
ctx.options.datedPermalinks = '/yyyy/mm/';      // e.g. /2020/06/my-post/
ctx.options.datedPermalinks = '/*/yyyy/mm/dd/'; // e.g. /articles/2020/06/27/my-post/ -> /2020/06/27/my-post/
ctx.options.datedPermalinks = '/*/yyyy/mm/';    // e.g. /articles/2020/06/my-post/ -> /2020/06/my-post/
```

When no `datedPermalinks` option is set, all URLs are rewritten to slug-only paths (e.g. `/my-post/`).

## How it works

There are two API paths depending on how your pipeline is structured:

### Legacy pipeline (`buildMap` + `fix`)

1. **`buildMap(ctx)`** iterates over all posts in `ctx.result.posts` (or `ctx.data.posts`) and builds an in-memory mapping of original URLs to their new relative paths. Each post's own URL domain is used for dated permalink detection. Tags are mapped to `/tag/{slug}/` and authors to `/author/{slug}/`. Both `http` and `https` variants of each URL are handled.
2. **`expandForDomains(urls)`** cross-populates the link map so every known path is reachable via every provided domain. Call after `buildMap` when the source site used multiple domains.
3. **`fix(ctx, task)`** returns an array of Listr-compatible task objects. Each task processes one content field (HTML or Lexical) from one post, scanning for links that match the map and replacing them with the relative path.
4. **`processHTML(html)`** parses the HTML, finds all `<a>` elements, cleans each `href` (stripping protocol and query parameters), and replaces it if found in the link map.
5. **`processLexical(lexical)`** parses the Lexical JSON and recursively replaces any `url` property values that match the link map.

### MigrateContext pipeline (`fixPost`)

6. **`fixPost(post, lookupFn)`** processes a single post's `html` and `lexical` fields. For each URL found in the content, it cleans it with `cleanURL()` (stripping protocol and query params to `host/path`) and calls `lookupFn(cleanedUrl)`. If the function returns a string, the URL is replaced; if it returns `null`/`undefined`, the original URL is kept. The post object is duck-typed — it only needs `get(field)` and `set(field, value)` methods.

### `cleanURL`

Both `fixPost` and `processHTML` normalize URLs before looking them up — stripping the protocol and query parameters to produce a `host/path` key (e.g. `https://example.com/my-post/?ref=home` becomes `example.com/my-post/`). If the link map keys don't use the same format, lookups silently fail.

`cleanURL` lives in [mg-utils](../mg-utils) as `stringUtils.cleanURL` and is re-exported here for convenience:

```javascript
import {stringUtils} from '@tryghost/mg-utils';
const {cleanURL} = stringUtils;

// or via mg-linkfixer
import {cleanURL} from '@tryghost/mg-linkfixer';

cleanURL('https://example.com/my-post/?ref=home');
// => 'example.com/my-post/'

// Use it when populating the link map during ingest
context.addLink(cleanURL(postUrl), `/${slug}/`);
context.addLink(cleanURL(tagUrl), `/tag/${tagSlug}/`);
context.addLink(cleanURL(authorUrl), `/author/${authorSlug}/`);
```

Also available as `LinkFixer.cleanURL(url)` and `instance.cleanURL(url)` for backward compatibility.

## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.

## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests

# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
