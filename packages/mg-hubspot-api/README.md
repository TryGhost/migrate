# Migrate HubSpot API

Export content from HubSpot using their API, and generate a `zip` file you can import into a Ghost installation.

See how to [get your API key](https://knowledge.hubspot.com/integrations/how-do-i-get-my-hubspot-api-key).

## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-hubspot-api --save`

or

`yarn add @tryghost/mg-hubspot-api`


## Usage

To run a Ghost API migration, the required command is:

```sh
migrate hubspot [url] <hapikey>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`-s` `--scrape`** 
    - Configure scraping tasks
    - string - default: `all` 
    - Choices: `all`, `img`, `web`, `media`, `none`
- **`--size_limit`**
    - number - default: `false`
    - Media files larger than this size (defined in MB [i.e. `5`]) will be flagged as oversize
- **`-e` `--email`**
    - string - default: `false`
    - Provide an email domain for users e.g. example.com
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `100`
    - Number of items fetched in a batch i.e. batch size
- **`--fallBackHTMLCard`**
    - bool - default: `false`
    - Fall back to convert to HTMLCard, if standard Mobiledoc convert fails

A more complex migration command could look like this:

```sh
migrate hubspot [url] <hapikey> --email example.com --batch 2 --limit 50 
```

This will get 100 posts in 2 batches of 50, and all authors will have an email address ending in 'example.com'


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev hubspot [url] <hapikey>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
