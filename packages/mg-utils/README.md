# Migrate Utils

Shared utilities for the Ghost migration tooling.

## Install

To use this package in your own project:

`npm install @tryghost/mg-utils --save`

or

`yarn add @tryghost/mg-utils`


## Usage

### DOM Utilities

Lightweight HTML parsing and manipulation powered by [linkedom](https://github.com/WebReflection/linkedom). Use `processFragment` for most cases — it parses HTML, passes the fragment to your callback, and automatically cleans up:

```js
import {domUtils} from '@tryghost/mg-utils';

const {processFragment, processFragmentAsync} = domUtils;

// Parse, manipulate, and get the result in one step
const html = processFragment('<p>Hello</p><p class="remove">World</p>', (parsed) => {
    for (const el of parsed.$('.remove')) {
        el.remove();
    }
    return parsed.html();
});
// => '<p>Hello</p>'

// Extract data from HTML
const title = processFragment(rawHtml, parsed => parsed.$('h1')[0]?.textContent || '');

// Async version for callbacks that need to await
const result = await processFragmentAsync(html, async (parsed) => {
    for (const img of parsed.$('img')) {
        const newSrc = await processImage(img.getAttribute('src'));
        img.setAttribute('src', newSrc);
    }
    return parsed.html();
});
```

The `parsed` fragment provides:
- **`parsed.$(selector, context?)`** — query elements (returns `Element[]`)
- **`parsed.html()`** — serialize the fragment back to an HTML string
- **`parsed.text()`** — get text content
- **`parsed.document`** — access the underlying `Document`
- **`parsed.body`** — access the `<body>` element

For long-lived or complex processing where a callback doesn't fit, use `parseFragment` directly:

```js
const {parseFragment} = domUtils;

const parsed = parseFragment(html);
// ... extensive manipulation ...
const result = parsed.html();
```

### DOM Manipulation Helpers

```js
const {replaceWith, insertBefore, insertAfter, wrap, createElement, attr} = domUtils;

const parsed = parseFragment('<div><p>Old</p></div>');
const p = parsed.$('p')[0];

replaceWith(p, '<span>New</span>');        // Replace element with HTML string or Node
insertBefore(el, '<!--kg-card-begin-->');   // Insert before element
insertAfter(el, '<!--kg-card-end-->');      // Insert after element
wrap(el, '<figure></figure>');              // Wrap element in a new parent

const div = createElement(parsed.document, 'div', {class: 'wrapper'});

attr(el, 'href');                // Get attribute (returns '' if missing)
attr(el, 'href', '/new-url');   // Set attribute
```

### Additional Element Utilities

- **`is(el, selector)`** — check if element matches a CSS selector
- **`parents(el, selector?)`** — get all parent elements, optionally filtered
- **`lastParent(el, selector)`** — get the furthest parent matching selector
- **`setStyle(el, property, value)`** — set a CSS style property
- **`isComment(node)`** / **`getCommentData(node)`** — comment node helpers
- **`serializeNode(node)`** / **`serializeChildren(node)`** — HTML5-compliant serialization

### XML Utilities

Parse XML strings or files into JavaScript objects using `fast-xml-parser`:

```js
import {xmlUtils} from '@tryghost/mg-utils';

const {parseXml} = xmlUtils;

// Parse an XML string
const data = await parseXml('<root><item>hello</item></root>');

// Parse from a file path
const data = await parseXml('/path/to/file.xml');

// Override parser options
const data = await parseXml(xmlString, {attributeNamePrefix: ''});
```


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and yarn workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
