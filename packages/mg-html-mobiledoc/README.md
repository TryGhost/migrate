# Migrate HTML -> Mobiledoc

A little wrapper tool for migrating all HTML fields of posts to mobiledoc


## Install

`npm install @tryghost/mg-html-mobiledoc --save`

or

`yarn add @tryghost/mg-html-mobiledoc`


## Usage

```js
  var mgHtmlMobiledoc = require('tryghost/mg-html-mobiledoc');
  var convertedData = mgHtmlMobiledoc.convert(myData);
```

Data structure passed in can be either

```js
var myData = {
    posts: [
        {
            html: '<h2>Good stuff here</h2>'
        }
    ]
}
```

or

```js
var myData = {
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

Copyright (c) 2018 Ghost Foundation - Released under the [MIT license](LICENSE).
