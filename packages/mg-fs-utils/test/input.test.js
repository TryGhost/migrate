import assert from 'node:assert/strict';
import {describe, it, before, after} from 'node:test';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, relative} from 'node:path';
import {listInputFiles} from '../lib/input.js';

describe('listInputFiles', function () {
    let directory;

    before(async function () {
        directory = await mkdtemp(join(tmpdir(), 'list-input-files-test-'));
        await mkdir(join(directory, 'nested'));
        await mkdir(join(directory, 'empty'));
        for (const name of ['b.zip', 'a.zip', 'nested/c.zip', 'notes.txt', '.hidden.zip']) {
            await writeFile(join(directory, name), name);
        }
    });

    after(async function () {
        await rm(directory, {recursive: true, force: true});
    });

    it('returns a single file with its base name', async function () {
        const relativePath = relative(process.cwd(), join(directory, 'nested', 'c.zip'));
        assert.deepEqual(await listInputFiles(relativePath, '*.zip'), [
            {path: join(directory, 'nested', 'c.zip'), name: 'c.zip'}
        ]);
    });

    it('returns the files in a directory matching the pattern, sorted, without hidden files', async function () {
        assert.deepEqual(await listInputFiles(directory, '*.zip'), [
            {path: join(directory, 'a.zip'), name: 'a.zip'},
            {path: join(directory, 'b.zip'), name: 'b.zip'}
        ]);
        assert.deepEqual(
            (await listInputFiles(directory, '**/*.zip')).map(file => file.name),
            ['a.zip', 'b.zip', 'nested/c.zip']
        );
    });

    it('returns an empty list for a directory without matching files', async function () {
        assert.deepEqual(await listInputFiles(join(directory, 'empty'), '**/*.zip'), []);
    });

    it('rejects a missing path', async function () {
        await assert.rejects(listInputFiles(join(directory, 'missing'), '*.zip'), /ENOENT/);
    });
});
