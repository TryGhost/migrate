# Migrate Letterdrop

Export content from Letterdrop using their API, and generate a `zip` file you can import into a Ghost installation.

Learn how to [get an API key](https://api.letterdrop.com/find-your-api-key).


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-letterdrop --save`

or

`pnpm add @tryghost/mg-letterdrop`


## Usage


To run a Letterdrop migration, the required command is:

```sh
migrate letterdrop --apiToken <API token> --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--apiToken`** (required)
    - string - default: `null`
    - Letterdrop API key
- **`--url`** (required)
    - string - default: `null`
    - URL to live site
- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`--report`**
    - Write a `.report.json` migration report beside the import, or a `.failed-report.json` if the run fails
    - bool - default: `false`
- **`--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Download assets
        - `assets`: Download assets (images, media, files)
        - `web`: No effect; Letterdrop posts are not scraped
        - `none`: Skip all scraping tasks
- **`--subscribeLink`**
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--subscribeText`**
    - Provide the button text for above subscribe links
    - string - default: `Subscribe`
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`--rereadSource`**
    - Fetch every post from the API again, replacing the stored source while preserving downloaded assets
    - bool - default: `false`
- **`--postsPerFile`**
    - Maximum posts written per Ghost import JSON file
    - number - default: `2000`
- **`--cache`**
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`--tmpPath`**
    - Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)
    - string - default: `null`
- **`--outputPath`**
    - Specify the full path where the final zip file will be saved to (Defaults to CWD)
    - string - default: `null`
- **`--cacheName`**
    - Provide a unique name for the cache directory
    - string - default: one based on `--url`
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate letterdrop --apiToken <API token> --url http://example.com --addPrimaryTag News
```

This will get all posts and apply the tag 'News' to each of them as its primary tag.


## Output

The import contains HTML; Ghost's importer converts it, so `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for repeated posts, skipped posts, field changes and slug changes. Posts without an ID or a valid date, or with more than 500 tags, are skipped and reported. When every selected post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An intentionally empty migration succeeds.

Each post is published, dated by its `publishedOn` date (or its `updated` date when that is missing), with its slug (or the last segment of its URL), subtitle as excerpt, meta title and description, and cover image as feature image. Its tags are `--addPrimaryTag`, the post's tags, then `#letterdrop`, with internal `#` tags last; tags that share a slug are one tag. Authors are identified by name, so different names whose slugs collide become different Ghost users (`jose-smith`, `jose-smith-2`), each with a `<slug>@example.com` email that `--ghostApiUrl`/`--ghostAdminKey` can match to an existing Ghost user. Posts without an author have none.

The HTML is cleaned: internal `/c/` links become `/p/` links and then links to the migrated posts' Ghost URLs, nested lists become HTML cards, Quill images become figures, custom buttons become button cards (referral buttons are removed), subscribe embeds become `--subscribeText` buttons, and links to the site's plans, subscribe and promo pages point to `--subscribeLink`.


## Source storage

The first run fetches every post from the Letterdrop API, 20 at a time in API order, and stores them in an `mg-context` SQLite database in the workspace; later runs map the stored posts again without calling the API. Use `--rereadSource` to fetch them again. Without `--cacheName`, the workspace is keyed by `--url`, so different sites get their own workspaces. The API token is never stored, and API responses are no longer cached as a `letterdrop_api.json` file in the workspace.

Each post is stored as a `post` record keyed `post:id:<id>`, with the page it was fetched from. A post returned twice while paging keeps its most recently updated version and reports a `source:conflict`.

Every option applies when the stored posts are mapped, so changing `--url`, `--addPrimaryTag`, `--subscribeLink` or `--subscribeText` needs no new fetch. Ghost IDs derive from `--url` and the post ID, tag slug or author name, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-letterdrop';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest(process.env.LETTERDROP_API_TOKEN, context, {replace: rereadSource});
    }
    const summary = await map({url: 'https://example.com', addPrimaryTag: 'News'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(apiToken, context, {replace, onProgress})` fetches every post into `context.sources` inside `context.sources.ingest()`, calling `onProgress(title)` before each page. Explicit `replace: true` is required when completed source data exists; a failed fetch keeps the previous data.
- `parse(apiToken, {onProgress})` yields the same records as `SourceRecordInput` values, one page at a time, without storing them.
- `tasks({apiToken})` is an async generator of page tasks. The API only says whether another page exists, so each page's task is yielded after the previous page has been fetched. A task's `task(ctx)` writes its page into `ctx.sourceIngestion`, and `records()` fetches it without storing. `discover({apiToken})` counts the posts for `--info`.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options` takes `url` (required), `addPrimaryTag`, `subscribeLink` (default `#/portal/signup`) and `subscribeText` (default `Subscribe`). `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's Ghost ID, name and slug.
- `processPost(post, options)` returns one post's fields and tags, and `processContent(html, {url, subscribeLink, subscribeText})` cleans its HTML; `map()` uses both.

The previous default export (`fetch.tasks`, which cached API pages in the workspace, and `process.all`, which built an array of posts in memory) and `processPosts` have been removed. `processPost` returns plain fields instead of `{url, data}`, `processContent` no longer takes the post URL, and `discover` returns only the post count.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev letterdrop --apiToken <API token> --url https://example.com
```


## Test

- `pnpm test` runs the package tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
