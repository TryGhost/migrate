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

### Scrape from all domains

Use `allowAllDomains` to scrape assets from any domain, optionally excluding specific ones:

```javascript
const scraper = new AssetScraper(fileCache, {
    allowAllDomains: true,
    blockedDomains: [
        'https://ads.example.com',
        'https://tracking.example.com'
    ]
}, ctx);
```

## Options

| Option                | Type       | Default     | Description                                                            |
|-----------------------|------------|-------------|------------------------------------------------------------------------|
| `domains`             | `string[]` | `[]`        | Whitelist of allowed domains to scrape from (include protocol)         |
| `allowAllDomains`     | `boolean`  | `false`     | Scrape from any domain instead of using whitelist                      |
| `blockedDomains`      | `string[]` | `[]`        | Domains to exclude when `allowAllDomains` is `true`                    |
| `optimize`            | `boolean`  | `true`      | Optimize images using sharp                                            |
| `findOnlyMode`        | `boolean`  | `false`     | Only discover assets, don't download (access via `scraper.foundItems`) |
| `baseUrl`             | `string`   | `undefined` | Base URL for resolving relative URLs (only needed for Ghost JSON exports) |
| `processBase64Images` | `boolean`  | `false`     | Extract embedded base64 images and save as files                       |
| `allowImages`         | `boolean`  | `true`      | Process image files                                                    |
| `allowMedia`          | `boolean`  | `true`      | Process audio/video files                                              |
| `allowFiles`          | `boolean`  | `true`      | Process documents (PDF, etc.)                                          |

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
