# Clean HTML

An opinionated set of cleaning steps, taking HTML full of inline styles and badly structured content and converting it into something cleaner.

This is intended to run _after_ platform -specific HTML changes have been made

## Install

To use this package in your own project:

`npm install @tryghost/mg-clean-html --save`

or

`yarn add @tryghost/mg-clean-html`


## Usage



## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and use `yarn dev` instead of `migrate` like so:

```sh
yarn dev curate --pathToZip /path/to/export.zip
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2023 Ghost Foundation - Released under the [MIT license](LICENSE).
