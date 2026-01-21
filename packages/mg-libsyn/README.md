# Migrate Libsyn

Migrate content from Libsyn using your sites RSS feed, and generate a `zip` file you can import into a Ghost installation.

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-libsyn --save`

or

`yarn add @tryghost/mg-libsyn`


## Usage

To run an absolute basic Libsyn migration, the required command is this:

```sh
migrate libsyn --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - URL to Libsyn website
    - string - default: `null`
- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`--addTag`**
    - string - default: `null`
    - Provide a tag slug which should be added to every post in this migration
- **`--useFeedCategories`**
    - bool - default: `true`
    - Use the itunes:categories as tags for each post
- **`--useItemKeywords`**
    - bool - default: `true`
    - Use the itunes:keywords as tags for each post
- **`--useEmbed`**
    - bool - default: `true`
    - Use Libsyn embed for audio players. If disabled, audio files will be downloaded and uploaded to Ghost as Audio cards
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `files`, `none`
- **`--sizeLimit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`


A more complex migration command could look like this:

```sh
migrate libsyn --url https://example.com --useEmbed false --scrape none  --useFeedCategories false --useItemKeywords false
```

This will use the Libsyn `<iframe>` embed, not use categories or keyword as tags, and not scrape or save any remote files such as images, audio files, or linked PDFs.


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:


```sh
yarn dev libsyn --url https://example.com
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
