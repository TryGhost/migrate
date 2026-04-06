# Migrate Fs Utils

## Install

`npm install @tryghost/mg-fs-utils --save`

or

`pnpm add @tryghost/mg-fs-utils`


## Usage

You can add `.env` file in the root of this package to set a different local cache path.
By default, it will create a temporary folder in the system's temp directory, but you may want to chang this to a more permanent location. Setting `CACHE_PATH` in `.env` will override the default.

```env
CACHE_PATH=/path/to/cache
```


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

- `pnpm dev`


## Test

- `pnpm lint` run just eslint
- `pnpm test` run lint and tests




# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
