import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {SourceRecordInput} from '@tryghost/mg-context';
import {contentStats, ingest, parse} from '../index.js';
import {CSV_HEADER, cleanUp, csvRow, events, fixtureFiles, makeZip, memoryContext} from './helpers.js';

async function records(path: string): Promise<SourceRecordInput[]> {
    const result = [];
    for await (const record of parse(path)) {
        result.push(record);
    }
    return result;
}

describe('Reading a Substack export', function () {
    after(cleanUp);

    it('yields posts.csv rows keyed by post_id and HTML files keyed by file name', async function () {
        const result = await records(await makeZip(await fixtureFiles()));

        const posts = result.filter(record => record.kind === 'post');
        assert.deepEqual(
            posts.map(record => [record.key, record.metadata]),
            [
                ['123401.plain-text', {file: 'posts.csv', row: 1}],
                ['123402.podcast', {file: 'posts.csv', row: 2}],
                ['123403.thread', {file: 'posts.csv', row: 3}],
                ['123404.draft-text', {file: 'posts.csv', row: 4}],
                ['123405.about-us', {file: 'posts.csv', row: 5}]
            ]
        );
        assert.equal(posts[0].format, 'json');
        assert.equal(JSON.parse(posts[0].content).subtitle, '&#x201C;This quote&#x2019;s rather short&#x201D;');

        const html = result.filter(record => record.kind === 'html');
        assert.deepEqual(html.map(record => record.key).sort(), [
            '123401.plain-text.html',
            '123402.podcast.html',
            '123403.thread.html',
            '123404.draft-text.html',
            '123405.about-us.html'
        ]);
        assert.equal(html[0].format, 'html');
        assert.match(html[0].content, /<p>/);
    });

    it('reads exports inside a top-level directory and ignores other files', async function () {
        const path = await makeZip({
            'my-export/posts.csv': `${CSV_HEADER}\n${csvRow({post_id: '1.one', type: 'newsletter'})}\n`,
            'my-export/posts/1.one.html': '<p>One</p>',
            'my-export/posts/1.one.opens.csv': 'stats',
            'my-export/email_list.csv': 'email\nperson@example.com\n',
            '__MACOSX/my-export/posts/._1.one.html': 'junk'
        });

        const result = await records(path);
        assert.deepEqual(result.map(record => [record.kind, record.key, record.metadata]).sort(), [
            ['html', '1.one.html', {file: 'my-export/posts/1.one.html'}],
            ['post', '1.one', {file: 'my-export/posts.csv', row: 1}]
        ]);
        assert.deepEqual(await contentStats(path), {posts: 1});
    });

    it('keeps rows without a post_id as unkeyed records', async function () {
        const path = await makeZip({'posts.csv': `${CSV_HEADER}\n${csvRow({title: 'No ID'})}\n`});

        const [record] = await records(path);
        assert.equal(record.key, undefined);
    });

    it('rejects an export without posts.csv', async function () {
        const path = await makeZip({'posts/1.one.html': '<p>One</p>'});

        await assert.rejects(records(path), /No posts.csv found in the Substack export/);
        const context = await memoryContext();
        try {
            await assert.rejects(ingest(path, context), /No posts.csv found/);
            assert.equal(context.sources.hasCompletedIngestion, false);
        } finally {
            await context.close();
        }
    });

    it('stores the export, keeping the first of duplicate post IDs', async function () {
        const path = await makeZip({
            'a/posts.csv': `${CSV_HEADER}\n${csvRow({post_id: '1.one', title: 'First'})}\n`,
            'b/posts.csv': `${CSV_HEADER}\n${csvRow({post_id: '1.one', title: 'Second'})}\n`,
            'a/posts/1.one.html': '<p>One</p>'
        });
        const context = await memoryContext();
        try {
            await ingest(path, context);
            assert.equal(context.sources.hasCompletedIngestion, true);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'substack', file: 'export.zip'});
            assert.equal(context.sources.count('post'), 1);
            assert.equal(JSON.parse(context.sources.get('post', '1.one')!.content).title, 'First');
            assert.equal(context.sources.get('html', '1.one.html')!.content, '<p>One</p>');
            const [conflict] = events(context, 'source:conflict');
            assert.equal(conflict.details.key, '1.one');
            assert.equal(conflict.details.file, 'b/posts.csv');

            await assert.rejects(ingest(path, context), /replace/);
            await ingest(await makeZip({'posts.csv': `${CSV_HEADER}\n`}), context, {replace: true});
            assert.equal(context.sources.count(), 0);
            assert.equal(context.sources.hasCompletedIngestion, true);
        } finally {
            await context.close();
        }
    });
});
