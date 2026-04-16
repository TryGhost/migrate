# Migrate beehiiv Members API

> [!IMPORTANT]
> This package is a work in progress, and is not ready for production use yet.

Migrate members from beehiiv to Ghost using the beehiiv API, and generate CSV files you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-beehiiv-api-members --save`

or

`pnpm add @tryghost/mg-beehiiv-api-members`


## Usage

To run a beehiiv members migration, the required command is:

```sh
migrate beehiiv-api-members --key 1234abcd
```

If no `--id` is provided, a list of available publications will be shown. Use the publication ID to run the full migration:

```sh
migrate beehiiv-api-members --key 1234abcd --id pub_abcd1234
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--key`** (required)
    - beehiiv API key
    - string - default: `null`
- **`--id`**
    - beehiiv publication ID
    - string - default: `null`
- **`--outputSingleCSV`**
    - Choose whether to export a single CSV or one for each type
    - bool - default: `false`
- **`--writeCSV`**
    - Create a final CSV file
    - bool - default: `false`
- **`--cache`**
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`--tmpPath`**
    - Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)
    - string - default: `null`
- **`--outputPath`**
    - Specify the full path where the final zip file will be saved to (Defaults to CWD)
    - string - default: `null`
- **`--cacheName`**
    - Provide a unique name for the cache directory (defaults to a UUID)
    - string - default: `null`
- **`-V` `--verbose`**
    - Show verbose output
    - bool - default: `false`
- **`--zip`**
    - Create a zip file
    - bool - default: `false`
- **`--includeStripe`**
    - Include Stripe customer IDs for paid members. When set to false, paid members will be imported as complimentary members instead.
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate beehiiv-api-members --key 1234abcd --id pub_abcd1234 --outputSingleCSV --writeCSV --verbose
```

This will export all members into a single CSV file, and show all available output in the console.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


### Run

To run a local development copy, `cd` into this directory, and use `pnpm dev` instead of `migrate` like so:

```sh
pnpm dev beehiiv-api-members --key 1234abcd --id pub_abcd1234
```


## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests
- `pnpm test:local` build and run tests (for single-package development)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
