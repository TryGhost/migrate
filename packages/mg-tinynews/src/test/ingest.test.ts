import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {join} from 'node:path';
import {ingest, parse} from '../index.js';
import type {TinyNewsInput} from '../index.js';
import {article, cleanUp, events, fixtureInput, fixtures, memoryContext, writeExport} from './helpers.js';

async function collect(input: TinyNewsInput) {
    const records = [];
    for await (const record of parse(input)) {
        records.push(record);
    }
    return records;
}

describe('parse', function () {
    after(cleanUp);

    it('yields articles, pages, newsletters and authors as records keyed by their IDs', async function () {
        const records = await collect(fixtureInput());

        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                ['post', 'article:id:444', 'json', {file: 'articles.json', type: 'article', index: 0}],
                ['post', 'article:id:430', 'json', {file: 'articles.json', type: 'article', index: 1}],
                ['post', 'article:id:426', 'json', {file: 'articles.json', type: 'article', index: 2}],
                ['post', 'page:id:12', 'json', {file: 'pages.json', type: 'page', index: 0}],
                ['post', 'page:id:13', 'json', {file: 'pages.json', type: 'page', index: 1}],
                ['post', 'newsletter:id:3', 'json', {file: 'newsletters.json', type: 'newsletter', index: 0}],
                ['post', 'newsletter:id:4', 'json', {file: 'newsletters.json', type: 'newsletter', index: 1}],
                ['author', 'name:Lorem Ipsum', 'json', {file: 'author-multiple.json', type: 'author', index: 0}],
                ['author', 'name:Dolor Simet', 'json', {file: 'author-multiple.json', type: 'author', index: 1}]
            ]
        );
        assert.equal(JSON.parse(records[0].content).slug, 'all-embeds-and-formatting');
    });

    it('reads only the files given, keying items without an ID by slug or name', async function () {
        const input = await writeExport({
            articles: [
                {id: ' 7 ', slug: 'seven'},
                {slug: 'no-id'},
                {id: '', slug: ' '},
                {id: Number.NaN as unknown as number}
            ],
            authors: [
                {id: 5, first_names: 'Has', last_name: 'Id'},
                {first_names: 'No', last_name: 'Id'},
                {email: 'x@example.com'}
            ]
        });

        assert.deepEqual(
            (await collect(input)).map(record => [record.kind, record.key]),
            [
                ['post', 'article:id:7'],
                ['post', 'article:slug:no-id'],
                ['post', null],
                ['post', null],
                ['author', 'id:5'],
                ['author', 'name:No Id'],
                ['author', null]
            ]
        );
    });

    it('rejects input without an articles file', async function () {
        await assert.rejects(collect({articles: ' '}), /needs an articles JSON file \(--articles\)/);
        await assert.rejects(ingest({} as TinyNewsInput, await memoryContext()), /needs an articles JSON file/);
    });

    it('rejects items that are not objects and malformed or missing files', async function () {
        await assert.rejects(
            collect(await writeExport({articles: '[{"id": 1}, [2]]'})),
            /^Error: articles\.json: item 1 is not a Tiny News article$/
        );
        await assert.rejects(collect(await writeExport({articles: '[null]'})), /item 0 is not a Tiny News article/);
        await assert.rejects(
            collect(await writeExport({articles: [], newsletters: '{"data": {"newsletter_editions": [1]}}'})),
            /newsletters\.json: item 0 is not a Tiny News newsletter/
        );
        await assert.rejects(collect(await writeExport({articles: '[{"id": 1},'})), (error: Error) => {
            assert.ok(error instanceof SyntaxError);
            assert.match(error.message, /^articles\.json: Unexpected end of JSON at position 11$/);
            return true;
        });
        await assert.rejects(
            collect(await writeExport({articles: [], authors: '[]'})),
            /authors\.json: Expected an object at the top level/
        );
        await assert.rejects(collect({articles: join(fixtures, 'missing.json')}), {code: 'ENOENT'});
    });
});

describe('ingest', function () {
    after(cleanUp);

    it('stores the export and records which files were read', async function () {
        const context = await memoryContext();
        await ingest(fixtureInput(), context);

        assert.equal(context.sources.hasCompletedIngestion, true);
        assert.deepEqual(context.sources.currentIngestion!.metadata, {
            adapter: 'tinynews',
            files: {
                articles: 'articles.json',
                pages: 'pages.json',
                newsletters: 'newsletters.json',
                authors: 'author-multiple.json'
            }
        });
        assert.equal(context.sources.count('post'), 7);
        assert.equal(context.sources.count('author'), 2);
        await context.close();
    });

    it('keeps the most recently published copy of a repeated item', async function () {
        const older = await article(1);
        const newer = await article(1, {
            translations: [{...older.translations![0], headline: 'Newer', last_published_at: '2024-01-01T00:00:00Z'}]
        });
        const context = await memoryContext();
        await ingest(
            await writeExport({
                articles: [older, newer, {...older, translations: [{...older.translations![0], headline: 'Tie'}]}],
                newsletters: [
                    {id: 2, headline: 'First', newsletter_published_at: '2023-01-01'},
                    {id: 2, headline: 'Undated'}
                ],
                authors: [
                    {first_names: 'Same', last_name: 'Name', email: 'one@example.com'},
                    {first_names: 'Same', last_name: 'Name', email: 'two@example.com'}
                ]
            }),
            context
        );

        assert.equal(
            JSON.parse(context.sources.get('post', 'article:id:1')!.content).translations[0].headline,
            'Newer'
        );
        assert.equal(JSON.parse(context.sources.get('post', 'newsletter:id:2')!.content).headline, 'First');
        assert.equal(JSON.parse(context.sources.get('author', 'name:Same Name')!.content).email, 'one@example.com');
        assert.deepEqual(
            events(context, 'source:conflict').map(event => [
                event.details.key,
                event.details.reason,
                event.details.retained.index
            ]),
            [
                ['article:id:1', 'Later record replaced the earlier one', 1],
                ['article:id:1', 'Earlier record retained', 1],
                ['newsletter:id:2', 'Earlier record retained', 0],
                ['name:Same Name', 'Earlier record retained', 0]
            ]
        );
        await context.close();
    });

    it('stores an empty export, and keeps the stored export when a reread fails', async function () {
        const context = await memoryContext();
        await ingest(await writeExport({articles: []}), context);
        assert.equal(context.sources.hasCompletedIngestion, true);
        assert.equal(context.sources.count(), 0);

        await ingest(await writeExport({articles: [await article(1)]}), context, {replace: true});
        await assert.rejects(ingest(await writeExport({articles: '[{'}), context, {replace: true}), SyntaxError);
        assert.equal(context.sources.count('post'), 1);
        await assert.rejects(ingest(await writeExport({articles: []}), context), /replace/);
        await context.close();
    });
});
