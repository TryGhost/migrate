# Migrate

A collection of tools for migrating to Ghost.

Each tool has its own detailed documentation:

- [Ghost](https://github.com/TryGhost/migrate/tree/main/packages/mg-ghost-api)
- [beehiiv](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv)
- [beehiiv Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-beehiiv-members)
- [Blogger](https://github.com/TryGhost/migrate/tree/main/packages/mg-blogger)
- [Buttondown](https://github.com/TryGhost/migrate/tree/main/packages/mg-buttondown)
- [Chorus](https://github.com/TryGhost/migrate/tree/main/packages/mg-chorus)
- [Curated](https://github.com/TryGhost/migrate/tree/main/packages/mg-curated-export)
- [Curated members](https://github.com/TryGhost/migrate/tree/main/packages/mg-curated-members-csv)
- [Jekyll](https://github.com/TryGhost/migrate/tree/main/packages/mg-jekyll-export)
- [Letterdrop](https://github.com/TryGhost/migrate/tree/main/packages/mg-letterdrop)
- [Libsyn](https://github.com/TryGhost/migrate/tree/main/packages/mg-libsyn)
- [Mailchimp Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-mailchimp-members)
- [Medium Content](https://github.com/TryGhost/migrate/tree/main/packages/mg-medium-export)
- [Medium Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-medium-members)
- [Squarespace](https://github.com/TryGhost/migrate/tree/main/packages/mg-squarespace-xml)
- [Stripe](https://github.com/TryGhost/migrate/tree/main/packages/mg-stripe)
- [Substack](https://github.com/TryGhost/migrate/tree/main/packages/mg-substack)
- [Substack members](https://github.com/TryGhost/migrate/tree/main/packages/mg-substack-members-csv)
- [Tiny News](https://github.com/TryGhost/migrate/tree/main/packages/mg-tinynews)
- [Tiny News Members](https://github.com/TryGhost/migrate/tree/main/packages/mg-tinynews-members)
- [WordPress API](https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-api)
- [WordPress XML](https://github.com/TryGhost/migrate/tree/main/packages/mg-wp-xml)


## Install

Migrate is a set of command line tools, install them globally:

`npm install --global @tryghost/migrate`


## Usage

Run `migrate --help` to see a list of available commands.

Basic usage is `migrate [source] source-info`:

E.g.

`migrate medium --pathToZip /path/to/export.zip`

`migrate wp-api --url https://mywpsite.com`

Each source comes with optional flags to customise the migration:

`migrate [source] --help` will give more detail


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

1. `git clone` this repo & `cd` into it as usual
2. `yarn setup` is mapped to `lerna bootstrap`
   - installs all external dependencies
   - links all internal dependencies


## Run

To make sure the TypeScript packages are built (immediately and after file changes), use

```sh
yarn build:watch
```

Or run `yarn build` once if you don't need the watching.

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev [source]
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


## Publish

- `yarn ship` is an alias for `lerna publish`
    - Publishes all packages which have changed
    - Also updates any packages which depend on changed packages


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
