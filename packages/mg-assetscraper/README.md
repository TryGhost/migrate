# Migrate Assetscraper

## Install

`npm install @tryghost/mg-assetscraper --save`

or

`yarn add @tryghost/mg-assetscraper`


## Usage

```js
// Default
const assetScraper = new AssetScraper(fileCache, {}, {
    logger: myLogger
});

// Later on, create the Listr tasks
const tasks = ctx.imageScraper.fetch(ctx);

// Create the Listr task runner, ensuring its not concurrent:
// Each task *must* be run sequentially
const taskRunner = makeTaskRunner(tasks, {concurrent: false});

// And later still, run those tasks
await taskRunner.run();

// `ctx` is now updated
```

```js
// Set some options
// 2 MB maximum, and no media files
const assetScraper = new AssetScraper(fileCache, {
    sizeLimit: 2, // 2 MB
    allowMedia: false,
    baseDomain: 'https://example.com' // Set this domain to be added to relative asset links
}, {
    logger: myLogger
});

// Don't scrape assets from this URL
assetScraper.addBlockedDomain('https://my-custom-cdn.example.com');

// Now create & run tasks
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
- `yarn benchmark` run benchmarks


# Copyright & License

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
