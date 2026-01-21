# Migrate Squarespace XML

Squarespace has a migration path via WordPress which results in a `xml` with all content. This tool processes that XML file, and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-squarespace-xml --save`

or

`yarn add @tryghost/mg-squarespace-xml`


## Usage

To run a Squarespace migration, the required command is:

```sh
migrate squarespace --pathToFile /path/to/file.xml
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToFile`** (required)
    - Path to xml file
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
- **`--drafts`**
    - bool - default: `true`
    - Import draft posts
- **`--posts`**
    - bool - default: `true`
    - Import Squarespace posts
- **`--pages`**
    - bool - default: `false`
    - Import Squarespace pages
- **`--tags`**
    - bool - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--removeSelectors`** 
    - `Pass in a string of CSS selectors for elements that will be removed, e.g. '.ads, script[src*="adnetwork.com"]'`
    - string - default: `null`
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate squarespace --pathToFile /path/to/file.xml --pages true --addTag News
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev squarespace --pathToFile /path/to/file.xml
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
