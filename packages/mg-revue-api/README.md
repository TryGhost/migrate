# Migrate Revue Api

Export content from Revue using their API, and generate a `zip` file you can import into a Ghost installation.

The token can be found on the [integrations page](https://www.getrevue.co/app/integrations) when logged in.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-revue-api --save`

or

`yarn add @tryghost/mg-revue-api`


## Usage


To run a Ghost API migration, the required command is:

```sh
migrate revue <pubName> <API token>
```

* The `pubName` value is the publication or user name. It's the last part of the profile URL, e. g. https://www.getrevue.co/profile/**`<pubName>`**

It's possible to pass more options, in order to achieve a better migration file for Ghost:

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
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`-e` `--email`**
    - string - default: `null`
    - Provide an email for users e.g. test@example.com to create a general author for the posts
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`--fallBackHTMLCard`**
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate revue <pubName> <API token> --email test@example.com --addPrimaryTag News
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
yarn dev revue <pubName> <API token>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
