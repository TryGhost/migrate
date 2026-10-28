# Migrate Jekyll Export

Migrate content from Jekyll using a zip (or directory) of the site, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-jekyll-export --save`

or

`pnpm add @tryghost/mg-jekyll-export`


## Usage

To run a Jekyll migration, the required command is:

```sh
migrate jekyll --pathToZip /path/to/site.zip --url https://example.com
```

The zip, or the directory passed instead, should have a structure like:

```
_posts/
├── 2020-10-27-my-post.md
├── 2021-05-19-another-post.markdown
└── 2023-06-03-newest-post.html
_drafts/
└── some-draft.md
```

The site may also sit in one directory at the top of the zip, and a zip of the `_posts` directory alone works too.

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a Jekyll site zip, or the site directory, holding `_posts/` and `_drafts/`
    - string - default: `null`
- **`-u` `--url`** (required)
    - URL to the live site. It makes root-relative links and images absolute, gives each post its old URL for scraping and link rewriting, and scopes the stable Ghost IDs
    - string - default: `null`
- **`-s` `--scrape`**
    - Configure scraping tasks
    - array - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from each published post's page on the live site
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`-e` `--email`**
    - Provide an email domain for authors' placeholder emails, e.g. `example.com`
    - string - default: `false` (`example.com`)
- **`--addTags`**
    - Provide one or more comma-separated tag names which should be added to every post in this migration.
      This is in addition to a `#jekyll` tag, which is always added.
    - string - default: `null`
- **`--datedPermalinks`**
    - The dated permalink structure of the live site. Posts' old URLs include the date, and links to them are rewritten to dated paths, such as `/2021/08/23/my-post/`
    - string - default: `none`
    - Choices: `none`, `/yyyy/mm/`, `/yyyy/mm/dd/`
- **`--rereadSource`**
    - Read the export again, replacing the stored source while preserving downloaded assets
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
    - Match authors to existing Ghost users by their placeholder email
    - string - default: `null`

A more complex migration command could look like this:

```sh
migrate jekyll --pathToZip /path/to/site.zip --url https://example.com --email example.com --addTags "Blog, #imported"
```

This will process all posts from the zip file, give all authors an email address ending in `example.com`, and add the `Blog` and `#imported` tags to every post.


## Output

The import contains HTML; Ghost's importer converts it. `--fallBackHTMLCard` has been removed. A small migration writes `ghost-import.json`, and larger ones write `ghost-import-1.json`, `ghost-import-2.json` and so on, `--postsPerFile` posts each.

Each `.md` or `.markdown` file is rendered from Markdown (raw HTML in it is kept), and each `.html` file is kept as it is. Root-relative links and image sources become absolute URLs on `--url`'s origin, and a paragraph inside a list item is unwrapped. Links to other posts in the migration point at their new paths.

A post's slug is its front matter `basename`, or its file name without the date and extension (`my-post` for `2021-08-23-my-post.md`), slugified. Its title is the front matter `title`, or `(Untitled)`. Files in `_drafts/`, and posts with `published: false`, are drafts. A post's date is its front matter `date` (Jekyll's `YYYY-MM-DD HH:MM:SS +/-TTTT`; the time, seconds and offset are optional, and a date without an offset is read as UTC), or the date in its file name when the front matter has none or an invalid one. It is used as the created, published and updated date. A draft without either is dated when the export was read; a published post without either is skipped.

A post's authors are its front matter `author` names (a name or a list), each with a `<slug>@<--email>` placeholder email and the Contributor role; a post without one gets the Example User (`exampleuser@example.com`). Authors with the same placeholder email are one user. Its tags are its `category` and `categories` (as `category-<slug>` tags, first so the first category is the primary tag), then `tag` and `tags` (a list, or space-separated names), then `--addTags`. Internal `#` tags come last: a `#<directory>` tag for a post in a subdirectory of `_posts/` or `_drafts/`, `#jekyll`, and any `#` tags from `--addTags`. Tags with the same slug are one tag.

With `--report`, a `.report.json` beside the ZIP (or in the workspace when `--zip false`) lists imported and skipped counts with diagnostics. Posts without a valid date, or whose front matter is not valid YAML, are skipped and reported, and a page that cannot be scraped is reported as a warning. When every post is invalid, or the run fails, `--report` writes a `.failed-report.json` instead.


## Source storage

The first run stores the export in an `mg-context` SQLite database in the workspace; later runs map the stored posts again without reading the export, even if it has moved. Use `--rereadSource` to read it again. Without `--cacheName`, the workspace is keyed by the export's full path, so different exports never share stored data.

The zip is read one entry at a time. Every `.md`, `.markdown` or `.html` file in `_posts/` or `_drafts/`, at any depth, is stored unparsed as a `post` record keyed by its path from the site root, such as `_posts/2021-08-23-my-post.md`; other files are not read. An export without posts is rejected and keeps any stored data.

Front matter and Markdown are parsed when the stored posts are mapped, and every option applies then, so changing `--url`, `--email`, `--addTags` or `--datedPermalinks` needs no new read. Ghost IDs derive from `--url` and the post's path, tag slug or author email, so they stay the same across runs.


## Programmatic API

The package exports `parse`, `ingest` and `map` for use with `@tryghost/mg-context`. The caller owns the context, export and closure:

```js
import {MigrateContext} from '@tryghost/mg-context';
import {ingest, map} from '@tryghost/mg-jekyll-export';

const context = new MigrateContext({dbPath: './migration.sqlite'});
const rereadSource = process.argv.includes('--rereadSource');
await context.init();
try {
    if (!context.sources.hasCompletedIngestion || rereadSource) {
        await ingest('/path/to/site.zip', context, {replace: rereadSource});
    }
    const summary = await map({url: 'https://example.com', addTags: 'Blog'}, context);
    for await (const file of context.writeGhostJsonStream('./output', {filename: 'ghost-import'})) {
        // Consume one file descriptor at a time.
    }
    await context.writeMigrationReport('./migration.report.json', summary);
} finally {
    await context.close();
}
```

- `ingest(input, context, {replace})` reads a site zip or directory into `context.sources` inside `context.sources.ingest()`. Explicit `replace: true` is required when completed source data exists; a failed read keeps the previous data. A path that appears twice in a zip keeps its first copy and reports a `source:conflict`.
- `parse(input)` yields the same records as `SourceRecordInput` values, one at a time, without storing them.
- `map({url, email, addTags, datedPermalinks}, context, {ghostUsers?})` rebuilds mapped content and returns `{selected, imported, skipped}`. `url` is required. `ghostUsers` may be an iterable or async iterable of existing Ghost users; when one has an author's placeholder email, posts keep that user's Ghost ID, slug and roles, and Ghost users' slugs are reserved for them.
- `processPost(path, contents, {url, addTags})` reads one post file into its slug, title, status, date, HTML, author names and tags; `parseFrontMatter(contents)`, `parseDate(value)` and `processHtml(html, url)` are its parts. `postUrl(options, post)` and `sourceUrl(options, record)` give a post's URL on the live site, and `ghostId(site, kind, key)` the stable Ghost ID `map()` uses.

The previous default export (`(pathToZip, options)`, which read every post into memory and returned `{posts}` for `toGhostJSON`) has been removed.

The CLI's programmatic `outputStorage.upload({body, fileName, size})` receives a Node readable stream as `body`, for the ZIP and, with `--report`, the report, and must consume it before resolving to the remote path.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev jekyll --pathToZip /path/to/site.zip --url https://example.com
```


## Test

- `pnpm test:local` builds the package and runs its tests with 100% coverage
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
