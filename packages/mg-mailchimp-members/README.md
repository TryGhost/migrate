# Migrate Mailchimp Members `csv` Export

Converts a Mailchimp members `csv` export and generates a `csv` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-mailchimp-members --save`

or

`yarn add @tryghost/mg-mailchimp-members`


## Usage

To run basic Mailchimp member migration, the required command is this:

```sh
migrate mailchimp-members --pathToCsv /path/to/members.csv
```

A more complex command for a Mailchimp member migration looks like this:

```sh
migrate mailchimp-members --pathToCsv /path/to/members.csv, /path/to/another-members.csv --addLabel 'Migrated' --includeUnsubscribed false --verbose true
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToZip`** (required)
    - Path to members ZIP file
    - string - default: `null`
- **`--pathToCsv`** (required)
    - Path to members CSV file
    - array - default: `null`
- **`--addLabel`**
    - Label to add to all members
    - string - default: `null`
- **`--includeUnsubscribed`** 
    - Include unsubscribed members in the migration, but set to not receive emails
    - bool - default: `false`
- **`--cache`** 
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`-V` `--verbose`** 
    - Show verbose output
    - bool - default: `false`
- **`--zip`** 
    - Create a zip file
    - bool - default: `false`   


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev mailchimp-members <commands>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
