# Migrate WordPress XML

Export content using a WordPress XML file, and generate a `zip` file you can import into a Ghost installation.

Note: This package relies on (`@tryghost/mg-wp-api`)[https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-api] to process the post & page content.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-wp-xml --save`

or

`yarn add @tryghost/mg-wp-xml`


## Usage

To run a WordPress migration, the required command is:

```sh
migrate wp-xml --pathToFile /path/to/file.xml
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToFile`** (required)
    - Path to XML file
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
- **`--drafts`**
    - bool - default: `true`
    - Import draft posts
- **`--pages`**
    - bool - default: `true`
    - Import WordPress pages
- **`--posts`**
    - bool - default: `true`
    - Import WordPress posts
- **`--tags`**
    - bool - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration
- **`--datedPermalinks`** 
    - Set the dated permalink structure. `/*/` matches any prefix, such as `/articles/2018/05/` or `/blog-posts/2018/05/`
    - string - default: `none` 
    - Choices: `none`, `'/yyyy/mm/'`, `'/yyyy/mm/dd/'`, `'/*/yyyy/mm/'`, `'/*/yyyy/mm/dd/'`
    - NOTE: When using `/*/`, this is only to match existing links. Fixed links will not contain this.
- **`--postsBefore`** 
    - Only migrate posts before and including a given date e.g. 'March 20 2018'
    - string - default: `null`
- **`--postsAfter`** 
    - Only migrate posts after and including a given date e.g. 'August 16 2022'
    - string - default: `null`
- **`--cpt`** 
    - A comma-separated list of custom post type slugs e.g. `resources,newsletters`
    - array - default: `null`
- **`--excerpt`**
    - bool - default: `true`
    - Use the excerpt value from WordPress API
- **`--excerptSelector`**
    - string - default: `null`
    - Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--removeSelectors`** 
    - `Pass in a string of CSS selectors for elements that will be removed, e.g. '.ads, script[src*="adnetwork.com"]'`
    - string - default: `null`
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate wp-xml --pathToFile /path/to/file.xml --pages false --addTag News
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev wp-xml --pathToFile /path/to/file.xml
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
