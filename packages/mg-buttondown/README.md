# Migrate Buttondown Export

Converts a Buttondown export and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-buttondown --save`

or

`pnpm add @tryghost/mg-buttondown`


## Usage

To run a basic Buttondown migration, the required command is this:

```sh
migrate buttondown --pathToZip /path/to/export.zip --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a zip file
    - string - default: `null`
- **`--url`** (required)
    - Site URL. Links to `<url>/<slug>` in the content are rewritten to the imported posts.
    - string - default: `null`  
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Download assets
        - `web`: Accepted for compatibility; Buttondown migrations do not scrape web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`--rereadSource`**
    - Read the export zip again, replacing the stored source while preserving downloaded assets
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
    - Accepted for compatibility. Buttondown exports name no authors, so there are no authors to match to Ghost users.
    - string - default: `null`


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each.

Each email becomes a published, public post tagged `#buttondown`, dated by its `publish_date` (a timestamp without a timezone is read as UTC). Its HTML is converted from its Markdown body: comments are removed, embedded tweets become embed cards, footnotes become an HTML card, and `{{ subscribe_form }}` and empty paragraphs are removed. Posts have no authors, as before, so Ghost's importer assigns them its default author.

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Emails without an `id` or a `slug`, or with an invalid `publish_date`, are skipped and reported. An email without a body file is imported with empty HTML and a warning. When every selected email is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An export without emails succeeds with an empty import.


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace; later runs map the stored export again without reading the zip, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so exports that share a file name do not share stored data.

The zip is read one entry at a time, and may hold its files inside a single top-level directory. Each email in `emails.json` is stored as an `email` record keyed by its `id`; when the export has no `emails.json`, each row of `emails.csv` is stored instead, read one row at a time. `emails.json` holds only metadata and is parsed whole. Each `emails/*.md` file is stored as a `body` record keyed by its path, such as `emails/my-post.md`. An `id` or path that appears twice keeps its first record and reports a `source:conflict`. An export without `emails.json` or `emails.csv`, or whose emails have no body files at all, is rejected.

Mapping joins each email to `emails/<slug>.md` and follows the order of the email list. There are no filters, so changing `--url` needs no new read. Ghost IDs derive from `--url` and the email `id` or tag slug, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, asset scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-buttondown';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.zip', context, {replace: rereadSource});
    }
    const summary = await map({url: 'https://example.com'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToZip, context, {replace})` reads the export into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(pathToZip)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map({url}, context)` rebuilds mapped content and returns `{selected, imported, skipped}`. `url` is required.
- `contentStats(pathToZip)` counts the export's email bodies, `processHTML(markdown)` converts one body to HTML, and `ghostId(site, kind, key)` gives the stable Ghost ID `map()` uses.

The previous default export (`ingest({options})`, which built an array of posts in memory) and `readZip()` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-buttondown-export-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev buttondown <commands>
```


## Test

- `pnpm test` runs the package tests
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)
- `pnpm test:local` build and run tests (for single-package development)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
