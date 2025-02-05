# Migrate Blogger API

Migrate from Blogger using the Google API

This tool requires an API key, which you can get [here](https://developers.google.com/blogger/docs/3.0/using)

You also need a blog ID, which is a long number like `12345678123456781234`. You can find this by viewing the source of the Blogger site and looking for `blogId`.

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-blogger --save`

or

`yarn add @tryghost/mg-blogger`


## Usage

To run a Blogger migration, the required command is:

```sh
migrate blogger --apiKey abcd --blogID 1234
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--apiKey`** (required)
    - string - default: `null`
    - API Key
- **`--blogID`** (required)
    - array - default: `null`
    - Comma separated list of site IDs
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `files`, `none`
- **`--sizeLimit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`--addTag`**
    - string - default: `null`
    - Provide a tag slug which should be added to every post in this migration
- **`--firstImageAsFeatured`** 
    - Use the first image as the post's feature_image
    - bool - default: `true`
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `true`
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate blogger --apiKey abcd --blogID 1234, 5678 --addTag 'Blog Posts' --pages false
```

This will fetch posts only from 2 sites, and add a 'Blog Posts' tag to each post.


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev blogger --apiKey abcd --blogID 1234
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
