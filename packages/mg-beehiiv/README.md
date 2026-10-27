# Migrate beehiiv `csv` Export

Converts a beehiiv `csv` export and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-beehiiv --save`

or

`pnpm add @tryghost/mg-beehiiv`


## Usage

To run basic beehiiv migration, the required command is this:

```sh
migrate beehiiv --posts /path/to/posts.csv --url https://example.com
```

A more complex command for a beehiiv migration looks like this:

```sh
migrate beehiiv --posts /path/to/posts.csv --url https://example.com --defaultAuthorName 'Author Name' --subscribeLink '/join'
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--posts`** (required)
    - Path to the posts CSV file
    - string - default: `null`
- **`--url`** (required)
    - Site URL
    - string - default: `null`  
- **`--defaultAuthorName`** 
    - The name to use where no author is specified. Names with spaces should be quoted.
    - string - default: `null`
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`--subscribeLink`** 
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--comments`**
    - Keep comment buttons
    - bool - default: `true`
- **`--commentLink`**
    - Provide a path that existing comment anchors will link to e.g. `#ghost-comments-root` (`#` characters need to be escaped with a `\`)
    - string - default: `#ghost-comments-root`
- **`--wait_after_scrape`**
    - Time in ms to wait after a URL is scraped
    - number - default: `200`
- **`--rereadSource`**
    - Read the posts CSV again, replacing the stored source while preserving downloaded assets
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
    - string - default: one based on the CSV's full path
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`   
- **`--report`**
    - Write a `.report.json` migration report beside the import, or a `.failed-report.json` if the run fails
    - bool - default: `false`
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for duplicate rows, skipped posts, field changes, slug changes and optional scraping failures. Rows without an `id`, with an invalid `created_at` or with more than 500 tags are skipped and reported. When every selected post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An empty CSV succeeds.

Each post gets its content tags, `#beehiiv`, and a `#beehiiv-visibility-<audience>` tag, with internal `#` tags last. Drafts (and archived posts) are given the default author. Published posts get their authors from their web page when it is scraped, or the default author when the page lists none; without web scraping they have no author, so Ghost assigns them to the importing staff user. Authors are identified by name, with a `<slug>@example.com` email that `--ghostApiUrl`/`--ghostAdminKey` can match to an existing Ghost user.


## Source storage

The first run stores the CSV in an `mg-context` SQLite database in the workspace; later runs map the stored rows again without reading the CSV, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the CSV's full path, so CSVs that share a file name do not share stored data.

Each CSV row is stored as a `post` record keyed by its `id`, read one row at a time. An `id` that appears twice keeps its first row and reports a `source:conflict`.

Every option applies when the stored records are mapped, so changing `--url`, `--defaultAuthorName` or a content option needs no new read. Mapping follows the CSV's order. Ghost IDs derive from `--url` and the row `id`, tag slug or author slug, so they stay the same across runs. beehiiv writes `created_at` without a time zone; it is read as UTC.

Web scraping happens after mapping, for published posts with a URL. The scraped metadata and authors are applied to the mapped post. Scraped pages are cached in the workspace.


## Programmatic API

The package exports `parse`, `ingest`, `map` and `applyScrapedData` for use with `@tryghost/mg-context`. The caller owns the context, scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-beehiiv';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/posts.csv', context, {replace: rereadSource});
    }
    const summary = await map({url: 'https://example.beehiiv.com', defaultAuthorName: 'Jane Doe'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToCsv, context, {replace})` reads the CSV into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(pathToCsv)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options.url` is required; `defaultAuthorName`, `subscribeLink`, `comments` and `commentLink` are the CLI's options, without its defaults. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's Ghost ID.
- `applyScrapedData(post, scraped, options)` applies post-processed scrape results (schema fields and `authors`) to a mapped post, as the CLI's scrape step does. The caller saves the post.
- `processHTML({html, title, options})` converts the email HTML in the CSV's `content_html` column, and `processWebHTML({html, url, options})` the web HTML that beehiiv's API returns. `removeDuplicateFeatureImage({html, featureSrc})` removes a leading image that repeats the feature image. `@tryghost/mg-beehiiv-api` uses these and the shared `namedAuthor`, `namedTag`, `publicFirst` and `rememberGhostUsers` helpers.
- `createSlug({url, title})` and `fullImageURL(path)` derive a post slug and an absolute beehiiv image URL.

The previous default export (`mapContent({options})`, which built an array of posts in memory) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-beehiiv-posts-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev beehiiv <commands>
```


## Test

- `pnpm test` runs the package tests
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)
- `pnpm test:local` build and run tests (for single-package development)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
