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

`zip.entries()`, `csv.streamRows()` and `json.streamArray()` read large exports one item at a time, so an archive, CSV or JSON file is never held in memory as a whole.

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

```js
for await (const author of fsUtils.json.streamArray('/path/to/authors.json', {path: ['data', 'authors']})) {
    // One parsed item of {"data": {"authors": [...]}} at a time
}
```

- `json.streamArray(pathOrStream, {path})` is an async generator of the items of one array in a JSON file or readable stream, each parsed with `JSON.parse()`. `path` lists the keys leading to the array: the default `[]` reads a top-level array. Only the item being read is held; other values are skipped. The rest of the input is still read after the array, so malformed JSON anywhere rejects with a `SyntaxError` giving its position, as does a path that does not lead to an array. The first of repeated keys is used. The input stream is destroyed if the caller stops early.


### Input files

`listInputFiles(path, globPattern)` resolves a source's input path to the files to read, for sources that accept either one file or a directory of them.

```js
const files = await fsUtils.listInputFiles('/path/to/exports', '*.zip');
// [{path: '/path/to/exports/a.zip', name: 'a.zip'}, {path: '/path/to/exports/b.zip', name: 'b.zip'}]
```

A file gives itself, named by its base name. A directory gives the files matching the [fast-glob](https://github.com/mrmlnc/fast-glob) pattern, sorted by path, named by their path relative to the directory with `/` separators. Hidden files are left out, a directory with no matches gives an empty list, and a missing path rejects with `ENOENT`.


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
