# Migrate Squarespace XML

To migrate from Squrespace to Ghost, we use the WordPress export format Squarespace provides. The XML file is what we use as source material.

## Install

`npm install @tryghost/mg-squarespace-xml --save`

or

`yarn add @tryghost/mg-squarespace-xml`

## Usage

To run an absolute basic Squarespace migration, the required command is this:

`migrate squarespace path/to/file.xml`

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
    - Provide an email domain for users e.g. `mycompany.com
- **`--drafts`**
    - bool - default: `true`  
    - By default, we do include drafts in the import. If you used drafts to generate newsletters that were not published as posts, you can exclude them
- **`--pages`**
    - bool - default: `false` 
    - Squarespace, as a website builder, can contain more than just posts. By default, we're not importing pages. Set this flag to `true` to import pages
- **`--tags`**
    - bool - default: `true`  
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`  
    - Provide a tag slug which should be added to every post in this migration (`my-tag`). Additional tags will be *in addition* to the automatically applied internal tag `#sqs`
- **`--fallBackHTMLCard*`**
    - bool - default: `false` 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org/).

Follow the instructions for the [top-level repo](https://github.com/TryGhost/migrate).
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

## Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `yarn dev`, like so:

```sh
yarn dev squarespace path/to/the-export-file.xml
```

## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-squarespace-xml/LICENSE).
