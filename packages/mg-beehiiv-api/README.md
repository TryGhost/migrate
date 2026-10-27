# Migrate beehiiv API

> [!IMPORTANT]
> This package is a work in progress, and is not ready for production use yet.

Migrate content from beehiiv to Ghost using the beehiiv API, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-beehiiv-api --save`

or

`pnpm add @tryghost/mg-beehiiv-api`


## Usage

To run a beehiiv API migration, the required command is:

```sh
migrate beehiiv-api --key 1234abcd
```

If no `--id` is provided, a list of available publications will be shown. Use the publication ID to run the full migration:

```sh
migrate beehiiv-api --key 1234abcd --id pub_abcd1234
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--key`** (required)
    - beehiiv API key
    - string - default: `null`
- **`--id`**
    - beehiiv publication ID
    - string - default: `null`
- **`--postsAfter`**
    - Only migrate posts published on or after this date
    - string - default: `null`
    - Format: `YYYY-MM-DD`
- **`--postsBefore`**
    - Only migrate posts published on or before this date
    - string - default: `null`
    - Format: `YYYY-MM-DD`
- **`-s` `--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`, `assets`: Download assets (images, media, files)
        - `web`, `none`: Skip downloading assets; this source does not scrape web pages
- **`--subscribeLink`**
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--comments`**
    - Keep comment buttons
    - bool - default: `true`
- **`--commentLink`**
    - Provide a path that existing comment anchors will link to e.g. `#ghost-comments-root` (`#` characters need to be escaped with a `\`)
    - string - default: `#ghost-comments-root`
- **`--addTag`**
    - Provide a tag name which should be added to every post in this migration (wrap in single quotes if the name has spaces, e.g. `'From beehiiv'`)
    - string - default: `null`
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
    - string - default: one based on the publication ID
- **`-V` `--verbose`**
    - Show verbose output
    - bool - default: `false`
- **`--zip`**
    - Create a zip file (set to false to skip)
    - bool - default: `true`
- **`--report`**
    - Write a `.report.json` migration report beside the import, or a `.failed-report.json` if the run fails
    - bool - default: `false`
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate beehiiv-api --key 1234abcd --id pub_abcd1234 --postsAfter 2024-01-01 --postsBefore 2024-12-31 --verbose
```

This will migrate only posts published in 2024, and show all available output in the console.


## Output

The import contains HTML; Ghost's importer converts it. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for repeated posts, skipped posts, field changes and slug changes. Posts without an ID, without any valid date, or with more than 500 authors or tags are skipped and reported. When every selected post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An intentionally empty selection succeeds.

Each post gets its content tags, `--addTag` and `#beehiiv`, with internal `#` tags last, and its beehiiv authors, identified by name with a `<slug>@example.com` email that `--ghostApiUrl`/`--ghostAdminKey` can match to an existing Ghost user. Posts that were never published are dated when they were created.


## Source storage

The first run fetches every post of the publication, ten per page with their free and premium web content, and stores them in an `mg-context` SQLite database in the workspace; later runs map the stored posts again without calling the API. Use `--rereadSource` to fetch them again. Without `--cacheName`, the workspace is keyed by the publication ID. The API key is never stored.

Each post is stored as a `post` record keyed by its ID. A post returned twice while paging keeps its first copy and reports a `source:conflict`.

`--postsAfter`, `--postsBefore`, `--addTag` and the content options apply when the stored posts are mapped, so changing them needs no new fetch. Ghost IDs derive from the publication ID and the post ID, tag slug or author slug, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`, and `listPublications`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-beehiiv-api';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('pub_abcd1234', context, {key: process.env.BEEHIIV_API_KEY, replace: rereadSource});
    }
    const summary = await map({postsAfter: '2024-01-01', addTag: 'From beehiiv'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(id, context, {key, replace, onProgress})` fetches the publication's posts into `context.sources` inside `context.sources.ingest()`, calling `onProgress(title)` before each page. Explicit `replace: true` is required when completed source data exists; a failed fetch keeps the previous data.
- `parse(id, {key, onProgress})` yields the same records as `SourceRecordInput` values, one page at a time, without storing them.
- `tasks({key, id})` returns one task per page; each task's `task(ctx)` writes its page into `ctx.sourceIngestion`, and `records()` fetches it without storing. `discover({key, id})` returns the post and page counts.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options` takes `postsAfter`, `postsBefore`, `addTag`, `subscribeLink`, `comments` and `commentLink`, without the CLI's defaults. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's Ghost ID.
- `listPublications(key)` lists the publications the key can read.

The previous default export (`fetchTasks` and `mapPostsTasks`, which built an array of posts in memory, and cached each page as a JSON file in the workspace) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-beehiiv-api-pub-abcd1234-1700000000000.zip`.


## HTML Processing

Post content is converted with `processWebHTML` from `@tryghost/mg-beehiiv`, which shares it with the CSV migration's `processHTML` and `removeDuplicateFeatureImage`. It transforms beehiiv's web HTML into clean, Ghost-compatible HTML, applying the following transformations in order:

1. **Variable replacement** — Removes beehiiv template variables (`{{subscriber_id}}`, `{{rp_refer_url}}`, etc.)
2. **Content extraction** — Extracts content from `#content-blocks`
3. **Horizontal rules** — Converts empty `div[style*="border-top"]` to `<hr>`
4. **Sponsored content** — Converts tables containing "Sponsored Content" to Ghost HTML cards (see below)
5. **Images** — Converts `<img>` to Ghost image cards with captions
6. **Blockquotes** — Converts nested `padding-left` divs to `<blockquote>`
7. **Buttons** — Converts `<a><button>` to Ghost button cards
8. **Subscribe links** — Rewrites `/subscribe` links to the configured `--subscribeLink`
9. **Comment links** — Rewrites or removes comment links based on `--comments` and `--commentLink`
10. **Bookmark cards** — Converts `.generic-embed--root` to Ghost bookmark cards
11. **Audio** — Unwraps audio iframes from table wrappers
12. **YouTube** — Converts YouTube iframes to Ghost embed cards
13. **Cleanup** — Removes empty paragraphs, `<style>` tags, mobile ads, style attributes, and heading formatting


### Sponsored Content

beehiiv sponsored content blocks (styled `<table>` elements containing "Sponsored Content" text) are converted to Ghost HTML cards:

```html
<!--kg-card-begin: html-->
<div class="mg-sponsored" data-mg-skip="image-card">
  <p> Sponsored Content </p>
  <h2> Ad Heading </h2>
  <div><a href="..."><img src="..."></a></div>
  <p> Ad body text </p>
  <a href="...">Learn more</a>
</div>
<!--kg-card-end: html-->
```

- Inner `<div>` elements containing text are converted to `<p>` tags
- Inner `<div>` elements containing images are preserved as-is
- Bare `<br>` elements between blocks are removed


### `data-mg-skip`

The `data-mg-skip` attribute controls which processing steps are skipped for elements and their descendants. This prevents content inside marked elements from being transformed by later processing steps.

Supported values:

| Value | Effect |
|---|---|
| `image-card` | Images inside this element are not converted to Ghost image cards |


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev beehiiv-api --key 1234abcd --id pub_abcd1234
```


## Test

- `pnpm test` runs the package tests
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)
- `pnpm test:local` build and run tests (for single-package development)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
