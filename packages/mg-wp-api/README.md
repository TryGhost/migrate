# Migrate WP Api

Export content using the WordPress JSON API, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-wp-api --save`

or

`yarn add @tryghost/mg-wp-api`


## Usage

To run an absolute basic WordPress migration, the required command is this:

```sh
migrate wp-api <url>
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
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `15`
    - Number of items fetched in a batch i.e. batch size
- **`-a` `--auth`**
    - string - default: `null`
    - Provide a user and password to authenticate the WordPress API (<user>:<password>)
- **`-u` `--users`**
    - string - default: `null`
    - Provide a JSON file with users
- **`--tags`**
    - boolean - default: `true`
    - Set to false if you don't want to import WordPress tags, only categories
- **`--addTag`**
    - string - default: `null`
    - Provide a tag slug which should be added to every post in this migration
- **`--featureImage`** 
    - Change which value is used as the feature image
    - string - default: `featuredmedia` 
    - Choices: `featuredmedia`, `og:image`, `none`
- **`--excerptSelector`**
    - string - default: `null`
    - Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`
- **`--datedPermalinks`** 
    - Set the dated permalink structure
    - string - default: `none` 
    - Choices: `none`, `'/yyyy/mm/'`, `'/yyyy/mm/dd/'`  
- **`--cpt`** 
    - A comma-separated list of custom post type slugs e.g. `resources,newsletters`
    - string - default: `null`
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `false`

A more realistic command for a WordPress migration looks like this:

```sh
migrate wp-api https://example.com --auth person:pa55w0rd --addTag 'From old site' --limit 10 --batch 5
```

This will fetch the newest 50 posts, in 5 batches of 10, collect real author data including email addresses), and add the tag 'From old site'.


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev wp-api <url>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
