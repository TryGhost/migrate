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
migrate wp-api --url https://example.com
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--url`** (required)
    - Path to a WordPress site
    - string - default: `false`
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `true`
- **`--onlyURLs`**
    - Path to a CSV file of post URLs that will be the only migrated posts
    - string - default: `null`
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `files`, `none`
- **`--sizeLimit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `15`
    - Number of items fetched in a batch i.e. batch size
- **`--maxPosts`**
    - number - default: `0`
    - 'Maximum number of posts to return (defaults to not limit)
- **`-a` `--auth`**
    - string - default: `null`
    - Provide a user and password to authenticate the WordPress API (<user>:<password>)
- **`-u` `--users`**
    - string - default: `null`
    - Provide a JSON file with users. Contents should be a JSON array of objects that match
      the format returned by the Wordpress API, including the following keys:
      "id", "slug", "name", "description", "email" and "url".
- **`--posts**`**
    - boolean - default: `true`
    - Import posts
- **`--pages**`**
    - boolean - default: `true`
    - Import pages
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
- **`--excerpt`**
    - bool - default: `true`
    - Use the excerpt value from WordPress API
- **`--excerptSelector`**
    - string - default: `null`
    - Pass in a valid selector to grab a custom excerpt from the post content, e. g. `h2.excerpt`
- **`--featureImageCaption`**
    - bool - default: `true`
    - Include featured image captions
- **`--datedPermalinks`** 
    - Set the dated permalink structure. `/*/` matches any prefix, such as `/articles/2018/05/` or `/blog-posts/2018/05/`
    - string - default: `none` 
    - Choices: `none`, `'/yyyy/mm/'`, `'/yyyy/mm/dd/'`, `'/*/yyyy/mm/'`, `'/*/yyyy/mm/dd/'`
    - NOTE: When using `/*/`, this is only to match existing links. Fixed links will not contain this.
- **`--postsBefore`** 
    - Only migrate posts before and including a given date e.g. 'March 20 2018'
    - string - default: `null`
- **`--postsAfter`** 
    - Only migrate posts after and including a given date e.g. 'August 16 2023'
    - string - default: `null`
- **`--cpt`** 
    - A comma-separated list of custom post type slugs e.g. `resources,newsletters`
    - array - default: `null`
- **`--rawHtml`** 
    - Don't process HTML and wrap in a HTML card
    - bool - default: `false`
- **`--fallBackHTMLCard`** 
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
    - bool - default: `true`
- **`--removeSelectors`** 
    - `Pass in a string of CSS selectors for elements that will be removed, e.g. '.ads, script[src*="adnetwork.com"]'`
    - string - default: `null`
- **`--trustSelfSignedCert`** 
    - Trust self-signed certificates (such as for local installs)
    - bool - default: `false`
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more realistic command for a WordPress migration looks like this:

```sh
migrate wp-api --url https://example.com --auth person:pa55w0rd --addTag 'From old site' --limit 10 --batch 5
```

This will fetch the newest 50 posts, in 5 batches of 10, collect real author data including email addresses), and add the tag 'From old site'.

```sh
migrate wp-api --url https://example.com --scrape img web
```

This will fetch all posts, and only scrape image & web meta data

### Only get a specific set of posts:

```sh
migrate wp-api --url https://example.com --onlyURLs /path/to/urls.csv
```

The CSV should look like this:

```csv
url
https://example.com/2023/03/02/my-article
https://example.com/2023/03/01/another-article
```


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

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
