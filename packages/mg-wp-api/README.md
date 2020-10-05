# Migrate WP Api

This tool uses the [WordPress REST API](https://developer.wordpress.org/rest-api/) to fetch data, and creates a zip file ready to import into Ghost. That zip file contains a `json` file and a folder of images.

## Install

`npm install @tryghost/mg-wp-api --save`

or

`yarn add @tryghost/mg-wp-api`

## Usage

To run a WP migration, the required command is this:

`migrate wp-api https://mywpsite.com`

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
- **`-I` `--info`** 
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`** 
    - int - default: `0`
    - Run a batch (defaults to not batching
- **`-l` `--limit`** 
    - int - default: `100`
    - Number of items fetched in a batch i.e. batch size
- **`-a` `--auth`** 
    - string - default: `null`
    - Provide a user and password to authenticate the WordPress API (`<user>:<password>`)
- **`-u` `--users`** 
    - string - default: `null`
    - Provide a JSON file with users
- **`--tags`** 
    - bool - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`** 
    - string - default: `null`
    - Provide a tag slug which should be added to every post in this migration (`my-tag`)
- **`--featureImage`** 
    - string - default: `featuredmedia` 
    - Change which value is used as the feature image (choices: `featuredmedia`, `og:image`, `none`)
- **`--excerptSelector`** 
    - string - default: `null` 
    - Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt
- **`--fallBackHTMLCard`** 
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more complex migration command could look like this:

```sh
migrate wp-api https://mywpsite.com --limit 100 --addTag old-site --excerptSelector p.story-excerpt --fallBackHTMLCard true
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

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-wp-api/LICENSE).
