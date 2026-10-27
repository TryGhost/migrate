import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {mkdtemp, readdir, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import AdmZip from 'adm-zip';
import zip from '../lib/zip.js';

/** Write a zip of `[name, contents]` pairs; names ending in `/` are directories. AdmZip stores them sorted by name. */
async function makeZip(path, files) {
    const archive = new AdmZip();
    for (const [name, contents] of files) {
        archive.addFile(name, Buffer.from(contents ?? ''));
    }
    await writeFile(path, archive.toBuffer());
    return path;
}

async function collect(iterable) {
    const result = [];
    for await (const entry of iterable) {
        result.push({
            name: entry.name,
            path: entry.path,
            isDirectory: entry.isDirectory,
            text: String(await entry.read())
        });
    }
    return result;
}

async function nestedTempDirs() {
    return (await readdir(tmpdir())).filter(name => name.startsWith('mg-fs-utils-zip-'));
}

describe('Zip entries', function () {
    let directory;

    before(async function () {
        directory = await mkdtemp(join(tmpdir(), 'zip-entries-test-'));
    });

    after(async function () {
        await rm(directory, {recursive: true, force: true});
    });

    it('Yields each entry with its contents, skipping macOS metadata', async function () {
        const path = await makeZip(join(directory, 'flat.zip'), [
            ['posts.csv', 'a,b\n1,2\n'],
            ['posts/', null],
            ['posts/1.first.html', '<p>First</p>'],
            ['__MACOSX/posts/._1.first.html', 'junk'],
            ['posts/.DS_Store', 'junk']
        ]);

        assert.deepEqual(await collect(zip.entries(path)), [
            {name: 'posts.csv', path: 'posts.csv', isDirectory: false, text: 'a,b\n1,2\n'},
            {name: 'posts/', path: 'posts/', isDirectory: true, text: ''},
            {name: 'posts/1.first.html', path: 'posts/1.first.html', isDirectory: false, text: '<p>First</p>'}
        ]);
    });

    it('Streams entry contents and reports their size', async function () {
        const path = await makeZip(join(directory, 'stream.zip'), [['big.txt', 'x'.repeat(100000)]]);

        for await (const entry of zip.entries(path)) {
            assert.equal(entry.size, 100000);
            let length = 0;
            for await (const chunk of await entry.stream()) {
                length += chunk.length;
            }
            assert.equal(length, 100000);
        }
    });

    it('Removes a single top-level directory from entry names', async function () {
        const withDirectory = await makeZip(join(directory, 'top.zip'), [
            ['export/', null],
            ['export/posts.csv', 'csv'],
            ['__MACOSX/._export', 'junk'],
            ['export/posts/1.first.html', 'html']
        ]);
        const withoutDirectory = await makeZip(join(directory, 'top-implicit.zip'), [
            ['export/posts.csv', 'csv'],
            ['export/posts/1.first.html', 'html']
        ]);

        for (const path of [withDirectory, withoutDirectory]) {
            const entries = await collect(zip.entries(path));
            assert.deepEqual(
                entries.map(entry => [entry.name, entry.path]),
                [
                    ['posts.csv', 'export/posts.csv'],
                    ['posts/1.first.html', 'export/posts/1.first.html']
                ]
            );
        }
    });

    it('Keeps names when entries do not share one top-level directory', async function () {
        const twoDirectories = await makeZip(join(directory, 'two.zip'), [
            ['one/a.txt', 'a'],
            ['two/b.txt', 'b'],
            ['one/c.txt', 'c']
        ]);
        const rootFile = await makeZip(join(directory, 'root.zip'), [
            ['a-readme.txt', 'r'],
            ['one/a.txt', 'a']
        ]);

        assert.deepEqual(
            (await collect(zip.entries(twoDirectories))).map(entry => entry.name),
            ['one/a.txt', 'one/c.txt', 'two/b.txt']
        );
        assert.deepEqual(
            (await collect(zip.entries(rootFile))).map(entry => entry.name),
            ['a-readme.txt', 'one/a.txt']
        );
    });

    it('Yields nothing for an empty zip or one holding only a directory', async function () {
        const empty = await makeZip(join(directory, 'empty.zip'), []);
        const onlyDirectory = await makeZip(join(directory, 'only-directory.zip'), [['export/', null]]);

        assert.deepEqual(await collect(zip.entries(empty)), []);
        assert.deepEqual(await collect(zip.entries(onlyDirectory)), []);
    });

    it('Skips entries rejected by the filter', async function () {
        const path = await makeZip(join(directory, 'filter.zip'), [
            ['posts.csv', 'csv'],
            ['posts/1.first.html', 'html'],
            ['posts/1.first.csv', 'stats']
        ]);

        const seen = [];
        const entries = await collect(
            zip.entries(path, {
                filter: entry => {
                    seen.push(entry.name);
                    return entry.name.endsWith('.html');
                }
            })
        );

        assert.deepEqual(seen, ['posts.csv', 'posts/1.first.csv', 'posts/1.first.html']);
        assert.deepEqual(
            entries.map(entry => entry.name),
            ['posts/1.first.html']
        );
    });

    it('Reads a zip that holds only another zip as the inner zip, then removes the extracted copy', async function () {
        const inner = await makeZip(join(directory, 'inner.zip'), [
            ['export/posts.csv', 'csv'],
            ['export/posts/1.first.html', 'html']
        ]);
        const outer = new AdmZip();
        outer.addLocalFile(inner, '', 'export.zip');
        outer.addFile('__MACOSX/._export.zip', Buffer.from('junk'));
        const path = join(directory, 'outer.zip');
        await writeFile(path, outer.toBuffer());
        const before = await nestedTempDirs();

        assert.deepEqual(
            (await collect(zip.entries(path))).map(entry => [entry.name, entry.text]),
            [
                ['posts.csv', 'csv'],
                ['posts/1.first.html', 'html']
            ]
        );
        assert.deepEqual(await nestedTempDirs(), before);

        // Only one level is unwrapped, and stopping early still removes the extracted copy.
        const twice = new AdmZip();
        twice.addLocalFile(path, '', 'outer.zip');
        const twicePath = join(directory, 'twice.zip');
        await writeFile(twicePath, twice.toBuffer());
        for await (const entry of zip.entries(twicePath)) {
            assert.equal(entry.name, 'export.zip');
            break;
        }
        assert.deepEqual(await nestedTempDirs(), before);
    });

    it('Does not unwrap a zip holding several zips', async function () {
        const path = await makeZip(join(directory, 'several.zip'), [
            ['one.zip', 'not really a zip'],
            ['two.zip', 'not really a zip']
        ]);

        assert.deepEqual(
            (await collect(zip.entries(path))).map(entry => entry.name),
            ['one.zip', 'two.zip']
        );
    });

    it('Rejects a missing or invalid zip file', async function () {
        const invalid = join(directory, 'invalid.zip');
        await writeFile(invalid, 'not a zip');

        for (const path of [join(directory, 'missing.zip'), invalid]) {
            await assert.rejects(collect(zip.entries(path)), error => {
                assert.equal(error.errorType, 'InternalServerError');
                assert.match(error.message, /^Unable to read zip file /);
                return true;
            });
        }
    });
});
