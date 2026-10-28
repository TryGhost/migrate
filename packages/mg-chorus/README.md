# Migrate Chorus

Migrate content from Chorus using its entry exports, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-chorus --save`

or

`pnpm add @tryghost/mg-chorus`


## Usage

To run a Chorus migration, the required command is:

```sh
migrate chorus --entries /path/to/file.zip --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--entries`** (required)
    - Path(s) to Chorus export zips, or directories of `Entry:<id>.json` files
    - array - default: `null`
- **`--url`** (required)
    - URL to the live site. It scopes the stable Ghost IDs
    - string - default: `null`
- **`--scrape`**
    - Configure scraping tasks
    - array - default: `all`
    - Choices: `all`, `web`, `none`
        - `all`, `web`: Scrape each post's description and Open Graph and Twitter titles and descriptions from its page on the live site
        - `none`: Skip all scraping tasks
- **`--wait_after_scrape`**
    - Time in ms to wait after a URL is scraped
    - number - default: `200`
- **`--addPrimaryTag`**
    - Provide a tag name which should be added to every post as primary tag
    - string - default: `null`
- **`--rereadSource`**
    - Read the exports again, replacing the stored source
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
    - string - default: one based on the exports' full paths
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
    - Match authors to existing Ghost users by their placeholder email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate chorus --entries /path/to/file.zip /path/to/other.zip --url https://example.com --addPrimaryTag News
```

This will get all entries from both exports, and apply the tag `News` to every post.


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each.

Each entry becomes a published, public post with the entry's title (`(Untitled)` when it has none), its subtitle (`dek`) as the excerpt, and its `createdAt` as the created and published dates and `updatedAt` as the updated date (a timestamp without a timezone is read as UTC; an invalid `updatedAt` falls back to `createdAt`). Its slug is the last segment of its Chorus URL, such as `my-article` for `https://example.com/2019/9/26/12345678/my-article`, or the title's slug when the URL has no path. Its HTML is built from the entry's body: paragraphs, headings (without bold), lists, block quotes, pull quotes, rules and related links become HTML, and embeds, raw HTML, polls and tables become HTML cards. Images, galleries, sidebars and unknown blocks are left out. Links to other entries in the migration point at their new paths.

A post's authors are the entry's byline author, author profile and contributors, in that order, each with a `<slug>@example.com` placeholder email and the Contributor role. Its tags are `--addPrimaryTag` (when given), the entry's community groups, and `#chorus`; internal `#` tags come last. Authors and tags are identified by name, so the same name is one user or tag across posts, and names whose slugs collide get distinct slugs (`jane-doe`, `jane-doe-2`).

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Entries without an HTTP or HTTPS URL or a valid `createdAt` are skipped and reported, and a page that cannot be scraped is reported as a warning. When every entry is invalid, or the run fails, `--report` writes a `.failed-report.json` instead.


## Source storage

The first run stores the exports in an `mg-context` SQLite database in the workspace; later runs map the stored entries again without reading the exports, even if they have moved. Use `--rereadSource` to read them again. Without `--cacheName`, the workspace is keyed by every export's full path, so different exports never share stored data.

Each `--entries` path is an export zip, read one entry at a time, or a directory. Every `Entry:<id>.json` file in it, at any depth, is stored as an `entry` record keyed by the entry's `uid` (or the file name, for an entry without one); `entries.csv` and other files are not read. An entry that appears more than once, such as in two overlapping exports, keeps the copy with the latest `updatedAt` (the first on a tie) and reports a `source:conflict`. An export without entries, or with an entry file that is not a JSON object, is rejected and keeps any stored data.

Every option applies when the stored records are mapped, so changing `--addPrimaryTag` or `--url` needs no new read. Ghost IDs derive from `--url` and the entry `uid`, tag name or author name, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-chorus';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest(['/path/to/file.zip'], context, {replace: rereadSource});
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

- `ingest(entries, context, {replace})` reads one export path, or an array of them, into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(entries)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map({url, addPrimaryTag}, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `url` is required. `ghostUsers` may be an iterable or async iterable of existing Ghost users; when one has an author's placeholder email, posts keep that user's Ghost ID, slug and roles, and Ghost users' slugs are reserved for them.
- `jsonToHtml(components)` converts an entry's body components to HTML, and the `EntryBody*` functions convert one block each. `entryUrl(entry)` gives an entry's HTTP or HTTPS URL or `null`, and `ghostId(site, kind, key)` the stable Ghost ID `map()` uses.

The previous default export (`(entries, options)`, which read every entry into memory and returned `{posts}` for `toGhostJSON`) and its `processor` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-chorus-file-1700000000000.zip` for `file.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev chorus --entries /path/to/file.zip --url https://example.com
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
