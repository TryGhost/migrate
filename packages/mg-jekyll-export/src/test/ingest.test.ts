import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {ingest, parse} from '../index.js';
import {cleanUp, events, ingested, makeDirectory, makeZip, memoryContext, post} from './helpers.js';

async function parsed(input: string): Promise<SourceRecordInput[]> {
    const records: SourceRecordInput[] = [];
    for await (const record of parse(input)) {
        records.push(record);
    }
    return records;
}

async function stored(context: MigrateContext) {
    const records = [];
    for await (const record of context.sources.records()) {
        records.push(record);
    }
    return records;
}

const site = {
    '_posts/2021-08-23-first.md': post({title: 'First'}),
    '_posts/notes/2021-08-24-nested.markdown': post({title: 'Nested'}),
    '_posts/2021-08-25-page.html': post({title: 'HTML'}, '<p>HTML</p>'),
    '_drafts/draft.md': post({title: 'Draft'}),
    '_posts/image.jpg': 'Not a post',
    '_config.yml': 'title: Site',
    'about.md': post({title: 'About'}),
    'blog/_posts/2021-08-26-elsewhere.md': post({title: 'Not in the site root'})
};

describe('parse', function () {
    after(cleanUp);

    it('yields each post and draft file of a zip as a post record keyed by its path', async function () {
        const records = await parsed(await makeZip(site));

        assert.deepEqual(records.map(record => [record.kind, record.key, record.format]).sort(), [
            ['post', '_drafts/draft.md', 'markdown'],
            ['post', '_posts/2021-08-23-first.md', 'markdown'],
            ['post', '_posts/2021-08-25-page.html', 'html'],
            ['post', '_posts/notes/2021-08-24-nested.markdown', 'markdown']
        ]);
        assert.equal(
            records.find(record => record.key === '_posts/2021-08-23-first.md')!.content,
            site['_posts/2021-08-23-first.md']
        );
    });

    it('reads a zip holding the site in a directory, or only its _posts directory', async function () {
        const wrapped = await parsed(await makeZip({'my-site/_posts/2021-01-01-a.md': post({title: 'A'})}));
        const postsOnly = await parsed(await makeZip({'_posts/2021-01-01-a.md': post({title: 'A'})}));

        assert.deepEqual(
            wrapped.map(record => record.key),
            ['_posts/2021-01-01-a.md']
        );
        assert.deepEqual(
            postsOnly.map(record => record.key),
            ['_posts/2021-01-01-a.md']
        );
    });

    it('reads the site directory in path order', async function () {
        const records = await parsed(await makeDirectory(site));

        assert.deepEqual(
            records.map(record => [record.key, record.format]),
            [
                ['_drafts/draft.md', 'markdown'],
                ['_posts/2021-08-23-first.md', 'markdown'],
                ['_posts/2021-08-25-page.html', 'html'],
                ['_posts/notes/2021-08-24-nested.markdown', 'markdown']
            ]
        );
    });

    it('rejects an input without posts', async function () {
        const pathToZip = await makeZip({'_config.yml': 'title: Site', 'about.md': 'About'});

        await assert.rejects(parsed(pathToZip), /site\.zip: No Jekyll posts found/);
        await assert.rejects(parsed(await makeDirectory({'about.md': 'About'})), /No Jekyll posts found/);
    });
});

describe('ingest', function () {
    after(cleanUp);

    it('stores the posts with the export name in the ingestion metadata', async function () {
        const context = await ingested(site);
        try {
            assert.equal((await stored(context)).length, 4);
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'jekyll', file: 'site.zip'});
        } finally {
            await context.close();
        }
    });

    it('keeps the first copy of a repeated path and reports the conflict', async function () {
        // The zip's only top-level directory is `_posts/`, so `_posts/_posts/a.md` is named `_posts/a.md`, the same
        // path as `_posts/a.md` itself.
        const context = await ingested({
            '_posts/2021-01-01-a.md': post({title: 'Outer'}),
            '_posts/_posts/2021-01-01-a.md': post({title: 'Inner'})
        });
        try {
            const records = await stored(context);
            assert.equal(records.length, 1);
            assert.equal(records[0].key, '_posts/2021-01-01-a.md');
            assert.equal(events(context, 'source:conflict').length, 1);
        } finally {
            await context.close();
        }
    });

    it('needs replace to read again, and keeps the stored posts when a read fails', async function () {
        const context = await memoryContext();
        try {
            await ingest(await makeZip(site), context);
            await assert.rejects(ingest(await makeZip(site), context), /explicitly request replacement/);
            await assert.rejects(
                ingest(await makeZip({'about.md': 'About'}), context, {replace: true}),
                /No Jekyll posts found/
            );
            assert.equal((await stored(context)).length, 4);

            await ingest(await makeDirectory({'_posts/2021-01-01-only.md': post({title: 'Only'})}), context, {
                replace: true
            });
            assert.deepEqual(
                (await stored(context)).map(record => record.key),
                ['_posts/2021-01-01-only.md']
            );
        } finally {
            await context.close();
        }
    });
});
