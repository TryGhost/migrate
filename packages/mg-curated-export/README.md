# Migrate Curated Export

Migrate content from Curated using the supplied zip file, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-curated-export --save`

or

`pnpm add @tryghost/mg-curated-export`


## Usage

To run a Curated migration, the required command is:

```sh
migrate curated --pathToZip /path/to/export.zip
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:


- **`--pathToZip`** (required)
    - Path to a Curated export zip
    - string - default: `null`
- **`-n` `--name`**
    - The name of the author of every post, e.g. `Jane Editor`
    - string - default: `Example User`
- **`-e` `--email`**
    - The email address of the author of every post, e.g. `jane@example.com`
    - string - default: `<author slug>@example.com`
- **`-t` `--tag`**
    - A tag added to every post, before `#curated`
    - string - default: `false`
- **`--rereadSource`**
    - Read the export zip again, replacing the stored source and rewriting its images
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
    - Match the author to an existing Ghost user by email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate curated --pathToZip /path/to/export.zip --name 'Jane Editor' --email jane@example.com --tag Newsletter
```

This will process all published issues from the zip file, written by Jane Editor and tagged `Newsletter` and `#curated`.


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. The export's images are included under `content/images/<issue number>/`.

Each published issue becomes a public post with the issue's title, summary (as the excerpt), status and dates (a timestamp without a timezone is read as UTC). Its slug is the last segment of its Curated URL, such as `12` for `https://example.com/issues/12`. Its HTML has each category's name as a heading, followed by the category's `Text` and `Link` items separated by rules; an item's image comes first, linked to the item's URL when it has one. Links to other issues in the migration point at their new paths.

Every post has one author, from `--name` and `--email`, and the tags `--tag` (when given) and `#curated`.

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Issues without a valid URL or `published_at` are skipped and reported. An item image that is not in the export is left out with a warning. When every issue is invalid, or the run fails, `--report` writes a `.failed-report.json` instead.


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace, and writes its images into the workspace; later runs map the stored export again without reading the zip, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so exports that share a file name do not share stored data.

The zip is read one entry at a time, and may hold its `data-export` directory inside a top-level directory. Each `data-export/issues/published/<number>/<number>.json` file is stored as an `issue` record, and each original image beside it as an `image` record naming the file and the path it was written to, both keyed by their path below `data-export/issues/`, such as `published/12/12.json`. Each image is written to the workspace as it is read, as an optimized copy and the `_o` original. Curated's resized copies (`square_thumb_*`, `original_ratio_extra_large_*` and `original_ratio_medium_*`), unpublished issues and other files are not read. A path that appears twice keeps its first record and reports a `source:conflict`. An export without published issues, or with an issue file that is not a JSON object, is rejected.

Every option applies when the stored records are mapped, so changing `--name`, `--email` or `--tag` needs no new read. Ghost IDs derive from the issue URL, tag name or author email, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, file cache, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import fsUtils from '@tryghost/mg-fs-utils';
import {ingest, map} from '@tryghost/mg-curated-export';

const fileCache = new fsUtils.FileCache('curated-my-export');
const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.zip', context, {replace: rereadSource, fileCache});
    }
    const summary = await map({name: 'Jane Editor', email: 'jane@example.com'}, context);
    for await (const file of context.writeGhostJsonStream(fileCache.zipDir, {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToZip, context, {replace, fileCache})` reads the export into `context.sources` inside `context.sources.ingest()`, writing its images into `fileCache` (an `@tryghost/mg-fs-utils` `FileCache`, or anything with its `resolveImageFileName()` and `writeContentFile()`). Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(pathToZip)` yields the same records as `SourceRecordInput` values, one at a time, without storing them or writing images. Its `image` records have no `outputPath`, so `map()` leaves their images out.
- `map({name, email, tag}, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `ghostUsers` may be an iterable or async iterable of existing Ghost users; when one has the author's email, posts keep that user's Ghost ID, slug and roles, and Ghost users' slugs are reserved for them.
- `processContent(issue, imageSource)` converts one issue's categories to HTML, and `ghostId(kind, key)` gives the stable Ghost ID `map()` uses.

The previous default export (`(pathToZip, ctx)`, which read every file into memory and returned an array of posts) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-curated-export-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev curated --pathToZip /path/to/export.zip
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
