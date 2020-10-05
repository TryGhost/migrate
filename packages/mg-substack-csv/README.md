# Migrate Substack CSV Export

## Install

`npm install @tryghost/mg-substack-csv --save`

or

`yarn add @tryghost/mg-substack-csv`

## Usage

Substack provides an overview `csv` file as well as a folder containing different files for each post.

To run an absolute basic Substack migration, the required command is this:

`migrate substack <path to post.csv file>`

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
- **`-u` `--url`** 
    - string - default:`https://ghost.io` 
    - Provide a URL (without trailing slash) to the hosted source site, so we can scrape data
- **`-p` `--readPosts`** 
    - string - default: `null`            
    - Provide a path to a posts folder that contains HTML files (file name = post id) to read the post content
- **`--drafts`** 
    - bool - default: `true`            
    - Import draft posts
- **`--fallBackHTMLCard`** 
    - bool - default: `false`           
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more realistic command for a Substack migration looks like this:

`migrate substack <path to post.csv file> --url <URL to substack instance> --readPosts <path to directory containing html files> --email <main author email> --drafts false`

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org/).

Follow the instructions for the [top-level repo](https://github.com/TryGhost/migrate).
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

### Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `yarn dev`, like so:

```sh
yarn dev substack path/to/posts.csv
```

## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-substack-csv/LICENSE).
