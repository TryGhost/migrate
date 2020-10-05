# Migrate Medium Export

This tool uses the zip file Medium that provides, and creates a zip file ready to import into Ghost. That zip file contains a `json` file and a folder of images.

## Install

`npm install @tryghost/mg-medium-export --save`

or

`yarn add @tryghost/mg-medium-export`

## Usage

To run a Medium migration, the required command is:

```sh
migrate medium the-export-file.zip
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`-s` `--scrape`**
    - string - default: `all`
    - Configure scraping tasks (choices: `all`, `web`, `img`, `none`)
- **`-e` `--email`**
    - bool/string - default: `false`
    - Provide an email domain for users e.g. `mycompany.com`
- **`--fallBackHTMLCard`**
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more complex migration command could look like this:

```sh
migrate medium the-export-file.zip --email mycompany.com --fallBackHTMLCard true --verbose
```

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org/).

Follow the instructions for the [top-level repo](https://github.com/TryGhost/migrate).
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

### Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `yarn dev`, like so:

```sh
yarn dev medium path/to/the-export-file.zip
```

### Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-medium-export/LICENSE).
