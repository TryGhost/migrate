# Migrate

A collection of CLI tools for migrating to Ghost.

## Install

Migrate is a set of command line tools. Install them globally to run a migration from anywhere:

`npm install --global @tryghost/migrate`

## Usage

Run `migrate --help` to see a list of available commands.

Basic usage follows this pattern: `migrate [source] [flags]`

- `migrate medium path/to/export.zip`
- `migrate wp-api https://mywpsite.com`

Each tool comes with its own optional flags to customise the migration.
You can run `migrate [source] --help` to see these, or view the readme for each tool:

- [HubSpot](https://github.com/TryGhost/migrate/tree/master/packages/mg-hubspot-api)
- [Medium](https://github.com/TryGhost/migrate/tree/master/packages/mg-medium-export)
- [Revue](https://github.com/TryGhost/migrate/tree/master/packages/mg-revue-api)
- [Squarespace](https://github.com/TryGhost/migrate/tree/master/packages/mg-squarespace-xml)
- [Substack](https://github.com/TryGhost/migrate/tree/master/packages/mg-substack-csv)
- [Substack members](https://github.com/TryGhost/migrate/tree/master/packages/mg-substack-members-csv)
- [WordPress](https://github.com/TryGhost/migrate/tree/master/packages/mg-wp-api)

## Developer Setup (for contributing)

This is a mono repository, managed with [lerna](https://lerna.js.org/).

1. Fork this repo
2. `git clone https://github.com/<your-username>/migrate path/to/your/workspace`
3. `cd path/to/your/workspace`
4. `yarn setup` (mapped to `lerna bootstrap`)
   - installs all external dependencies and links all internal dependencies

To add a new package to the repo:

1. Install [slimer](https://github.com/TryGhost/slimer)
2. Run `slimer new <package name>`

### Run

```sh
yarn dev
```

### Test

- `yarn lint` to run eslint only
- `yarn test` to run lint and tests

### Publish

- `yarn ship` is an alias for `lerna publish`
    - Publishes all packages which have changed
    - Also updates any packages which depend on changed packages

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](LICENSE).
