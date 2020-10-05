# Migrate Fs Utils

A collection of utility used across various [migrate](https://github.com/TryGhost/migrate) packages.

## Install

`npm install @tryghost/mg-fs-utils --save`

or

`yarn add @tryghost/mg-fs-utils`

## Usage

Usage is specific to each utility. It is recomended to require the tool you need, like the example below:

```js
const csv = require('@tryghost/mg-fs-utils').csv;

module.exports = async () => {
    const input = await csv.parse('./path/to/file.csv');
    // do something with input
};
```

## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org/).

Follow the instructions for the [top-level repo](https://github.com/TryGhost/migrate).
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.

## Run

- `yarn dev`

## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests

# Copyright & License

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-fs-utils/LICENSE).
