# Migrate Buttondown Export

Converts a Buttondown export and generates a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-buttondown --save`

or

`yarn add @tryghost/mg-buttondown`


## Usage

To run a basic Buttondown migration, the required command is this:

```sh
migrate buttondown --pathToZip /path/to/export.zip --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a zip file
    - string - default: `null`
- **`--url`** (required)
    - Site URL
    - string - default: `null`  
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `assets`, `none`
        - `all`: Scrape web metadata and download assets
        - `web`: Only scrape metadata from web pages
        - `assets`: Only download assets (images, media, files)
        - `none`: Skip all scraping tasks
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `true`     
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`   


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev buttondown <commands>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
