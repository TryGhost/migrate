# Migrate beehiiv API

Migrate content from beehiiv to Ghost using the beehiiv API, and generate a `zip` file you can import into a Ghost installation.


## Install

To install the CLI, which is required for the Usage commands below:

```sh
npm install --global @tryghost/migrate
```

To use this package in your own project:

`npm install @tryghost/mg-beehiiv-api --save`

or

`yarn add @tryghost/mg-beehiiv-api`


## Usage

To run a beehiiv API migration, the required command is:

```sh
migrate beehiiv-api --key 1234abcd
```

If no `--id` is provided, a list of available publications will be shown. Use the publication ID to run the full migration:

```sh
migrate beehiiv-api --key 1234abcd --id pub_abcd1234
```

It's possible to pass more options, in order to achieve a better migration file for Ghost:

- **`--key`** (required)
    - beehiiv API key
    - string - default: `null`
- **`--id`**
    - beehiiv publication ID
    - string - default: `null`
- **`--postsAfter`**
    - Only migrate posts published on or after this date
    - string - default: `null`
    - Format: `YYYY-MM-DD`
- **`--postsBefore`**
    - Only migrate posts published on or before this date
    - string - default: `null`
    - Format: `YYYY-MM-DD`
- **`-s` `--scrape`**
    - Configure scraping tasks
    - string - default: `all`
    - Choices: `all`, `web`, `assets`, `none`
- **`--cache`**
    - Persist local cache after migration is complete (Only if `--zip` is `true`)
    - bool - default: `true`
- **`--tmpPath`**
    - Specify the full path where the temporary files will be stored (Defaults a hidden tmp dir)
    - string - default: `null`
- **`--outputPath`**
    - Specify the full path where the final zip file will be saved to (Defaults to CWD)
    - string - default: `null`
- **`--cacheName`**
    - Provide a unique name for the cache directory (defaults to a UUID)
    - string - default: `null`
- **`-V` `--verbose`**
    - Show verbose output
    - bool - default: `false`
- **`--zip`**
    - Create a zip file (set to false to skip)
    - bool - default: `true`

A more complex migration command could look like this:

```sh
migrate beehiiv-api --key 1234abcd --id pub_abcd1234 --postsAfter 2024-01-01 --postsBefore 2024-12-31 --verbose
```

This will migrate only posts published in 2024, and show all available output in the console.


## HTML Processing

The `processHTML` function transforms beehiiv email HTML into clean, Ghost-compatible HTML. It applies the following transformations in order:

1. **Variable replacement** — Removes beehiiv template variables (`{{subscriber_id}}`, `{{rp_refer_url}}`, etc.)
2. **Content extraction** — Extracts content from `#content-blocks`
3. **Horizontal rules** — Converts empty `div[style*="border-top"]` to `<hr>`
4. **Sponsored content** — Converts tables containing "Sponsored Content" to Ghost HTML cards (see below)
5. **Images** — Converts `<img>` to Ghost image cards with captions
6. **Blockquotes** — Converts nested `padding-left` divs to `<blockquote>`
7. **Buttons** — Converts `<a><button>` to Ghost button cards
8. **Subscribe links** — Rewrites `/subscribe` links to `/#/portal/signup`
9. **Bookmark cards** — Converts `.generic-embed--root` to Ghost bookmark cards
10. **Audio** — Unwraps audio iframes from table wrappers
11. **YouTube** — Converts YouTube iframes to Ghost embed cards
12. **Cleanup** — Removes empty paragraphs, `<style>` tags, mobile ads, style attributes, and heading formatting


### Sponsored Content

beehiiv sponsored content blocks (styled `<table>` elements containing "Sponsored Content" text) are converted to Ghost HTML cards:

```html
<!--kg-card-begin: html-->
<div class="mg-sponsored" data-mg-skip="image-card">
  <p> Sponsored Content </p>
  <h2> Ad Heading </h2>
  <div><a href="..."><img src="..."></a></div>
  <p> Ad body text </p>
  <a href="...">Learn more</a>
</div>
<!--kg-card-end: html-->
```

- Inner `<div>` elements containing text are converted to `<p>` tags
- Inner `<div>` elements containing images are preserved as-is
- Bare `<br>` elements between blocks are removed


### `data-mg-skip`

The `data-mg-skip` attribute controls which processing steps are skipped for elements and their descendants. This prevents content inside marked elements from being transformed by later processing steps.

Supported values:

| Value | Effect |
|---|---|
| `image-card` | Images inside this element are not converted to Ghost image cards |


## Develop

This is a mono repository, managed with [lerna](https://lerna.js.org).

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `yarn` to install top-level dependencies.


## Run

To run a local development copy, `cd` into this directory, and replace `migrate` with `yarn dev`, like so:

```sh
yarn dev beehiiv-api --key 1234abcd --id pub_abcd1234
```


## Test

- `yarn lint` run just eslint
- `yarn test` run lint and tests


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
