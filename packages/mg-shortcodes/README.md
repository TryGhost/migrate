# Shortcodes

This package wraps the excellent [universal-shortcodes](https://github.com/EvidentlyCube/universal-shortcodes), and adds utility functions to make adding support for shortcodes easier between different tools. It typecasts attribute values (string, int, float, bool) and handles encoded quotes (_pretty quotes_) that sometimes wrap attributes.

Unhandled shortcodes are returned without modification.

## Install

`npm install @tryghost/mg-shortcodes --save`

or

`yarn add @tryghost/mg-shortcodes`


## Usage

```js
// Import the class
import Shortcodes from '@tryghost/mg-shortcodes';

// Create a new instance
const ShortcodeParser = new Shortcodes();

// Handle [link] shortcodes
shortcodes.add('link', ({attrs, content}) => {
    return `<a href="${attrs.url}">${content}</a>`;
});

// Unwrap [block] shortcodes
shortcodes.unwrap('block');

// You can add & unwrap as many shortcodes as you like. The order is not important.

const content = `[block][link url="https://example.com"]Hello[/link][/block]`;

// Parse the content and return the updated content
const updatedContent = shortcodes.parse(content);
// <a href="https://example.com">Hello</a>
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

Copyright (c) 2013-2022 Ghost Foundation - Released under the [MIT license](LICENSE).
