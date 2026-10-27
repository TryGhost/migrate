# Migrate WordPress XML

Convert a WordPress XML export, or a folder of exports from one site, into a Ghost import containing HTML posts and downloaded assets.

```sh
migrate wp-xml --pathToFile /path/to/export.xml
migrate wp-xml --pathToFile /path/to/exports --pages false --addTag News
```

Files must contain one well-formed XML document each. Folders are searched recursively for `.xml` files in sorted order. Concatenated documents, malformed XML, and mixed-site exports fail with source details. Posts can reference authors and attachments appearing later or in other files.

## Source storage and reruns

The workspace stores the original parsed WordPress fields as JSON in an `mg-context` SQLite database. Every run remaps those records using the current code and options; changes to filters, shortcode handling, featured images, tags, or author matching do not require rereading the XML.

The runner reuses completed source data without comparing paths, hashes, revisions, or mapping options. To read changed input, explicitly replace the stored source:

```sh
migrate wp-xml --pathToFile /path/to/exports --rereadSource
```

Rereading preserves downloaded assets. Failed or interrupted ingestion discards staged input and restarts on the next attempt. Failed replacement preserves the previous completed source and mapped result. A valid empty export can complete ingestion; an empty mapping selection also succeeds.

Post and attachment identity uses WordPress ID, falling back to absolute source URL. Overlapping records use the newest modification timestamp, with first sorted-file occurrence retained for ties or missing timestamps. Author conflicts retain the first definition. Generated Ghost IDs derive from the site, entity kind, and stable source key; they survive remapping and rereading while those keys stay the same. Destination authors matched by email retain their existing Ghost IDs. Distinct source authors and taxonomy terms receive separate Ghost identities and deterministic slug suffixes when their desired slugs collide.

## Output and failures

`--postsPerFile` defaults to **2000**. A small migration writes `ghost-import.json`; larger migrations write `ghost-import-1.json`, `ghost-import-2.json`, and so on. The ZIP contains these files and assets. With `--zip false`, the unpacked import stays in the workspace import directory.

With `--report`, a durable `.report.json` file is written beside the final ZIP, or beside the unpacked import directory when ZIP creation is disabled. It contains imported/skipped counts and streamed diagnostics for source conflicts, skipped records, field normalization, slug changes, and optional scraping failures. It survives `--cache false`.

Known record-data errors are skipped and reported. A partially successful import succeeds with warning counts; an import where every selected record is invalid fails, and with `--report` writes a `.failed-report.json`. An intentionally empty selection succeeds. XML structure errors, unexpected code errors, and storage/export failures abort the migration. Failed runs retain their workspace and recovery files.

HTML replaces the old Lexical output stage. `--fallBackHTMLCard` has been removed; `--rawHtml` remains available. Ghost schema limits and normalization come from `mg-context`.

## Options

| Option | Default | Purpose |
| --- | --- | --- |
| `--pathToFile` | required | XML file or folder |
| `--rereadSource` | `false` | Ingest replacement source data |
| `--postsPerFile` | `2000` | Positive maximum posts per import JSON file |
| `--zip` | `true` | Create a Ghost import ZIP |
| `--report` | `false` | Write a `.report.json`, or a `.failed-report.json` if the run fails |
| `--scrape` | `all` | `all`, `web`, `assets`, or `none`; legacy `img`, `media`, and `files` aliases remain |
| `--drafts`, `--pages`, `--posts`, `--tags` | `true` | Select content; disabling tags retains categories |
| `--cpt` | unset | Additional WordPress post types |
| `--customTaxonomies` | unset | Additional taxonomies to import as tags |
| `--addTag` | unset | Add a tag to every imported post |
| `--postsBefore`, `--postsAfter` | unset | Publication-date filters |
| `--datedPermalinks` | `none` | Retain the chosen date structure when rewriting links |
| `--excerpt` | `true` | Use WordPress excerpts |
| `--excerptSelector` | unset | Extract an excerpt from matching content |
| `--featureImageCaption` | `true` | Include attachment captions |
| `--rawHtml` | `false` | Wrap content in an HTML card |
| `--removeSelectors` | unset | Remove matching HTML elements |
| `--convertLibsynEmbed` | `false` | Convert Libsyn embeds to audio cards |
| `--ghostApiUrl`, `--ghostAdminKey` | unset | Match existing Ghost authors by email |
| `--cache` | `true` | Retain workspace after successful ZIP delivery |
| `--tmpPath`, `--cacheName` | automatic | Choose the workspace |
| `--outputPath` | current directory | ZIP/report delivery directory |
| `--verbose`, `--veryVerbose` | `false` | Additional CLI output |

## Programmatic API — breaking change

The previous default function returning posts/users arrays has been removed. Callers own context initialization, optional scraping/link processing, export, and closure.

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-wp-xml';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.xml', context, {replace: rereadSource});
    }
    const summary = await map({pages: true, posts: true, drafts: true}, context);
    for await (const file of context.writeGhostJsonStream('./output', {
        filename: 'ghost-import', batchSize: 2000
    })) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

`map(options, context, {fileCache?, ghostUsers?})` accepts optional migration services. `ghostUsers` may be an iterable or async iterable; destination users are indexed on disk. `contentStats(pathOrInput)` streams counts of WordPress posts and pages. `inspectSource(path)` discovers sorted XML files without reading or hashing their contents. `parse(pathOrInput)` yields original parsed records as `SourceRecordInput` values for callers that manage ingestion themselves; `ingest` handles WordPress duplicate selection inside `context.sources.ingest`. Explicit replacement is required when completed data exists. Originals and ingestion metadata remain immutable after completion.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` now requires a Node readable stream as `body`, for the ZIP and, with `--report`, the report. It must consume that stream before resolving to the remote path string. Both local files remain available until both uploads succeed. If the report upload fails after ZIP upload, the remote ZIP may already exist; the local files remain available for retry. The runner exposes separate `outputFile` and `reportFile` descriptors, plus `recoveryFile` on upload failure. With ZIP disabled, `outputFile` describes the import directory. The runner owns `ghost-import*.json` and legacy WordPress JSON filenames in that directory; it stages each export and replaces those files only after the complete JSON export and report succeed. Other files and downloaded assets are retained.

## Development

Use the repository's pinned Node version and pnpm:

```sh
pnpm install
pnpm --filter @tryghost/mg-wp-xml test:local
pnpm --filter @tryghost/mg-wp-xml test:stress
pnpm lint
```

The stress run generates 100,000 posts with 10 KiB bodies, unique authors/tags, collisions, diagnostics, ZIP creation, and stream-consuming upload checks. It uses a 256 MiB JavaScript heap and requires peak RSS below 512 MiB. `MG_WP_STRESS_POSTS` can reduce the count for a local pilot. Successful runs remove generated data; failed runs print its retained location.
