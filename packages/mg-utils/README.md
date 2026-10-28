# Migrate Utils

Shared utilities for the Ghost migration tooling.

## Install

To use this package in your own project:

`npm install @tryghost/mg-utils --save`

or

`pnpm add @tryghost/mg-utils`


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
const {replaceWith, replaceTag, insertBefore, insertAfter, wrap, createElement, attr} = domUtils;

const parsed = parseFragment('<div><p>Old</p></div>');
const p = parsed.$('p')[0];

replaceWith(p, '<span>New</span>');        // Replace element with HTML string or Node
replaceTag(el, 'u');                       // Change the tag, preserving attributes and children
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

Read values from the parsed object, whether an element appears once, many times, or with attributes:

```js
const {getText, ensureArray} = xmlUtils;

getText('Hello'); // 'Hello'
getText({'@_domain': 'category', '#text': 'News'}); // 'News'
getText(['First', 'Second']); // 'First'
getText(undefined); // ''

ensureArray(item.category); // [] when missing, [category] when single, or the array as parsed
```

### String Utilities

```js
import {stringUtils} from '@tryghost/mg-utils';

const {escapeHTML, unescapeHTML} = stringUtils;

`<img alt="${escapeHTML(title)}">`; // escapes & < > " ' for element content and quoted attributes
unescapeHTML('Fish &amp; chips'); // 'Fish & chips'
```

- **`escapeHTML(str)`** / **`unescapeHTML(str)`** — escape and unescape `&`, `<`, `>`, `"` and `'`
- **`startCase(str)`** — `'hello-world'` → `'Hello World'`
- **`kebabCase(str)`** — `'Hello World'` → `'hello-world'`
- **`stripHtml(html)`** — remove tags and line breaks
- **`cleanURL(url)`** — host and path without protocol or query

### Date Utilities

Parse dates from source data without depending on the machine's timezone:

```js
import {dateUtils} from '@tryghost/mg-utils';

const {parseDate} = dateUtils;

parseDate('2025-07-27 03:37:40'); // 2025-07-27T03:37:40.000Z: no zone, so read as UTC
parseDate('2025-07-27T03:37:40+02:00'); // 2025-07-27T01:37:40.000Z
parseDate('Mon, 30 Nov 2020 10:00:00 GMT'); // RFC 2822 is parsed as given
parseDate('0000-00-00 00:00:00'); // undefined
```

A `YYYY-MM-DD HH:MM[:SS[.fff]]` timestamp without a zone designator, with a space or `T` separator, is read as UTC. Anything else is passed to `new Date()` as given. Non-strings, blank strings and invalid dates return `undefined`, so callers decide whether to fall back to another field or skip the record.

### URL Utilities

Validate URLs from source data or options, and identify a site by its URL:

```js
import {urlUtils} from '@tryghost/mg-utils';

const {httpUrl, canonicalSite} = urlUtils;

httpUrl(' https://example.com/blog/ ')?.href; // 'https://example.com/blog/'
httpUrl('/2024/01/post/', 'https://example.com')?.href; // 'https://example.com/2024/01/post/'
httpUrl('mailto:hello@example.com'); // undefined

canonicalSite('https://Example.com/blog/'); // 'example.com/blog'
trimTrailingSlashes('https://example.com/blog//'); // 'https://example.com/blog'
```

`httpUrl` trims a string and returns a `URL` only for `http:` and `https:`. Non-strings, blank strings, invalid URLs and other protocols return `undefined`, so callers choose their own error. `canonicalSite` returns the lowercased host and path without trailing slashes, which scopes stable IDs to one site whatever its protocol, query or trailing slash. `trimTrailingSlashes` removes trailing slashes without a regular expression, so long runs of slashes can't make it slow.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Test

- `pnpm test` runs the package tests
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
