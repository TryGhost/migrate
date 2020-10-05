# Migrate Revue Api

This tool requests data from the Revue API, and creates a zip file ready to import into Ghost. That zip file contains a `json` file and a folder of images.

## Install

`npm install @tryghost/mg-revue-api --save`

or

`yarn add @tryghost/mg-revue-api`

## Usage

Revue has and API that we can use to fetch content for migration. The token can be found on the [integrations page](https://www.getrevue.co/app/integrations) when logged in.

To run a basic migration from Revue all you need is to run a command like this:

`migrate revue <pubName> <API token>`

The `pubName` value is the publication or user name. It's the last part of the profile URL, e. g. https://www.getrevue.co/profile/**<pubName>**

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
- **`--addPrimaryTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag, such as `RevueImport`
- **`-e` `--email`**
    - string - default: `null`
    - Provide an email to create a general author for the posts, such as `john@mycompany.com`
- **`-I` `--info`**
    - bool - default: `false`
    - Show Revue API info only
- **`--fallBackHTMLCard`**
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more realistic command for a Substack migration looks like this:

```sh
migrate revue MyRevuePubName lz9scqda8fsy1rhw1ow7oz409jmpz8se --email john@mycompany.com --addPrimaryTag RevueImport
```

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org/).

Follow the instructions for the [top-level repo](https://github.com/TryGhost/migrate).
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

### Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `yarn dev`, like so:

```sh
yarn dev revue MyRevuePubName lz9scqda8fsy1rhw1ow7oz409jmpz8se
```

### Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-revue-api/LICENSE).
