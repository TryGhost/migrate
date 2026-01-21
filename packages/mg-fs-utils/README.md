# Migrate Fs Utils

## Install

`npm install @tryghost/mg-fs-utils --save`

or

`yarn add @tryghost/mg-fs-utils`


## Usage

You can add `.env` file in the root of this package to set a different local cache path.
By default, it will create a temporary folder in the system's temp directory, but you may want to chang this to a more permanent location. Setting `CACHE_PATH` in `.env` will override the default.

```env
CACHE_PATH=/path/to/cache
```


## Develop

This is a mono repository, managed with [lerna](https://lernajs.io/).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

- `yarn dev`


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests




# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
