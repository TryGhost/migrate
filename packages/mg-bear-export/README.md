# Migrate Bear Blog Export

Migrate content from [Bear Blog](http://bearblog.dev/) using the supplied CSV file, and generate a `zip` file you can import into a Ghost installation.

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-bear-export --save`

or

`yarn add @tryghost/mg-bear-export`

## Usage

To run a Bear Blog migration, the required command is:

```sh
migrate bear --pathToFile /path/to/export.csv
```

The CSV file should contain the following required columns:
- `title` - Post title
- `slug` - URL slug
- `published date` - Publication date (ISO 8601 format preferred)
- `content` - Post content in Markdown format

Optional columns include:
- `first published at` - First publication date (falls back to `published date`)
- `all tags` - Tags in format `[tag1, tag2, tag3]`
- `publish` - Publication status (`True` for published, `False` for draft)
- `is page` - Content type (`True` for page, `False` for post)
- `meta description` - SEO description
- `meta image` - Featured image URL

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToFile`** (required)
    - Path to a Bear Blog CSV export
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
    - Choices: `all`, `img`, `web`, `media`, `files`, `none`
- **`--sizeLimit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`--addTags`**
    - string - default: `null`
    - Provide one or more tag names which should be added to every post in this migration.
      This is addition to a '#bearblog' tag, which is always added.
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Lexical convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate bear --pathToFile /path/to/export.csv --addTags "imported,migration"
```

This will process all posts from the CSV file and add the tags "imported" and "migration" to each post.

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev bear --pathToFile /path/to/export.csv
```

## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE). 