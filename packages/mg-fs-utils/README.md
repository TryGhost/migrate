# Migrate Fs Utils

## Install

`npm install @tryghost/mg-fs-utils --save`

or

`pnpm add @tryghost/mg-fs-utils`


## Usage

You can add `.env` file in the root of this package to set a different local cache path.
By default, it will create a temporary folder in the system's temp directory, but you may want to chang this to a more permanent location. Setting `CACHE_PATH` in `.env` will override the default.

```env
CACHE_PATH=/path/to/cache
```


### Streaming readers

`zip.entries()` and `csv.streamRows()` read large exports one item at a time, so an archive or CSV is never held in memory as a whole.

```js
import fsUtils from '@tryghost/mg-fs-utils';

for await (const entry of fsUtils.zip.entries('/path/to/export.zip', {filter: entry => !entry.isDirectory})) {
    if (entry.name === 'posts.csv') {
        for await (const row of fsUtils.csv.streamRows(await entry.stream())) {
            // One parsed row at a time
        }
    } else {
        const contents = await entry.read(); // A Buffer of this entry only
    }
}
```

- `zip.entries(zipPath, {filter})` is an async generator of `{name, path, isDirectory, size, read(), stream()}`. Names are normalised much as `zip.read()` does: `__MACOSX` and `.DS_Store` entries are skipped, a top-level directory that holds every entry is removed from names, and a zip that holds only another zip is read as that inner zip. `path` is the unmodified name in the archive. `filter(entry)` returning false skips an entry. Call `read()` or `stream()` before the iteration finishes; the archive is closed when it does.
- `csv.streamRows(pathOrStream, options)` is an async generator of parsed rows from a file path or a readable stream. Options go to `csv-parse` and default to those of `csv.parseCSV()`. The input stream is destroyed if the caller stops early.


## Develop

This is a mono repository, managed with [Nx](https://nx.dev/) and pnpm workspaces.

Follow the instructions for the top-level repo.
1. `git clone` this repo & `cd` into it as usual
2. Run `pnpm install` to install top-level dependencies.


## Run

- `pnpm dev`


## Test

- `pnpm test` runs the package tests
- Linting and formatting are run from the repo root (`pnpm lint`, `pnpm format`)




# Copyright & License

Copyright (c) 2013-2026 Ghost Foundation - Released under the [MIT license](LICENSE).
