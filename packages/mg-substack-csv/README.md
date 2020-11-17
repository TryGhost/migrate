# Migrate Substack Posts CSV Export

Converts the Posts CSV (plus optional posts directory) and creates a zip file if your content and images, ready to import into Ghost.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

```sh
npm install @tryghost/mg-substack-csv --save
```

or

```sh
yarn add @tryghost/mg-substack-csv
```


## Usage

Substack provides an overview `csv` file as well as a folder containing different files for each post.

To run an absolute basic Substack migration, the required command is this:

```sh
migrate substack <path to post.csv file>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`        
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`            
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `web`, `img`, `none`            
- **`-e` `--email`** 
    - Provide an email domain for users e.g. `mycompany.com`
    - bool/string - default: `false`            
- **`-u` `--url`** 
    - Provide a URL (without trailing slash) to the hosted source site, so we can scrape data
    - string - default:`https://ghost.io` 
- **`-p` `--readPosts`** 
    - Provide a path to a posts folder that contains HTML files (file name = post id) to read the post content
    - string - default: `null`            
- **`--drafts`** 
    - Import draft posts
    - bool - default: `true`            
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `false`           

A more realistic command for a Substack migration looks like this:

```sh
migrate substack <path to post.csv file> --url <URL to substack instance> --readPosts <path to directory containing html files> --email <main author email> --drafts false
```


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
