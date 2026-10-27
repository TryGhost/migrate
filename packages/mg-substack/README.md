# Migrate Substack `zip` Export

Converts a Substack `zip` export and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-substack --save`

or

`pnpm add @tryghost/mg-substack`


## Usage

To run basic Substack migration, the required command is this:

```sh
migrate substack --pathToZip /path/to/my-export.zip --url https://example.com
```

A more complex command for a Substack migration looks like this:

```sh
migrate substack --pathToZip /path/to/my-export.zip --url https://example.com --email 'person@example.com' --useMetaAuthor false --drafts false
```

```sh
migrate substack --pathToZip /path/to/my-export.zip --url https://example.com --posts false --pages false --podcasts false --threads true
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a zip file
    - string - default: `null`
- **`--url`** (required)
    - Site URL
    - string - default: `null`  
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
- **`-e` `--email`** 
    - Provide an email for users e.g. `person@example.com` to create a general user with slug `person` (Is ignored unless `--useMetaAuthor false` is provided)
    - string - default: `null`
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration (Wrap in single quotes if tag name has spaces `'Like This'`)
- **`--addPlatformTag`** 
    - Add #substack tag to migrated content
    - bool - default: `true`
- **`--addTypeTag`** 
    - Add #substack-{type} tag to migrated content (post, podcast, etc)
    - bool - default: `true`
- **`--addAccessTag`** 
    - Add #substack-{access} tag to migrated content (public, paid, etc)
    - bool - default: `true`
- **`--posts`** 
    - Import posts
    - bool - default: `true`
- **`--drafts`** 
    - Import draft posts
    - bool - default: `true`
- **`--pages`** 
    - Import pages
    - bool - default: `true`
- **`--podcasts`** 
    - Import podcasts
    - bool - default: `true`
- **`--threads`** 
    - Import threads
    - bool - default: `false`
- **`--subscribeLink`** 
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--noSubscribeButtons`** 
    - Remove subscribe buttons and links from content (no replacement link)
    - bool - default: `false`
- **`--comments`** 
    - Keep comment buttons
    - bool - default: `true`
- **`--commentLink`** 
    - Provide a path that existing `/comments` anchors will link to e.g. `#ghost-comments-root` (`#` characters need to be escaped with a `\`)
    - string - default: `#ghost-comments-root`
- **`--useMetaImage`** 
    - Use `og:image` value as the feature image
    - bool - default: `true`  
- **`--useFirstImage`** 
    - Use the first image in content as the feature image (useMetaImage takes priority)
    - bool - default: `true`  
- **`--useMetaAuthor`** 
    - Use the author field from `ld+json` (useful for posts with multiple authors)
    - bool - default: `true`  
- **`--postsBefore`** 
    - Only migrate posts before and including a given date e.g. 'March 20 2018'
    - string - default: `null`
- **`--postsAfter`** 
    - Only migrate posts after and including a given date e.g. 'August 16 2023'
    - string - default: `null`
- **`--wait_after_scrape`**
    - Time in ms to wait after a URL is scraped
    - number - default: `2000`
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
    - Match the `--email` author to an existing Ghost user by email
    - string - default: `null`

**Note**: You can combine `--postsBefore` and `--postsAfter` to migrate posts between 2 dates.


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for duplicate rows, skipped posts, field changes, slug changes and optional scraping failures. Posts with an invalid date, or without an HTML file in the export, are skipped and reported. When every selected post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. An intentionally empty selection succeeds.


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace; later runs map the stored export again without reading the zip, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so exports that share a file name do not share stored data.

Each row of `posts.csv` is stored as a `post` record keyed by its `post_id` (such as `123401.plain-text`), and each `posts/*.html` file as an `html` record keyed by its file name. The zip is read one entry at a time, and may hold its files inside a single top-level directory. A `post_id` or file name that appears twice keeps its first record and reports a `source:conflict`.

Every option applies when the stored records are mapped, so changing a filter, tag, author or content option needs no new read. Mapping joins each row to its HTML file and follows the order of `posts.csv`. Ghost IDs derive from `--url` and the `post_id`, tag slug or author, so they stay the same across runs. Posts that were never given a date are dated when the export was read, so their dates also stay the same across runs.

Web scraping happens after mapping. For each published post, the scraped metadata, the section and post tags (placed before the other tags) and, with `--useMetaAuthor`, the ld+json authors are applied to the mapped post, and its HTML is converted again from the stored export with the scraped `og:image` and podcast audio. Scraped pages are cached in the workspace.


## Programmatic API

The package exports `parse`, `ingest`, `map` and `applyScrapedData` for use with `@tryghost/mg-context`. The caller owns the context, scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-substack';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/export.zip', context, {replace: rereadSource});
    }
    const summary = await map({url: 'https://example.substack.com', drafts: false}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(pathToZip, context, {replace})` reads the export into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data. An export without `posts.csv` is rejected.
- `parse(pathToZip)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options.url` is required; the other options are the CLI's, with the CLI's defaults. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an `email` author whose email matches keeps that user's Ghost ID.
- `applyScrapedData(post, scraped, context, options)` applies post-processed scrape results to a mapped post, as the CLI's scrape step does. The caller saves the post.
- `postUrl(row, url)` returns a `posts.csv` row's public URL, and `contentStats(pathToZip)` counts the export's post HTML files.
- `processContent`, `getImageDimensions` and `largeImageUrl` convert Substack HTML and image URLs.

The previous default export (`ingest(ctx)` and `process(input, ctx)`, which built arrays of posts in memory) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-substack-my-export-1700000000000.zip`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev substack <pathToZip>
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
