# Curated Ghost CSV Converter

Converts the "Subscribers" CSV export from Curated to a CSV compatible with Ghost.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-curated-members-csv --save`

or

`yarn add @tryghost/mg-curated-members-csv`


## Usage

To run a Curated CSV migration, the required command is:

```sh
migrate curated-members path/to/emails.csv
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`-V` `--verbose`**
    - Show verbose output
    - bool - default: `false`
- **`-l` `--limit`**
    - Define the batch limit for import files
    - int - default: `5000`
- **`--freeLabel`**
    - Provide a label for Curated `free` subscribers
    - string - default: `curated-free`

A more complex migration command that accounts for Stripe data could look like this:

```sh
migrate curated-members emails.csv --freeLabel Newsletter --limit 1000
```


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev curated-members path/to/emails.csv
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2021 Ghost Foundation - Released under the [MIT license](LICENSE).
