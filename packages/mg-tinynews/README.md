# Migrate Tiny News

Export content from Tiny News using JSON files, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-tinynews --save`

or

`yarn add @tryghost/mg-tinynews`


## Usage

To run a Ghost API migration, the required command is:

```sh
migrate tinynews --url https://example.com --articles /path/to/articles.json
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - string - default: `null`
    - URL to live site
- **`--articles`** (required)
    - string - default: `null`
    - Path to articles JSON file
- **`--pages`**
    - string - default: `null`
    - Path to pages JSON file
- **`--newsletters`**
    - string - default: `null`
    - Path to newsletters JSON file
- **`--authors`**
    - string - default: `null`
    - Path to authors JSON file
- **`--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `none`
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complete migration command could look like this:

```sh
migrate tinynews --url http://example.com --articles /path/to/articles.json --pages /path/to/pages.json --newsletters /path/to/newsletters.json --authors /path/to/authors.json
```

This will get all posts, pages, newsletters, and authors.


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev tinynews [options]
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
