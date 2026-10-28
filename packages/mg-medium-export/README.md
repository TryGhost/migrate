# Migrate Medium Export

Migrate content from Medium using the supplied zip file, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-medium-export --save`

or

`pnpm add @tryghost/mg-medium-export`


## Usage

To run a Medium migration, the required command is:

```sh
migrate medium --pathToZip /path/to/my-export.zip
```

**Note:** The zip path can be to a singular zip file or a folder of zip files

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a zip file, or a folder of zip files
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
- **`--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`-e` `--email`**
    - string - default: `false`
    - Provide an email domain for users e.g. example.com
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration (Wrap in single quotes if tag name has spaces `'Like This'`)
- **`--addPlatformTag`**
    - Add #medium tag to migrated content
    - bool - default: `true`
- **`--mediumAsCanonical`**
    - bool - default: `false`
    - Use medium article as canonical URL
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
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match authors to existing Ghost users by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate medium --pathToZip /path/to/my-export.zip --email example.com
```

This will process all posts from the zip file, and authors without an email address in the export will have one ending in 'example.com'


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for duplicate files, skipped posts, field changes, slug changes and optional scraping failures. Posts without a Medium post ID or with an invalid publish date, and a second file for a Medium post already imported, are skipped and reported. When every post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An export without posts succeeds.


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace; later runs map the stored export again without reading the zip, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so exports that share a file name do not share stored data.

Each zip's `profile/profile.html` is stored as a `profile` record keyed by the zip's name, and each `posts/*.html` file as a `post` record keyed by its path, such as `posts/2022-12-11_Full-Test-6d912ac65341.html`. A folder's zips are read in name order, one entry at a time, and each may hold its files inside a single top-level directory. A post path found in two zips keeps its first record and reports a `source:conflict`. Other files in the export are not read.

Every option applies when the stored records are mapped, so changing a tag, canonical URL or email option needs no new read. Ghost IDs derive from the Medium post ID, tag slug or author handle, so they stay the same across runs. Drafts, and posts without a publish date, are dated when the export was read, so their dates also stay the same across runs.

Authors are identified by their Medium handle. The export's profile supplies the name, email, profile image and Twitter handle of the posts whose author link has its handle, and writes the posts that name no author, such as drafts. With a folder of zips, those posts use the profile in their own zip, or the only profile when there is just one. Authors without an email get `<slug>@<--email domain>`, `example.com` by default.

Web scraping happens after mapping. Each post with a canonical Medium URL (drafts have none) is scraped; its metadata, its tags (placed before internal `#` tags) and, for an author without one, the author's profile image are applied to the mapped post. Scraped pages are cached in the workspace.


## Programmatic API

The package exports `parse`, `ingest`, `map` and `applyScrapedData` for use with `@tryghost/mg-context`. The caller owns the context, scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-medium-export';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.zip', context, {replace: rereadSource});
    }
    const summary = await map({addTag: 'From Medium'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToZip, context, {replace})` reads an export zip, or a folder of them, into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data. A folder without zips, or an export without a profile or posts, is rejected.
- `parse(pathToZip)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. The options are the CLI's, with the CLI's defaults. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an author whose email matches keeps that user's Ghost ID, slug and roles, and Ghost users' slugs are reserved for them.
- `applyScrapedData(post, scraped, context)` applies post-processed scrape results to a mapped post, as the CLI's scrape step does. The caller saves the post.
- `postUrl(html)` returns a post's canonical Medium URL from its export HTML, `mediumHandle(url)` the lower-case Medium username in a URL, `ghostId(kind, key)` the stable Ghost ID the mapping assigns, and `contentStats(pathToZip)` counts the export's posts and profiles.
- `processPost`, `processContent` and `processProfile` convert one export file's HTML.

The previous default export (`(pathToZip, options)`, which read every file into memory and returned arrays of posts and users) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-medium-my-export-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev medium --pathToZip /path/to/my-export.zip
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
