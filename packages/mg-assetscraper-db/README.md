# Asset Scraper

Downloads remote assets from Ghost migration data and replaces URLs with local Ghost paths.

## What It Does

- Discovers remote assets (images, media, files) in posts, tags, users, settings, newsletters, and snippets
- Downloads and stores them locally in Ghost's content structure (`/content/images`, `/content/media`, `/content/files`)
- Replaces remote URLs with `__GHOST_URL__/content/...` paths
- Caches downloads in SQLite to avoid re-downloading duplicates
- Auto-converts unsupported formats (HEIC/HEIF → JPEG, AVIF → WebP)

## Usage

```javascript
import AssetScraper from '@tryghost/mg-assetscraper-db';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

// Create file cache for storing downloaded assets
const fileCache = new fsUtils.FileCache('my-migration');

// Migration data to process
const ctx = {
    posts: [...],
    tags: [...],
    users: [...],
    settings: [...],
    newsletters: [...]
};

// Initialize scraper
const scraper = new AssetScraper(fileCache, {
    domains: [
        'https://old-site.com',
        'https://cdn.image-service.com'
    ]
}, ctx);

await scraper.init();

// Run asset scraping tasks
const tasks = scraper.getTasks();
const taskRunner = makeTaskRunner(tasks, {
    concurrent: 5
});
await taskRunner.run();

// Check for any failed downloads
console.log(scraper.failedDownloads);
```

### Scrape from a Ghost JSON export file

Instead of passing data objects, you can pass a path to a Ghost JSON export file. The scraper reads the file, processes all assets, and can write an updated file with local asset paths.

```javascript
import AssetScraper from '@tryghost/mg-assetscraper-db';
import fsUtils from '@tryghost/mg-fs-utils';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';

const fileCache = new fsUtils.FileCache('my-migration', {
    tmpPath: '/path/to/tmp',
    batchName: 'batch-name'
});

const scraper = new AssetScraper(fileCache, {
    allowAllDomains: true
}, '/path/to/ghost.json');

await scraper.init();

const tasks = scraper.getTasks();
const taskRunner = makeTaskRunner(tasks, {
    verbose: false,
    exitOnError: false,
    concurrent: false
});
await taskRunner.run();

// Write the updated JSON with local asset references
await scraper.writeUpdatedJson();

// Or write to a different path
await scraper.writeUpdatedJson('/path/to/output.json');
```

Downloaded assets are stored under the FileCache's zip directory in Ghost's content structure (e.g. `{tmpPath}/mg/{cacheKey}/zip/content/images/...`).

Both Ghost export formats are supported:

- `{ db: [{ data: { posts: [...], ... } }] }` — standard Ghost export
- `{ data: { posts: [...], ... } }` — flat format

The output preserves whichever format the input used.

### Per-object usage with MigrateContext

Use `processAssets` when working with [mg-context](../mg-context)'s `MigrateContext`. It's duck-typed — it works with any object that has `get(field)` and `set(field, value)` methods, so it handles posts, tags, and authors equally. Fields not in the object's schema are silently skipped.

It processes two categories of fields:

1. **Content fields** (`html`, `lexical`, `codeinjection_head`, `codeinjection_foot`) — scans the content string for asset URLs, downloads them, and replaces URLs inline
2. **Image URL fields** (`feature_image`, `og_image`, `twitter_image`, `profile_image`, `cover_image`, etc.) — downloads the image at the URL and replaces it with a local `__GHOST_URL__/content/images/...` path

Process posts, tags, and authors in separate loops. Tags and authors are much smaller sets than posts, so they get their own passes rather than being processed redundantly on every post:

```javascript
await context.forEachPost(async (post) => {
    await scraper.processAssets(post);
});

await context.forEachTag(async (tag) => {
    await scraper.processAssets(tag);
});

await context.forEachAuthor(async (author) => {
    await scraper.processAssets(author);
});
```

No explicit `save()` is needed — `forEachPost`, `forEachTag`, and `forEachAuthor` each save automatically after the callback returns. The asset cache deduplicates downloads across all three loops, so the same image URL is only fetched once.

The old `getTasks()` method is still available for the legacy pipeline.

### Scrape from all domains

Use `allowAllDomains` to scrape assets from any domain, optionally excluding specific ones. You can also supple a regular expression (as a literal or object)

```javascript
const scraper = new AssetScraper(fileCache, {
    allowAllDomains: true,
    blockedDomains: [
        'https://ads.example.com',
        /https?:\/\/[a-z0-9-]+.example.com/,
        new Regexp('https?://[a-z0-9-]+.other-example.com')
    ]
}, ctx);
```

**Note:** When using `allowAllDomains` without any custom `domains` or `blockedDomains`, only URLs with file extensions (e.g., `.jpg`, `.png`, `.mp4`) are scraped. This prevents scraping non-asset URLs like API endpoints or web pages. Adding custom domain configuration disables this filter.

## Options

| Option                | Type                   | Default     | Description                                                               |
|-----------------------|------------------------|-------------|---------------------------------------------------------------------------|
| `domains`             | `string[]`             | `[]`        | Whitelist of allowed domains to scrape from (include protocol)            |
| `allowAllDomains`     | `boolean`              | `false`     | Scrape from any domain instead of using whitelist                         |
| `blockedDomains`      | `(string \| RegExp)[]` | `[]`        | Domains to exclude when `allowAllDomains` is `true`                       |
| `optimize`            | `boolean`              | `true`      | Optimize images using sharp                                               |
| `findOnlyMode`        | `boolean`              | `false`     | Only discover assets, don't download (access via `scraper.foundItems`)    |
| `baseUrl`             | `string`               | `undefined` | Base URL for resolving relative URLs (only needed for Ghost JSON exports) |
| `processBase64Images` | `boolean`              | `false`     | Extract embedded base64 images and save as files                          |

## Context Object

The context object contains the Ghost migration data to process. Pass data directly or via `result.data`:

```javascript
// Direct format
{
    posts: [...],
    posts_meta: [...],
    tags: [...],
    users: [...],
    settings: [...],
    custom_theme_settings: [...],
    snippets: [...],
    newsletters: [...]
}

// Alternative format
{
    result: {
        data: {
            posts: [...],
            // etc.
        }
    }
}
```

## Supported File Types

- **Images:** JPEG, PNG, GIF, WebP, SVG, ICO, AVIF, HEIC, HEIF
- **Media:** MP4, WebM, OGG, MP3, WAV, M4A
- **Files:** PDF, JSON, XML, RTF, OpenDocument formats, Microsoft Office formats

## Notes

- HEIC/HEIF images are automatically converted to JPEG
- AVIF images are automatically converted to WebP
- The SQLite cache prevents re-downloading assets across multiple runs
- Failed downloads are tracked in `scraper.failedDownloads`:

```javascript
[
    {
        src: 'https://example.com/image.jpg',
        status: 404,        // HTTP status code
        skip: 'Not Found'   // Reason for failure
    }
]
```
