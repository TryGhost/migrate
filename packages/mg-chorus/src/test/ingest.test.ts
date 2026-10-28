import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {ingest, parse} from '../index.js';
import {
    FULL,
    SIMPLE,
    cleanUp,
    entry,
    entryFiles,
    entryFixture,
    events,
    ingested,
    makeDirectory,
    makeZip,
    memoryContext
} from './helpers.js';

async function parsed(input: string | string[]): Promise<SourceRecordInput[]> {
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

describe('parse', function () {
    after(cleanUp);

    it('yields each entry file of a zip as an entry record keyed by its uid', async function () {
        const full = await entryFixture(FULL);
        const pathToZip = await makeZip({
            [FULL]: JSON.stringify(full),
            'entries.csv': 'uid\nEntry:0969db64-b8d7-11ed-afa1-0242ac120001\n',
            'notes/Entry:readme.txt': 'Not an entry'
        });
        const records = await parsed(pathToZip);

        assert.deepEqual(
            records.map(record => [record.kind, record.key, record.format, record.metadata]),
            [
                [
                    'entry',
                    'Entry:0969db64-b8d7-11ed-afa1-0242ac120001',
                    'json',
                    {file: 'export.zip', path: `chorus-export/${FULL}`}
                ]
            ]
        );
        assert.deepEqual(JSON.parse(records[0].content), full);
    });

    it('reads entries anywhere in a zip, keyed by file name when the entry has no uid', async function () {
        const records = await parsed(
            await makeZip({
                'chorus/Entry:a.json': JSON.stringify(await entry('a')),
                'chorus/more/Entry:b.json': JSON.stringify(await entry('b', {uid: ' '})),
                'other/Entry:c.json': JSON.stringify(await entry('c', {uid: undefined}))
            })
        );

        assert.deepEqual(records.map(record => [record.key, record.metadata!.path]).sort(), [
            ['Entry:a', 'chorus-export/chorus/Entry:a.json'],
            ['Entry:b', 'chorus-export/chorus/more/Entry:b.json'],
            ['Entry:c', 'chorus-export/other/Entry:c.json']
        ]);
    });

    it('reads a directory of entry files, and several inputs in order', async function () {
        const directory = await makeDirectory({
            'Entry:b.json': JSON.stringify(await entry('b')),
            'nested/Entry:a.json': JSON.stringify(await entry('a')),
            'entries.csv': 'uid\n',
            'export.zip': 'Not read'
        });
        const pathToZip = await makeZip(entryFiles([await entry('c')]), 'more.zip');
        const records = await parsed([pathToZip, directory]);

        assert.deepEqual(
            records.map(record => [record.key, record.metadata]),
            [
                ['Entry:c', {file: 'more.zip', path: 'chorus-export/Entry:c.json'}],
                ['Entry:b', {file: 'export', path: 'Entry:b.json'}],
                ['Entry:a', {file: 'export', path: 'nested/Entry:a.json'}]
            ]
        );
    });

    it('rejects an input without entries', async function () {
        await assert.rejects(parsed(await makeZip({'entries.csv': 'uid\n'})), /export\.zip: No Chorus entries found/);
        await assert.rejects(parsed(await makeDirectory({'notes.txt': 'Hello'})), /export: No Chorus entries found/);
    });

    it('rejects an entry file that is not a JSON object', async function () {
        await assert.rejects(parsed(await makeZip({'Entry:a.json': '{"title":'})), /Entry:a\.json is not valid JSON/);
        await assert.rejects(parsed(await makeZip({'Entry:a.json': '[1, 2]'})), /Entry:a\.json is not a Chorus entry/);
        await assert.rejects(parsed(await makeDirectory({'Entry:a.json': 'null'})), /is not a Chorus entry/);
    });
});

describe('ingest', function () {
    after(cleanUp);

    it('stores every entry of one or more exports', async function () {
        const context = await memoryContext();
        const first = await makeZip(entryFiles([await entry('a'), await entry('b')]), 'one.zip');
        const second = await makeDirectory(entryFiles([await entry('c')]));
        await ingest([first, second], context);

        assert.equal(context.sources.hasCompletedIngestion, true);
        assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'chorus', files: ['one.zip', 'export']});
        assert.deepEqual(
            (await stored(context)).map(record => record.key),
            ['Entry:a', 'Entry:b', 'Entry:c']
        );
        await context.close();

        const single = await memoryContext();
        await ingest(first, single);
        assert.deepEqual(single.sources.currentIngestion!.metadata, {adapter: 'chorus', files: ['one.zip']});
        assert.equal(single.sources.count('entry'), 2);
        await single.close();
    });

    it('keeps the latest version of a repeated entry and reports the conflict', async function () {
        const older = await entry('a', {title: 'Older', updatedAt: '2020-01-01T00:00:00.000Z'});
        const newer = await entry('a', {title: 'Newer', updatedAt: '2020-02-01T00:00:00.000Z'});
        const undated = await entry('a', {title: 'Undated', updatedAt: undefined});
        const context = await memoryContext();
        await ingest(
            [
                await makeZip({'Entry:a.json': JSON.stringify(older)}, 'one.zip'),
                await makeZip({'Entry:a.json': JSON.stringify(newer)}, 'two.zip'),
                await makeZip({'Entry:a.json': JSON.stringify(older), 'Entry:a (1).json': JSON.stringify(undated)})
            ],
            context
        );

        assert.equal(context.sources.count('entry'), 1);
        assert.equal(JSON.parse(context.sources.get('entry', 'Entry:a')!.content).title, 'Newer');
        assert.deepEqual(
            events(context, 'source:conflict').map(event => [event.details.reason, event.details.file]),
            [
                ['Later record replaced the earlier one', 'two.zip'],
                ['Earlier record retained', 'export.zip'],
                ['Earlier record retained', 'export.zip']
            ]
        );
        await context.close();
    });

    it('keeps the first of two copies with the same updatedAt, such as the package fixtures', async function () {
        const context = await memoryContext();
        await ingest(
            await makeDirectory({
                [FULL]: JSON.stringify(await entryFixture(FULL)),
                [SIMPLE]: JSON.stringify(await entryFixture(SIMPLE))
            }),
            context
        );
        assert.equal(context.sources.count('entry'), 1);
        assert.deepEqual(
            JSON.parse(context.sources.get('entry', 'Entry:0969db64-b8d7-11ed-afa1-0242ac120001')!.content),
            await entryFixture(FULL)
        );
        assert.equal(events(context, 'source:conflict').length, 1);
        await context.close();
    });

    it('needs an input, and replaces stored data only when asked', async function () {
        const context = await ingested([await entry('a')]);
        await assert.rejects(ingest([], context, {replace: true}), /needs at least one export/);
        const pathToZip = await makeZip(entryFiles([await entry('b')]));
        await assert.rejects(ingest(pathToZip, context), /replace/);

        // A failed reread keeps the stored export.
        await assert.rejects(
            ingest(await makeZip({'Entry:c.json': 'oops'}), context, {replace: true}),
            /not valid JSON/
        );
        assert.deepEqual(
            (await stored(context)).map(record => record.key),
            ['Entry:a']
        );

        await ingest(pathToZip, context, {replace: true});
        assert.deepEqual(
            (await stored(context)).map(record => record.key),
            ['Entry:b']
        );
        await context.close();
    });
});
