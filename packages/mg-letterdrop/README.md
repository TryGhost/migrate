# Migrate Letterdrop

Export content from Letterdrop using their API, and generate a `zip` file you can import into a Ghost installation.

Learn how to [get an API key](https://api.letterdrop.com/find-your-api-key).


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-letterdrop --save`

or

`yarn add @tryghost/mg-letterdrop`


## Usage


To run a Ghost API migration, the required command is:

```sh
migrate letterdrop --apiToken <API token> --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--apiToken`**
    - string - default: `null`
    - Letterdrop API key
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
    - Choices: `all`, `img`, `web`, `media`, `files`, `none`
- **`--sizeLimit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`--subscribeLink`** 
    - Provide a path that existing `/subscribe` anchors will link to e.g. `/join-us` or `#/portal/signup` (`#` characters need to be escaped with a `\`)
    - string - default: `#/portal/signup`
- **`--subscribeText`** 
    - Provide the button text for above subscribe links
    - string - default: `Subscribe`
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`--createAuthors`**
    - bool - default: `true`
    - Create authors based on data from Letterdrop
- **`--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate letterdrop --apiToken <API token> --url http://example.com --addPrimaryTag News
```

This will get all posts, apply the tag 'News', and all posts will be by author test@example.com


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev letterdrop <API token>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
