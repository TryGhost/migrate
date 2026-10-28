# Migrate Blogger API

Migrate from Blogger using the Google API

This tool requires an API key, which you can get [here](https://developers.google.com/blogger/docs/3.0/using)

You also need a blog ID, which is a long number like `12345678123456781234`. You can find this by viewing the source of the Blogger site and looking for `blogId`.

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-blogger --save`

or

`pnpm add @tryghost/mg-blogger`


## Usage

To run a Blogger migration, the required command is:

```sh
migrate blogger --apiKey abcd --blogID 1234
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--apiKey`** (required)
    - string - default: `null`
    - API Key
- **`--blogID`** (required)
    - array - default: `null`
    - Comma separated list of blog IDs
- **`-V` `--verbose`**
    - Show verbose output
    - bool - default: `false`
- **`--zip`**
    - Create a zip file
    - bool - default: `true`
- **`--report`**
    - Write a `.report.json` migration report beside the import, or a `.failed-report.json` if the run fails
    - bool - default: `false`
- **`-s` `--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--firstImageAsFeatured`**
    - Use the first image as the post's feature_image
    - bool - default: `true`
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
    - string - default: one based on the blog IDs
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate blogger --apiKey abcd --blogID 1234,5678 --addTag 'Blog Posts' --firstImageAsFeatured false
```

This will fetch posts from 2 blogs, add a 'Blog Posts' tag to each post, and keep each post's first image in its content.


## Output

The import contains HTML; Ghost's importer converts it, so `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for repeated posts, skipped posts, field changes and slug changes. Posts without an ID or a valid date, or with more than 500 tags, are skipped and reported. When every selected post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An intentionally empty selection succeeds.

Each post is published with its slug taken from its Blogger URL, its labels as tags, then `--addTag`, `#blogger-site-<blogID>` and `#blogger`, with internal `#` tags last. Labels that share a slug are one tag. Authors are identified by their Blogger profile ID, so different accounts with the same display name become different Ghost users (`jane-doe`, `jane-doe-2`), each with a `<slug>@example.com` email that `--ghostApiUrl`/`--ghostAdminKey` can match to an existing Ghost user. Links between the migrated posts are rewritten to their Ghost URLs.


## Source storage

The first run fetches every post of each blog, in the order the blog IDs are given, following the API's page tokens, and stores them in an `mg-context` SQLite database in the workspace; later runs map the stored posts again without calling the API. Use `--rereadSource` to fetch them again. Without `--cacheName`, the workspace is keyed by the blog IDs, so a different list of blogs gets its own workspace. The API key is never stored, and API pages are no longer cached as JSON files in the workspace.

Each post is stored as a `post` record keyed `post:id:<id>`, with the blog and page it was fetched from. A post returned twice while paging keeps its most recently updated version and reports a `source:conflict`.

`--blogID` narrows the fetch and is stored with the source data. Leaving a stored blog out applies when the posts are mapped, but adding a blog that was not fetched (possible with `--cacheName`) needs `--rereadSource`. `--addTag` and `--firstImageAsFeatured` apply when the stored posts are mapped, so changing them needs no new fetch. Ghost IDs derive from the blog and post IDs, the tag slug or the author's profile ID, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-blogger';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest(['1234', '5678'], context, {apiKey: process.env.BLOGGER_API_KEY, replace: rereadSource});
    }
    const summary = await map({addTag: 'Blog Posts'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(blogIDs, context, {apiKey, replace, requestDelay, onProgress})` fetches each blog's posts into `context.sources` inside `context.sources.ingest()`, waiting `requestDelay` milliseconds (default 500) before each request and calling `onProgress(title)` before each page. Explicit `replace: true` is required when completed source data exists; a failed fetch keeps the previous data. `sourceBlogs(context)` returns the stored blog IDs.
- `parse(blogIDs, {apiKey, requestDelay, onProgress})` yields the same records as `SourceRecordInput` values, one page at a time, without storing them.
- `tasks({apiKey, blogIDs, requestDelay})` is an async generator of page tasks. Blogger pages by token, so each page's task is yielded after the previous page has been fetched. A task's `task(ctx)` writes its page into `ctx.sourceIngestion`, and `records()` fetches it without storing.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options` takes `blogID`, `addTag` and `firstImageAsFeatured` (default `true`, as in the CLI). `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's Ghost ID, name and slug.
- `processHTMLContent({postData, html, options})`, `cleanExcerpt`, `increaseImageSize` and `slugFromURL` are the HTML helpers `map()` uses.

The previous default export (`fetch.tasks` and `process.all`, which built an array of posts in memory) and `processPost`/`processPosts` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev blogger --apiKey abcd --blogID 1234
```


## Test

- `pnpm test` runs the package tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
