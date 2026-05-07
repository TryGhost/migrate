# Migrate Ghost API

Export content from an existing Ghost installation using the [Admin API](https://docs.ghost.org/admin-api), and generate a `zip` file you can import into a Ghost installation.

Posts are fetched in their native Lexical format and stored in a [mg-context](../mg-context) SQLite database (cached in the migration's tmp dir). The exporter writes chunked `posts.json` / `posts-N.json` files via `MigrateContext.writeGhostJson` so very large sites stay within Ghost's import file size limits. Re-running the same command is idempotent — posts are deduplicated by their Ghost ID via mg-context's `lookupKey`.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-ghost-api --save`

or

`pnpm add @tryghost/mg-ghost-api`


## Usage

To run a Ghost API migration, the required command is:

```sh
migrate ghost --url https://example.com --apikey 1234abcd
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - Ghost API URL
    - string - default: `null`  
- **`--apikey`** (required)
    - Ghost API key
    - string - default: `null`  
- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`-s` `--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `15`
    - Number of items fetched per Ghost Admin API request (fetch batch size)
- **`--postsPerFile`**
    - number - default: `2000`
    - Maximum posts written per output JSON file. Larger sites are split into `posts-1.json`, `posts-2.json`, etc. to keep files at manageable sizes
- **`--posts`**
    - bool - default: `true`
    - Import posts (set to false to skip)
- **`--postFilter`**
    - string - default: `null`
    - A string of post filters, as defined in the Ghost Admin API
- **`--pages`**
    - bool - default: `true`
    - Import pages (set to false to skip)
- **`--pageFilter`**
    - string - default: `null`
    - A string of page filters, as defined in the Ghost Admin API
- **`--cache`**
    - Persist local cache (including the mg-context SQLite DB) after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`--tmpPath`**
    - string - default: `null`
    - Full path where temporary files (cache + mg-context DB) are stored. Defaults to a hidden tmp dir
- **`--outputPath`**
    - string - default: `null`
    - Full path where the final zip file is written. Defaults to CWD
- **`--cacheName`**
    - string - default: `null`
    - Unique name for the cache directory. Defaults to a UUID derived from the URL

A more complex migration command could look like this:

```sh
migrate ghost --url https://example.com --apikey 1234abcd --batch 5 --limit 10 --postFilter 'tag:[news, press]' --pages false --verbose
```

This will get the first 50 posts with the tag `news` or `press`, in 5 batches of 10 posts, exclude pages, and show all available output in the console.

For very large sites, tune `--postsPerFile` to control how the output is chunked:

```sh
migrate ghost --url https://example.com --apikey 1234abcd --postsPerFile 1000
```

See the [Filter documentation](https://docs.ghost.org/content-api/filtering) for more info.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `pnpm dev`, like so:

```sh
pnpm dev ghost --url https://example.com --apikey 1234abcd
```


## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
