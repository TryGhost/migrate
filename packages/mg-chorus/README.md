# Migrate Chorus

Export content from Chorus using their exports, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-chorus --save`

or

`yarn add @tryghost/mg-chorus`


## Usage


To run a Ghost API migration, the required command is:

```sh
migrate chorus --entries /path/to/file.zip --url http://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--entries`**
    - array - default: `null`
    - Path(s) to Chorus exports ZIPs
- **`--url`**
    - string - default: `null`
    - URL to live site
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
        - `all`: Scrape web metadata
        - `web`: Only scrape metadata from web pages
        - `none`: Skip all scraping tasks
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate chorus --entries /path/to/file.zip, /path/to/other.zip --url http://example.com --addPrimaryTag News
```

This will get all posts, apply the tag 'News'


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev chorus <API token>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
