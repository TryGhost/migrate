# Migrate Tiny News

Migrate content from Tiny News using its JSON exports, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-tinynews --save`

or

`pnpm add @tryghost/mg-tinynews`


## Usage

To run a Tiny News migration, the required command is:

```sh
migrate tinynews --url https://example.com --articles /path/to/articles.json
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--articles`** (required)
    - Path to the articles JSON file, an array of articles
    - string - default: `null`
- **`--url`** (required)
    - URL to the live site. It scopes the stable Ghost IDs and gives newsletters their old URLs
    - string - default: `null`
- **`--pages`**
    - Path to the pages JSON file, an array of pages
    - string - default: `null`
- **`--newsletters`**
    - Path to the newsletters JSON file, with editions in `data.newsletter_editions`
    - string - default: `null`
- **`--authors`**
    - Path to the authors JSON file, with authors in `data.authors`
    - string - default: `null`
- **`--scrape`**
    - Configure scraping tasks
    - array - default: `all`
    - Choices: `all`, `web`, `assets`, `none` (and `img`, `media`, `files`, aliases of `assets`)
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape each published item's description and Open Graph and Twitter titles and descriptions from its page on the live site
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`--wait_after_scrape`**
    - Time in ms to wait after a URL is scraped
    - number - default: `200`
- **`--rereadSource`**
    - Read the JSON files again, replacing the stored source
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
    - string - default: one based on the input files' full paths
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

A more complete migration command could look like this:

```sh
migrate tinynews --url https://example.com --articles /path/to/articles.json --pages /path/to/pages.json --newsletters /path/to/newsletters.json --authors /path/to/authors.json
```

This will get all articles, pages, newsletters and authors.


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each.

Articles become posts and pages become pages, from their first translation: its headline (trimmed; `(Untitled)` when it has none), published or draft status, search title and description (also the excerpt), Facebook and Twitter titles and descriptions, and main image (its alt text is also the caption; a page's `mainImage` content block takes precedence). Content blocks become HTML: text, headings, quotes, rules, lists and images, and Twitter, TikTok, Facebook, Vimeo, YouTube, Apple Podcasts, Spotify, Instagram and Google Docs embeds. A block that cannot be converted, such as another embed, is left out and reported as a warning. Articles with a Facebook post embed load Facebook's SDK in their code injection. Dates are `first_published_at` (or `last_published_at`) and `last_published_at`; a timestamp without a timezone is read as UTC, and a draft without either is dated when the export was read.

Newsletter editions become published posts with their headline, subheadline as the excerpt, cleaned HTML in one HTML card (without the "Made with Letterhead" link or empty paragraphs), and `newsletter_published_at` (or `newsletter_created_at`) as the published date. Their old URL is `<url>/newsletters/<slug>`.

An article's or page's author is its first author, with the email, photo and bio of the author with the same first names and last name in the authors file when there is one. Without an author, it is the person in its translation's `created_by_email` (named after the email's local part), then the only author in the authors file, then a default "Author". Newsletters are by "Newsletter". Authors have the Contributor role and, without an email, a `<slug>@example.com` placeholder. Authors are identified by email, or by name when they have none, so names whose slugs collide get distinct slugs and placeholder emails (`jane-doe`, `jane-doe-2`).

An article's tags are its category, its tags and `#tinynews`; newsletters are tagged `#newsletter` and `#tinynews`. An unpublished category or tag becomes an internal `#` tag with a `hash-` slug, and internal tags come last. Tags are identified by slug. Links between migrated articles, pages and newsletters point at their new paths.

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Items without an ID or slug or without a translation, published items without a valid date, and items with more than 500 tags are skipped and reported, and a page that cannot be scraped is reported as a warning. When every item is invalid, or the run fails, `--report` writes a `.failed-report.json` instead.


## Source storage

The first run stores the JSON files in an `mg-context` SQLite database in the workspace; later runs map the stored items again without reading the files, even if they have moved. Use `--rereadSource` to read them again, such as after adding `--pages`, `--newsletters` or `--authors` to a run with `--cacheName`. Without `--cacheName`, the workspace is keyed by the full path of every input file, so a different set of files never shares stored data.

Each file is read one item at a time, so a large articles export is never held in memory. Articles, pages and newsletter editions are stored as `post` records keyed by `article:id:<id>`, `page:id:<id>` and `newsletter:id:<id>` (or `<type>:slug:<slug>` without an ID), and authors as `author` records keyed by `id:<id>` (or `name:<name>`). An item that appears more than once keeps the most recently published copy (the first on a tie) and reports a `source:conflict`. A file with malformed JSON, without its array, or with an item that is not a JSON object is rejected and keeps any stored data. An empty articles array is a valid, empty export.

Every option applies when the stored records are mapped, so changing `--url` needs no new read. Ghost IDs derive from `--url` and the item key, tag slug or author email or name, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-tinynews';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest(
            {articles: '/path/to/articles.json', pages: '/path/to/pages.json', authors: '/path/to/authors.json'},
            context,
            {replace: rereadSource}
        );
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

- `ingest({articles, pages, newsletters, authors}, context, {replace})` reads the given files into `context.sources` inside `context.sources.ingest()`. `articles` is required. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data.
- `parse(input)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map({url}, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `url` is required. `ghostUsers` may be an iterable or async iterable of existing Ghost users; when one has an author's email, posts keep that user's Ghost ID, slug and roles, and Ghost users' slugs are reserved for them.
- `sourceUrl({url}, record)` gives a stored item's URL on the live site, or `null`. `ghostId(site, kind, key)` gives the stable Ghost ID `map()` uses.
- `processArticle()`, `processNewsletter()`, `processNewsletterContent()`, `articleTags()`, `personAuthor()` and `emailAuthor()` convert one item's parts. `jsonToHtml(blocks, {onUnhandled})` converts content blocks to HTML, calling `onUnhandled(reason, block)` for each block it leaves out, and the `Entry*` functions convert one block each.

The previous default export (`({options})`, which read every file into memory and returned `{posts}` for `toGhostJSON`) and `mapContent()`/`mapPostPageConfig()` have been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path. The uploaded ZIP is named like the local one, such as `gh-tinynews-articles-1700000000000.zip` for `articles.json`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev tinynews --url https://example.com --articles /path/to/articles.json
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
