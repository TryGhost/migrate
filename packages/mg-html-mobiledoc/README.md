# Migrate HTML -> Mobiledoc

A little wrapper tool for migrating all HTML fields of posts to mobiledoc

## Install

`npm install @tryghost/mg-html-mobiledoc --save`

or

`yarn add @tryghost/mg-html-mobiledoc`

## Usage

```js
const mgHtmlMobiledoc = require('tryghost/mg-html-mobiledoc');
const convertedData = mgHtmlMobiledoc.convert(myData);
```

The data structure passed into `convert` can be either:

```js
let myData = {
    posts: [
        {
            html: '<h2>Good stuff here</h2>'
        }
    ]
}
```

or

```js
let myData = {
    data: {
        posts: [
            {
                html: '<h2>Good stuff here</h2>'
            }
        ]
    }
}
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

Copyright (c) 2013-2020 Ghost Foundation - Released under the [MIT license](https://github.com/TryGhost/migrate/blob/master/packages/mg-html-mobiledoc/LICENSE).
