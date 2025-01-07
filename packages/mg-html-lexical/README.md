# Migrate HTML -> Lexical

A little wrapper tool for migrating all HTML fields of posts to Lexical


## Install

`npm install @tryghost/mg-html-lexical --save`

or

`yarn add @tryghost/mg-html-lexical`


## Usage

```js
  var mgHtmlLexical = require('tryghost/mg-html-lexical');
  var convertedData = mgHtmlLexical.convert(myData);
```

Data structure passed in can be either

```js
let myData = {
    logger: yourLoggingInstance,
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
    logger: yourLoggingInstance,
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

Copyright (c) 2013-2025 Ghost Foundation - Released under the [MIT license](LICENSE).
