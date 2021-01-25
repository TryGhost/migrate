# Migrate

A collection of tools for migrating to Ghost

## Install

Migrate is a set of command line tools, install them globally:

`npm install --global @tryghost/migrate`

## Usage

Run `migrate --help` to see a list of available commands.

Basic usage is `migrate [source] source-info`:

E.g.

`migrate medium path/to/export.zip`

`migrate wp-api https://mywpsite.com`

Each source somes with optional flags to customise the migration:

`migrate [source] --help` will give more detail


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

1. `git clone` this repo & `cd` into it as usual
2. `yarn setup` is mapped to `lerna bootstrap`
   - installs all external dependencies
   - links all internal dependencies

To add a new package to the repo:
   - install [slimer](https://github.com/TryGhost/slimer)
   - run `slimer new <package name>`


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


## Publish

- `yarn ship` is an alias for `lerna publish`
    - Publishes all packages which have changed
    - Also updates any packages which depend on changed packages


# Copyright & License

Copyright (c) 2013-2021 Ghost Foundation - Released under the [MIT license](LICENSE).
