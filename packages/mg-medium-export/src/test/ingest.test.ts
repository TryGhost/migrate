import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {SourceRecordInput} from '@tryghost/mg-context';
import {contentStats, ingest, parse} from '../index.js';
import {cleanUp, events, fixture, makeZip, memoryContext, postPage, profilePage, tempDirectory} from './helpers.js';

async function records(path: string): Promise<SourceRecordInput[]> {
    const result = [];
    for await (const record of parse(path)) {
        result.push(record);
    }
    return result;
}

const summary = (items: SourceRecordInput[]) => items.map(record => [record.kind, record.key, record.metadata]);

describe('Reading a Medium export', function () {
    after(cleanUp);

    it('yields the profile keyed by zip name and posts keyed by their path, ignoring other files', async function () {
        const path = await makeZip({
            'profile/profile.html': await fixture('profile/profile.html'),
            'profile/about.html': '<p>About</p>',
            'posts/2018-08-11_Basic-efefef121212.html': await fixture('posts/basic-post.html'),
            'posts/draft_Draft-ababab121212.html': await fixture('posts/draft-post.html'),
            'posts/notes.txt': 'not a post',
            'README.html': '<p>Readme</p>',
            '__MACOSX/posts/._2018-08-11_Basic-efefef121212.html': 'junk'
        });

        const result = await records(path);
        assert.deepEqual(summary(result), [
            [
                'post',
                'posts/2018-08-11_Basic-efefef121212.html',
                {file: 'export.zip', path: 'posts/2018-08-11_Basic-efefef121212.html'}
            ],
            [
                'post',
                'posts/draft_Draft-ababab121212.html',
                {file: 'export.zip', path: 'posts/draft_Draft-ababab121212.html'}
            ],
            ['profile', 'export.zip', {file: 'export.zip', path: 'profile/profile.html'}]
        ]);
        assert.equal(result[0].format, 'html');
        assert.equal(result[0].content, await fixture('posts/basic-post.html'));
        assert.deepEqual(await contentStats(path), {posts: 2, users: 1});
    });

    it('reads exports inside a top-level directory', async function () {
        const path = await makeZip({
            'medium-export/profile/profile.html': profilePage(),
            'medium-export/posts/2020-01-01_One-abc123.html': postPage()
        });

        assert.deepEqual(summary(await records(path)), [
            [
                'post',
                'posts/2020-01-01_One-abc123.html',
                {file: 'export.zip', path: 'medium-export/posts/2020-01-01_One-abc123.html'}
            ],
            ['profile', 'export.zip', {file: 'export.zip', path: 'medium-export/profile/profile.html'}]
        ]);
    });

    it('reads a directory of export zips in name order', async function () {
        const directory = await tempDirectory();
        await makeZip({'posts/2020-01-02_Two-abc2.html': postPage()}, {directory, name: 'b.zip'});
        await makeZip(
            {'profile/profile.html': profilePage(), 'posts/2020-01-01_One-abc1.html': postPage()},
            {directory, name: 'a.zip'}
        );
        await writeFile(join(directory, 'notes.txt'), 'not an export');

        assert.deepEqual(
            (await records(directory)).map(record => [record.kind, record.key]),
            [
                ['post', 'posts/2020-01-01_One-abc1.html'],
                ['profile', 'a.zip'],
                ['post', 'posts/2020-01-02_Two-abc2.html']
            ]
        );
        assert.deepEqual(await contentStats(directory), {posts: 2, users: 1});
    });

    it('rejects a directory without zips, and zips without a profile or posts', async function () {
        const empty = join(await tempDirectory(), 'empty');
        await mkdir(empty);
        await assert.rejects(records(empty), /No zip files found in/);
        await assert.rejects(contentStats(empty), /No zip files found in/);

        const other = await makeZip({'README.html': '<p>Not Medium</p>'});
        await assert.rejects(records(other), /No Medium profile or posts found in the export/);
        const context = await memoryContext();
        try {
            await assert.rejects(ingest(other, context), /No Medium profile or posts found/);
            assert.equal(context.sources.hasCompletedIngestion, false);
        } finally {
            await context.close();
        }
    });

    it('stores the export, keeping the first copy of a post found in two zips', async function () {
        const directory = await tempDirectory();
        await makeZip(
            {'profile/profile.html': profilePage(), 'posts/2020-01-01_One-abc1.html': postPage({title: 'First'})},
            {directory, name: 'a.zip'}
        );
        await makeZip(
            {'profile/profile.html': profilePage(), 'posts/2020-01-01_One-abc1.html': postPage({title: 'Second'})},
            {directory, name: 'b.zip'}
        );
        const context = await memoryContext();
        try {
            await ingest(directory, context);
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {
                adapter: 'medium',
                files: ['a.zip', 'b.zip']
            });
            assert.equal(context.sources.count('post'), 1);
            assert.equal(context.sources.count('profile'), 2);
            assert.match(context.sources.get('post', 'posts/2020-01-01_One-abc1.html')!.content, /First/);
            const [conflict] = events(context, 'source:conflict');
            assert.equal(conflict.details.key, 'posts/2020-01-01_One-abc1.html');
            assert.equal(conflict.details.file, 'b.zip');

            await assert.rejects(ingest(directory, context), /replace/);
            await ingest(await makeZip({'profile/profile.html': profilePage()}), context, {replace: true});
            assert.equal(context.sources.count('post'), 0);
            assert.equal(context.sources.count('profile'), 1);
        } finally {
            await context.close();
        }
    });
});
