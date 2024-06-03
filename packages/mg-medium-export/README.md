# Migrate Medium Export

Migrate content from Medium using the supplied zip file, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-medium-export --save`

or

`yarn add @tryghost/mg-medium-export`


## Usage

To run a Medium migration, the required command is:

```sh
migrate medium --pathToZip /path/to/my-export.zip
```

**Note:** The zip path can be to a singular zip file or a folder of zip files

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to a zip file
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
- **`-e` `--email`**
    - string - default: `false`
    - Provide an email domain for users e.g. example.com
- **`--addTag`**
    - string - default: `null`
    - Provide a tag name which should be added to every post in this migration (Wrap in single quotes if tag name has spaces `'Like This'`)
- **`--addPlatformTag`** 
    - Add #medium tag to migrated content
    - bool - default: `true`
- **`--mediumAsCanonical`**
    - bool - default: `false`
    - Use medium article as canonical URL
- **`--fallBackHTMLCard`**
    - bool - default: `true`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate medium --pathToZip /path/to/my-export.zip --email example.com
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
yarn dev medium --pathToZip /path/to/my-export.zip
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
