import assert from 'node:assert/strict';
import {it} from 'node:test';
import {mkdtemp, writeFile, mkdir, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {inspectSource, contentStats} from '../index.js';

it('discovers nested XML files in deterministic order without hashing source identity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'wp-input-'));
    try {
        await mkdir(join(directory, 'nested'));
        await writeFile(join(directory, 'nested', 'b.xml'), '<rss><channel/></rss>');
        await writeFile(
            join(directory, 'a.xml'),
            '<rss><channel><item><wp:post_type>post</wp:post_type></item></channel></rss>'
        );
        const first = await inspectSource(directory);
        assert.deepEqual(
            first.files.map(file => file.name),
            ['a.xml', 'nested/b.xml']
        );
        assert.deepEqual(await contentStats(first), {posts: 1, pages: 0});
        assert.deepEqual(await inspectSource(directory), first);
        await writeFile(join(directory, 'a.xml'), '<rss/>');
        assert.deepEqual(await inspectSource(directory), first);
        assert.deepEqual(await contentStats(first), {posts: 0, pages: 0});
        await rm(join(directory, 'a.xml'));
        await rm(join(directory, 'nested'), {recursive: true});
        await assert.rejects(inspectSource(directory), /No XML files/);
        await assert.rejects(inspectSource(join(directory, 'missing')), /ENOENT/);
    } finally {
        await rm(directory, {recursive: true});
    }
});
