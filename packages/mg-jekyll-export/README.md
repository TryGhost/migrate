# Migrate Jekyll Export

Migrate content from Jekyll using the supplied zip file, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-jekyll-export --save`

or

`yarn add @tryghost/mg-jekyll-export`


## Usage

To run a Jekyll migration, the required command is:

```sh
migrate jekyll --pathToZip /path/to/site.zip
```

The zip should have a structure like:

```
_posts/
├── 2020-10-27-my-post.md
├── 2021-05-19-another-post.markdown
└── 2023-06-03-newest-post.html
_drafts/
└── 2023-06-03-some-draft.md
```
It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a jekyll export zip
    - string - default: `null`
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
- **`-u` `--url`**
    - string - default: `false`
    - Provide a URL (without trailing slash) to the hosted source site
- **`-e` `--email`**
    - string - default: `false`
    - Provide an email domain for users e.g. example.com
- **`--addTags`**
    - string - default: `null`
    - Provide one or more tag names which should be added to every post in this migration.
      This is addition to a '#jekyll' tag, which is always added.
- **`--datedPermalinks`** 
    - Set the dated permalink structure
    - string - default: `none` 
    - Choices: `none`, `'/yyyy/mm/'`, `'/yyyy/mm/dd/'`  
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate jekyll --pathToZip /path/to/site.zip --email example.com
```

This will process all posts from the zip file, and all authors will have an email address ending in 'example.com'


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev jekyll --pathToZip /path/to/site.zip
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
