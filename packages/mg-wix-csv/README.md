# Wix CSV Migration

Migrate Wix blog posts from a posts CSV export into a Ghost import file.

## Usage

```bash
migrate wix-csv --posts /path/to/posts.csv --url https://example.com
```

By default, the command reads posts, converts Wix rich content to HTML, downloads Wix-hosted assets, and writes a Ghost import zip.

## Options

| Option                  | Type    | Default  | Description                                                                                                         |
|-------------------------|---------|----------|---------------------------------------------------------------------------------------------------------------------|
| `--posts`               | string  | `null`   | Path to the Wix posts CSV file. Required.                                                                           |
| `--url`                 | string  | `null`   | URL to the live Wix site, used for source URLs, link fixing and stable Ghost IDs. Required.                         |
| `--defaultAuthorName`   | string  | `null`   | Fallback author name when the CSV row has no author.                                                                |
| `--scrape`              | array   | `assets` | Asset scraping mode. Use `assets`, `img`, `media`, or `files` to download assets; use `none` to skip.               |
| `--includeMainCategory` | boolean | `true`   | Include the `Main Category` column as Ghost tags. Note: option name intentionally matches the current CLI spelling. |
| `--includeCategories`   | boolean | `true`   | Include the `Categories` column as Ghost tags. Supports plain category names and legacy JSON arrays.                |
| `--includeTags`         | boolean | `true`   | Include the `Tags` column as Ghost tags.                                                                            |
| `--rereadSource`        | boolean | `false`  | Read the posts CSV again, replacing the stored source while preserving downloaded assets.                           |
| `--postsPerFile`        | number  | `2000`   | Maximum posts written per Ghost import JSON file.                                                                   |
| `--tmpPath`             | string  | `null`   | Full path for temporary migration files. Defaults to the migrator cache location.                                   |
| `--outputPath`          | string  | `null`   | Full path where the final zip should be saved. Defaults to the current working directory.                           |
| `--cacheName`           | string  | `null`   | Custom cache name. Defaults to one based on the CSV's full path.                                                    |
| `--cache`               | boolean | `true`   | Keep the local cache after migration completes. Only applies when `--zip` is enabled.                               |
| `--zip`                 | boolean | `true`   | Create a Ghost import zip. Set to `false` to write only the import JSON/cache output.                               |
| `--report`              | boolean | `false`  | Write a `.report.json` migration report beside the import, or a `.failed-report.json` if the run fails.             |
| `-V`, `--verbose`       | boolean | `false`  | Show verbose output. Defaults to `true` when `DEBUG` is set.                                                        |
| `--veryVerbose`         | boolean | `false`  | Show very verbose output. Implies `--verbose`.                                                                      |
| `--ghostApiUrl`         | string  | `null`   | Ghost site URL used to fetch existing users for author matching.                                                    |
| `--ghostAdminKey`       | string  | `null`   | Ghost Admin API key used with `--ghostApiUrl`.                                                                      |

## Taxonomy

The migrator always adds the internal source tag `#wix`, after the post's other tags.

CSV taxonomy fields are controlled independently:

```bash
migrate wix-csv --posts /path/to/posts.csv --url https://example.com --includeMainCategory false --includeCategories true --includeTags false
```

For updated Wix CSV exports, `Categories` may contain readable names such as `Tax Planning`. Older exports may contain JSON arrays of IDs. The migrator accepts both formats. Tags are identified by slug, so values that share a slug are one Ghost tag, named by the first value seen.

## Content Notes

- `Rich Content` is used as the source of post body HTML.
- `Plain Content` is used as fallback content when `Rich Content` is empty or invalid.
- `Internal ID` is mapped to Ghost `comment_id`.
- Wix image URLs are converted to original static media URLs, for example `https://static.wixstatic.com/media/<media-id>`. Asset scraping downloads these from `static.wixstatic.com`, in the post body as well as cover images.
- A row with a `Published Date` is published; one without is a draft. A post is dated by its `Published Date`, falling back to its `Last Published Date`; a timestamp without a timezone is read as UTC. A draft with neither date is dated when the CSV was read, so its date stays the same until `--rereadSource`. `updated_at` is the `Last Published Date` when there is one.
- Authors are identified by name: names that share a slug are one author, with a `<slug>@example.com` email. A row without an `Author` uses `--defaultAuthorName`, or `Author`. With `--ghostApiUrl` and `--ghostAdminKey`, an author whose email matches an existing Ghost user becomes that user.

## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` is not used. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. Links between posts (`<url>/<Post Page URL>`) are rewritten to the imported posts.

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Rows without an `ID`, `Post Page URL` or `Slug`, published rows with neither a valid `Published Date` nor a valid `Last Published Date`, and posts with more than 500 tags are skipped and reported. When every selected row is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. A CSV without rows succeeds with an empty import.

## Source storage

The first run stores the CSV in an `mg-context` SQLite database in the workspace; later runs map the stored rows again without reading the CSV, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the CSV's full path, so CSVs that share a file name do not share stored data.

The CSV is read one row at a time. Each row is stored as a `post` record keyed by its `ID` (`id:<ID>`), or by its `Post Page URL` (`url:<path>`) or `Slug` (`slug:<slug>`) when it has no `ID`. A post that appears more than once keeps its most recently published row (the first on a tie) and reports a `source:conflict`.

Every option (`--url`, `--defaultAuthorName`, `--includeMainCategory`, `--includeCategories`, `--includeTags`) applies when mapping, so changing one needs no new read. Ghost IDs derive from `--url` and the row's key, or the tag or author slug, so they stay the same across runs.

## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, asset scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-wix-csv';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/posts.csv', context, {replace: rereadSource});
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

- `ingest(pathToCsv, context, {replace})` reads the CSV into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(pathToCsv)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map(options, context, {ghostUsers})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options.url` is required. `ghostUsers` is an optional (async) iterable of existing Ghost users, such as `streamGhostUsers()` from `@tryghost/mg-ghost-authors`, to match authors by email.
- `processRow(row, options)` converts one CSV row to Ghost post fields, dates, tags and author name, `richContentToHtml()` converts Wix rich content, and `ghostId(site, kind, key)` gives the stable Ghost ID `map()` uses.

The previous default export (`({options})`, which built an array of posts in memory) and `mapContent()` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-wix-csv-posts-1700000000000.zip`.


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
