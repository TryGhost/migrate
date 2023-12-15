# Migrate Medium Members `txt` Export

Converts a Medium members `txt` export and generates a `csv` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-medium-members --save`

or

`yarn add @tryghost/mg-medium-members`


## Usage

To run basic Medium member migration, the required command is this:

```sh
migrate medium-members --pathToTxt /path/to/members.txt
```

A more complex command for a Medium member migration looks like this:

```sh
migrate medium-members --pathToTxt /path/to/members.txt --verbose true
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--pathToTxt`** (required)
    - Path to members text file
    - string - default: `null`
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
yarn dev medium-members <commands>
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
