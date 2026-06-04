# Wix CSV Migration

Migrate Wix blog posts from a posts CSV export into a Ghost import file.

## Usage

```bash
migrate wix-csv --posts /path/to/posts.csv --url https://example.com
```

By default, the command reads posts, converts Wix rich content to Ghost-compatible HTML/Lexical, downloads Wix-hosted assets, and writes a Ghost import zip.

## Options

| Option                  | Type    | Default  | Description                                                                                                         |
|-------------------------|---------|----------|---------------------------------------------------------------------------------------------------------------------|
| `--posts`               | string  | `null`   | Path to the Wix posts CSV file. Required.                                                                           |
| `--url`                 | string  | `null`   | URL to the live Wix site, used for source URLs and link fixing. Required.                                           |
| `--defaultAuthorName`   | string  | `null`   | Fallback author name when the CSV row has no author.                                                                |
| `--scrape`              | array   | `assets` | Asset scraping mode. Use `assets`, `img`, `media`, or `files` to download assets; use `none` to skip.               |
| `--includeMainCategory` | boolean | `true`   | Include the `Main Category` column as Ghost tags. Note: option name intentionally matches the current CLI spelling. |
| `--includeCategories`   | boolean | `true`   | Include the `Categories` column as Ghost tags. Supports plain category names and legacy JSON arrays.                |
| `--includeTags`         | boolean | `true`   | Include the `Tags` column as Ghost tags.                                                                            |
| `--tmpPath`             | string  | `null`   | Full path for temporary migration files. Defaults to the migrator cache location.                                   |
| `--outputPath`          | string  | `null`   | Full path where the final zip should be saved. Defaults to the current working directory.                           |
| `--cacheName`           | string  | `null`   | Custom cache name. Defaults to a name derived from the site URL.                                                    |
| `--cache`               | boolean | `true`   | Keep the local cache after migration completes. Only applies when `--zip` is enabled.                               |
| `--zip`                 | boolean | `true`   | Create a Ghost import zip. Set to `false` to write only the import JSON/cache output.                               |
| `-V`, `--verbose`       | boolean | `false`  | Show verbose output. Defaults to `true` when `DEBUG` is set.                                                        |
| `--veryVerbose`         | boolean | `false`  | Show very verbose output. Implies `--verbose`.                                                                      |
| `--ghostApiUrl`         | string  | `null`   | Ghost site URL used to fetch existing users for author matching.                                                    |
| `--ghostAdminKey`       | string  | `null`   | Ghost Admin API key used with `--ghostApiUrl`.                                                                      |

## Taxonomy

The migrator always adds the internal source tag `#wix`.

CSV taxonomy fields are controlled independently:

```bash
migrate wix-csv --posts /path/to/posts.csv --url https://example.com --includeMainCategory false --includeCategories true --includeTags false
```

For updated Wix CSV exports, `Categories` may contain readable names such as `Tax Planning`. Older exports may contain JSON arrays of IDs. The migrator accepts both formats.

## Content Notes

- `Rich Content` is used as the source of post body HTML.
- `Plain Content` is used as fallback content when `Rich Content` is empty or invalid.
- `Internal ID` is mapped to Ghost `comment_id`.
- Wix image URLs are converted to original static media URLs, for example `https://static.wixstatic.com/media/<media-id>`.


# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
