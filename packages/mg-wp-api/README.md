# Migrate WP Api

Export content using the WordPress JSON API, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-wp-api --save`

or

`pnpm add @tryghost/mg-wp-api`


## Usage

To run an absolute basic WordPress migration, the required command is this:

```sh
migrate wp-api --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - Path to a WordPress site
    - string - default: `false`
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`
- **`--onlyURLs`**
    - Path to a CSV file of post URLs that will be the only migrated posts
    - string - default: `null`
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `100`
    - Number of items fetched in a batch i.e. batch size
- **`--maxPosts`**
    - number - default: `0`
    - 'Maximum number of posts to return (defaults to not limit)
- **`-a` `--auth`**
    - string - default: `null`
    - Provide a user and password to authenticate the WordPress API (<user>:<password>)
- **`-u` `--users`**
    - string - default: `null`
    - Provide a JSON file with users. Contents should be a JSON array of objects that match
      the format returned by the Wordpress API, including the following keys:
      "id", "slug", "name", "description", "email" and "url".
- **`--posts**`**
    - boolean - default: `true`
    - Import posts
- **`--pages**`**
    - boolean - default: `true`
    - Import pages
- **`--tags`**
    - boolean - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag slug which should be added to every post in this migration
- **`--featureImage`** 
    - Change which value is used as the feature image
    - string - default: `featuredmedia` 
    - Choices: `featuredmedia`, `og:image`, `none`
- **`--excerpt`**
    - bool - default: `true`
    - Use the excerpt value from WordPress API
- **`--excerptSelector`**
    - string - default: `null`
    - Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`
- **`--featureImageCaption`**
    - bool - default: `true`
    - Include featured image captions
- **`--datedPermalinks`** 
    - Set the dated permalink structure. `/*/` matches any prefix, such as `/articles/2018/05/` or `/blog-posts/2018/05/`
    - string - default: `none` 
    - Choices: `none`, `'/yyyy/mm/'`, `'/yyyy/mm/dd/'`, `'/*/yyyy/mm/'`, `'/*/yyyy/mm/dd/'`
    - NOTE: When using `/*/`, this is only to match existing links. Fixed links will not contain this.
- **`--postsBefore`** 
    - Only migrate posts before and including a given date e.g. 'March 20 2018'
    - string - default: `null`
- **`--postsAfter`** 
    - Only migrate posts after and including a given date e.g. 'August 16 2023'
    - string - default: `null`
- **`--cpt`** 
    - A comma-separated list of custom post type REST routes e.g. `resources,newsletters`
    - array - default: `null`
- **`--rawHtml`** 
    - Don't process HTML and wrap in a HTML card
    - bool - default: `false`
- **`--removeSelectors`**
    - `Pass in a string of CSS selectors for elements that will be removed, e.g. '.ads, script[src*="adnetwork.com"]'`
    - string - default: `null`
- **`--convertLibsynEmbed`**
    - bool - default: `false`
    - Convert Libsyn iframe embeds to audio cards
- **`--trustSelfSignedCert`** 
    - Trust self-signed certificates (such as for local installs)
    - bool - default: `false`
- **`--rereadSource`**
    - Fetch the WordPress API again, replacing the stored source while preserving downloaded assets
    - bool - default: `false`
- **`--postsPerFile`**
    - Maximum posts written per Ghost import JSON file
    - number - default: `2000`
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`--cacheName`**
    - Provide a unique name for the cache directory
    - string - default: the site URL

A more realistic command for a WordPress migration looks like this:

```sh
migrate wp-api --url https://example.com --auth person:pa55w0rd --addTag 'From old site' --limit 10 --batch 5
```

This will fetch the fifth page of 10 posts, with every user (including email addresses when authenticated), and add the tag 'From old site'.

```sh
migrate wp-api --url https://example.com --scrape web
```

This will fetch all posts, and only scrape web metadata (no asset downloading)

### Only get a specific set of posts:

```sh
migrate wp-api --url https://example.com --onlyURLs /path/to/urls.csv
```

The CSV should look like this:

```csv
url
https://example.com/2023/03/02/my-article
https://example.com/2023/03/01/another-article
```


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each. A `.report.json` beside the ZIP lists imported and skipped counts with diagnostics for source conflicts, skipped records, field changes, slug changes and optional scraping failures. When every selected item is invalid, or the run fails, a `.failed-report.json` is written instead.


## Source storage

The first run stores the API responses; later runs map the stored responses again without fetching. Use `--rereadSource` to fetch again.


The API responses are stored as JSON source records in an `mg-context` SQLite database, then mapped into Ghost posts, pages, tags and authors on every run. Posts, pages and custom post types are `content` records and users are `user` records, each keyed `<type>:id:<n>` (for example `post:id:12` or `user:id:3`). A users file supplied with `--users` replaces the users endpoint; its users are keyed by ID, falling back to `user:slug:<slug>`. When paging returns the same object twice, the most recently modified version is kept and a `source:conflict` diagnostic records the replacement.

What is fetched and what is mapped are separate:

- **The fetch** always requests posts, pages and users, plus the `--cpt` routes. `--postsBefore` and `--postsAfter` are sent to the API, and `--maxPosts` and `--batch` fetch only the pages they need. With `--batch`, each posts, pages or custom post type page is one batch, and every user page is always fetched so authors stay complete.
- **The map** applies `--posts`, `--pages`, `--cpt`, `--maxPosts`, `--onlyURLs`, `--addTag` and every content option to the stored records, so changing them needs no new fetch. Narrowing works on stored data; widening a fetch option (a later `--postsAfter`, a larger `--maxPosts`, another `--cpt` route) needs the source fetched again.

Ghost IDs derive from the site, entity kind and source key, so they stay the same across remapping. Tags are identified by their WordPress taxonomy and term ID; distinct terms that want the same slug get deterministic suffixes. Authors are identified by WordPress user ID, or by co-author term slug or Parse.ly name when no user exists. Authors whose email matches an existing Ghost user keep that user's Ghost ID.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, scraping, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-wp-api';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const refetch = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || refetch) {
        await ingest('https://example.com', context, {
            replace: refetch,
            limit: 100,
            onProgress: title => console.log(title)
        });
    }
    const summary = await map({posts: true, pages: true, tags: true}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(url, context, options)` fetches the API one page at a time inside `context.sources.ingest()`. Options are `replace`, `batch`, `limit`, `cpt`, `postsBefore`, `postsAfter`, `maxPosts`, `apiUser` (`{username, password}`), `usersJSON`, `trustSelfSignedCert` and `onProgress(title)`. Explicit `replace: true` is required when completed source data exists.
- `parse(url, options)` yields the same records as `SourceRecordInput` values, page by page, without storing them.
- `map(options, context, {fileCache?, ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `ghostUsers` may be an iterable or async iterable of existing Ghost users to match by email. Records with invalid dates or URLs, or more than 500 tags or authors, are skipped with a `record:skipped` diagnostic.
- `sourceSite(context)` returns the stored site URL.
- `fetch.tasks(url, ctx)` returns one task per API page for callers that run their own task list. Each task writes into `ctx.sourceIngestion`, so run them inside `context.sources.ingest()`.
- `fetch.discover(url, options)` returns the totals and page counts that `--info` reports.

`processShortcodes`, `processContent` and `processExcerpt` are also exported and are shared with `@tryghost/mg-wp-xml`.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev wp-api <url>
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
