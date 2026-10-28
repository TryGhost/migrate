# Migrate Squarespace XML

Squarespace has a migration path via WordPress which results in a `xml` with all content. This tool processes that XML file, and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-squarespace-xml --save`

or

`pnpm add @tryghost/mg-squarespace-xml`


## Usage

To run a Squarespace migration, the required command is:

```sh
migrate squarespace --pathToFile /path/to/file.xml
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToFile`** (required)
    - Path to xml file
    - string - default: `null`
- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
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
- **`--drafts`**
    - bool - default: `true`
    - Import draft posts
- **`--posts`**
    - bool - default: `true`
    - Import Squarespace posts
- **`--pages`**
    - bool - default: `false`
    - Import Squarespace pages
- **`--tags`**
    - bool - default: `true`
    - Set to false if you don't want to import Squarespace tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--removeSelectors`** 
    - `Pass in a string of CSS selectors for elements that will be removed, e.g. '.ads, script[src*="adnetwork.com"]'`
    - string - default: `null`
- **`--rereadSource`**
    - Read the XML file again, replacing the stored source while preserving downloaded assets
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
    - string - default: one based on the export's full path
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate squarespace --pathToFile /path/to/file.xml --pages true --addTag News
```


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for duplicate items, skipped items, field changes, slug changes and optional scraping failures. Items with an invalid date, without an ID, or with more than 500 tags are skipped and reported. When every selected item is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An intentionally empty selection succeeds.

Every post is tagged `#sqs`, and a post without a title is titled from the start of its text and tagged `#no-title`. Categories come before tags, and tags starting with `#` come last. A category and a tag with the same slug are one Ghost tag. Posts whose author is not in the export are credited to "Migrator Added Author".


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace; later runs map the stored export again without reading the XML, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so exports that share a file name do not share stored data.

The XML is streamed one element at a time and must be well-formed: a bare `&` or an HTML entity such as `&nbsp;` outside CDATA is reported with its line and column. Each `<item>` (post, page or attachment) is stored as an `item` record keyed by its `wp:post_id`, each `<wp:author>` as an `author` record keyed by its `wp:author_id`, and every other channel element, such as the site `link`, as a `channel` record. An item ID that appears twice keeps its newest revision when both copies have a `wp:post_modified_gmt`, and otherwise its first copy; a repeated author keeps its first copy. Each case reports a `source:conflict`.

Every option applies when the stored records are mapped, so changing a filter, tag or content option needs no new read. Ghost IDs derive from the site URL and the item ID, author ID or tag slug, so they stay the same across runs. A post's feature image is the attachment its `_thumbnail_id` names or, without one, the attachment that follows it in the export. Its author is the export author whose login, display name or email matches the post's `dc:creator`. Dates come from `wp:post_date_gmt`, then `pubDate`, then `wp:post_date` read as UTC.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-squarespace-xml';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.xml', context, {replace: rereadSource});
    }
    const summary = await map({pages: true, drafts: false}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToFile, context, {replace})` reads the export into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data. An export without an HTTP(S) channel `link` is rejected.
- `parse(pathToFile)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. The options are the CLI's (`posts`, `pages`, `drafts`, `tags`, `addTag`, `removeSelectors`), with the CLI's defaults. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's ID, slug and roles.
- `sourceSite(context)` returns the stored site URL, and `sourceUrl(link, siteUrl)` resolves an item's link against it.
- `processContent(html, {removeSelectors})` converts Squarespace HTML.

The previous default export (`ingest(ctx)`, which built arrays of posts in memory) and `lib/process.js` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-squarespace-my-export-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev squarespace --pathToFile /path/to/file.xml
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
