# Migrate Utils

Shared utilities for the Ghost migration tooling.

## Install

To use this package in your own project:

`npm install @tryghost/mg-utils --save`

or

`yarn add @tryghost/mg-utils`


## Usage

### DOM Utilities

Parse and manipulate HTML fragments with proper HTML5 serialization:

```js
import {domUtils} from '@tryghost/mg-utils';

const {
    parseFragment,
    serializeNode,
    serializeChildren,
    replaceWith,
    insertBefore,
    insertAfter,
    wrap,
    createElement,
    attr,
    is,
    parents,
    lastParent,
    setStyle,
    isComment,
    getCommentData
} = domUtils;

// Parse an HTML fragment
const parsed = parseFragment('<p>Hello <strong>World</strong></p>');

// Query elements (returns array)
const paragraphs = parsed.$('p');

// Get serialized HTML
const html = parsed.html();

// Get text content
const text = parsed.text();
```

### Key Features

- **HTML5-compliant serialization**: Void elements (`<hr>`, `<img>`, `<br>`) are self-closing, non-void elements (`<script>`, `<iframe>`) always have closing tags
- **DOM manipulation**: `replaceWith`, `insertBefore`, `insertAfter`, `wrap`
- **Element utilities**: `attr`, `is`, `parents`, `lastParent`, `setStyle`
- **Comment handling**: `isComment`, `getCommentData`


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
