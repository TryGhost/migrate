# Migrate Ghost API

Export content from an existing Ghost installation using the [Admin API](https://ghost.org/docs/api/v2/admin/), and generate a `zip` file you can import in another Ghost installation.

## Install

`npm install @tryghost/mg-ghost-api --save`

or

`yarn add @tryghost/mg-ghost-api`


## Usage

To run a Ghost API migration, the required command is:

```sh
migrate ghost <apiurl> <apikey>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--zip`**
    - bool - default: `true`
    - Create a zip file
- **`-s` `--scrape`**
    - string - default: `img`
    - Configure scraping tasks (choices: `img`, `none`)
- **`-I` `--info`**
    - bool - default: `false`
    - Show initalisation info only
- **`-b` `--batch`**
    - number - default: `0`
    - Batch number to run (defaults to running all)
- **`-l` `--limit`**
    - number - default: `15`
    - Number of items fetched in a batch i.e. batch size
- **`--posts`**
    - bool - default: `true`
    - Import posts (set to false to skip)
- **`--postFilter`**
    - string - default: `null`
    - A string of post filters, as defined in the Ghost Admin API
- **`--pages`**
    - bool - default: `true`
    - Import pages (set to false to skip)
- **`--pageFilter`**
    - string - default: `null`
    - A string of page filters, as defined in the Ghost Admin API

A more complex migration command could look like this:

```sh
migrate ghost <apiurl> <apikey> --batch 5 --limit 10 --postFilter 'tag:[news, press]' --pages false --verbose
```

This will get the first 50 posts with the tag `news` or `press`, in 5 batches of 10 posts, exclude pages, and show all available output in the console.

See the [Filter documentation](https://ghost.org/docs/api/v2/content/#filtering) for more info.


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2021 Ghost Foundation - Released under the [MIT license](LICENSE).
