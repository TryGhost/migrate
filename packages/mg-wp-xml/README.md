# Migrate WordPress XML

Export content using a WordPress XML file, and generate a `zip` file you can import into a Ghost installation.

Note: This package relies on (`@tryghost/mg-wp-api`)[https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-api] do process the post & page content.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-wp-xml --save`

or

`yarn add @tryghost/mg-wp-xml`


## Usage

To run a WordPress migration, the required command is:

```sh
migrate wp-xml <path to xml file>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - array - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `none`
- **`--size_limit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`--drafts`**
    - bool - default: `true`
    - Import draft posts
- **`--pages`**
    - bool - default: `true`
    - Import WordPress pages
- **`--tags`**
    - bool - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--fallBackHTMLCard`**
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more complex migration command could look like this:

```sh
migrate wp-xml <path to xml file> --pages false --addTag News
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev wp-xml <path to xml file>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
