# Migrate Libsyn

Migrate content from Libsyn using your sites RSS feed, and generate a `zip` file you can import into a Ghost installation.

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-libsyn --save`

or

`pnpm add @tryghost/mg-libsyn`


## Usage

To run an absolute basic Libsyn migration, the required command is this:

```sh
migrate libsyn --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - URL to Libsyn website
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
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--useFeedCategories`**
    - bool - default: `true`
    - Use the itunes:categories as tags for each post
- **`--useItemKeywords`**
    - bool - default: `true`
    - Use the itunes:keywords as tags for each post
- **`--useEmbed`**
    - bool - default: `true`
    - Use Libsyn embed for audio players. If disabled, audio files will be downloaded and uploaded to Ghost as Audio cards
- **`-s` `--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Download assets
        - `assets`: Download assets (images, media, files)
        - `web`: No effect; Libsyn episodes are not scraped
        - `none`: Skip all scraping tasks
- **`--rereadSource`**
    - Fetch the RSS feed again, replacing the stored source while preserving downloaded assets
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
    - string - default: one based on `--url`
- **`--ghostApiUrl`**, **`--ghostAdminKey`**
    - Match the feed owner to an existing Ghost user by email
    - string - default: `null`


A more complex migration command could look like this:

```sh
migrate libsyn --url https://example.com --useEmbed false --scrape none  --useFeedCategories false --useItemKeywords false
```

This will use Ghost audio cards instead of the Libsyn `<iframe>` embed, not use categories or keyword as tags, and not scrape or save any remote files such as images, audio files, or linked PDFs.


## Output

The import contains HTML; Ghost's importer converts it, so `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics for repeated episodes, skipped episodes, field changes and slug changes. Episodes without a GUID or link, without a valid `pubDate`, or with more than 500 tags are skipped and reported. When every selected episode is invalid, or the run fails, `--report` writes a `.failed-report.json` instead. A feed without episodes migrates successfully.

Each episode becomes a published post titled by its `title` (or `itunes:title`), with the slugified title as its slug, dated by its `pubDate` read as RFC 2822 (such as `Mon, 10 Aug 2020 07:00:00 +0000`). Its HTML is the Libsyn player, or with `--useEmbed false` (or when the episode has no Libsyn ID) a Ghost audio card for the episode's audio file, followed by its description with empty paragraphs removed and nested lists wrapped in HTML cards. Every post is written by the feed owner (`itunes:owner`, then `itunes:author`), using the owner's email or a `<slug>@example.com` placeholder that `--ghostApiUrl`/`--ghostAdminKey` can match to an existing Ghost user; a feed that names neither leaves posts without an author. Its tags are `--addTag`, the feed's iTunes categories and subcategories, the episode's keywords, then `#libsyn`, with internal `#` tags last; tags that share a slug are one tag.

Links to `<url>/<slug>` episode pages are rewritten to the migrated posts.


## Source storage

The first run fetches `<url>/rss/?include-libsyn-metadata=true` and streams it into an `mg-context` SQLite database in the workspace; later runs map the stored feed again without fetching it. Use `--rereadSource` to fetch it again. Without `--cacheName`, the workspace is keyed by `--url`, so different sites get their own workspaces. The feed is no longer cached as a `libsyn_rss.json` file in the workspace.

Each episode is stored as an `item` record keyed `guid:<guid>`, or `link:<link>` when it has no GUID, and every other child of the feed's `<channel>` is stored as one `channel` record. An episode repeated in the feed keeps the copy with the latest `pubDate` and reports a `source:conflict`. The feed URL is recorded in the ingestion metadata.

Every option applies when the stored feed is mapped, so changing `--addTag`, `--useFeedCategories`, `--useItemKeywords` or `--useEmbed` needs no new fetch. Ghost IDs derive from `--url` and the episode key, tag slug or feed owner, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-libsyn';

const url = 'https://example.com';
const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest(url, context, {replace: rereadSource});
    }
    const summary = await map({url, addTag: 'Podcast'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(url, context, {replace})` fetches the feed into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed fetch keeps the previous data.
- `parse(url)` yields the same records as `SourceRecordInput` values while the response streams, without storing them: each `item`, then the `channel`. `feedUrl(url)` gives the feed's URL and `itemKey(item)` an item's key.
- `map(options, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `options` takes `url` (required), `addTag`, and `useFeedCategories`, `useItemKeywords` and `useEmbed`, which default to `true`. `ghostUsers` may be an iterable or async iterable of existing Ghost users; an owner whose email matches keeps that user's Ghost ID, name and slug.
- `processPost(item, options)` returns one episode's title, slug, HTML and tags, `processContent(item, {useEmbed, image})` its HTML, and `processChannel(channel)` the feed's owner, categories and image; `map()` uses all three. `parseDate(value)` reads an RFC 2822 date, and `durationToSeconds(value)` reads an `itunes:duration`.

The previous default export (`fetch.tasks`, which cached the parsed feed in the workspace, and `process.all`, which built an array of posts in memory), `processPosts` and `rssToJson` have been removed. `processPost(item, options)` returns plain fields instead of `{url, data}` and no longer takes the author and feed tags, `processContent` reads only `useEmbed` and `image` from its options, and `useEmbed` defaults to `true` in every function. Requests use `fetch()` instead of `node-fetch`.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:


```sh
pnpm dev libsyn --url https://example.com
```


## Test

- `pnpm test` runs the package tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
