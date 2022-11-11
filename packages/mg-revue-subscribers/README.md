# Migrate Revue Subscribers

Export subscribers from Revue using their API, and generate a `csv` file you can import into a Ghost installation.

The token can be found on the [integrations page](https://www.getrevue.co/app/integrations) when logged in.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-revue-subscribers --save`

or

`yarn add @tryghost/mg-revue-subscribers`


## Usage


To run a Ghost API migration, the required command is:

```sh
migrate revue-subscribers <API token>
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - bool - default: `false`
    - Show verbose output
- **`--addLabel`**
    - string - default: `null`
    - Provide a tag name which should be added to every post as primary tag
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate revue-subscribers <API token> --addLabel Migrated
```

This will get all subscribers and apply the label 'Migrated' to each


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev revue <API token>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
