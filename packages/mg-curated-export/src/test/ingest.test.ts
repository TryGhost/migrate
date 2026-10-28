import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {readdir} from 'node:fs/promises';
import {join} from 'node:path';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {ingest, parse} from '../index.js';
import type {ImageCache} from '../index.js';
import {
    IMAGE,
    PNG,
    cleanUp,
    events,
    exportFiles,
    fileCache,
    ingested,
    issue,
    issueFixture,
    makeZip,
    memoryContext
} from './helpers.js';

async function parsed(files: Record<string, string | Buffer>): Promise<SourceRecordInput[]> {
    const records: SourceRecordInput[] = [];
    for await (const record of parse(await makeZip(files))) {
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

    it('yields issues and original images keyed by their path, without reading images', async function () {
        const records = await parsed({
            ...(await exportFiles([await issueFixture()])),
            [`data-export/issues/published/12/square_thumb_${IMAGE}`]: PNG,
            [`data-export/issues/published/12/original_ratio_medium_${IMAGE}`]: PNG,
            [`data-export/issues/published/12/original_ratio_extra_large_${IMAGE}`]: PNG,
            'data-export/issues/published/12/notes.txt': 'Not an image',
            'data-export/issues/published/12/photos/nested.png': PNG,
            'data-export/issues/draft/14/14.json': JSON.stringify(await issue(14)),
            'data-export/subscribers.csv': 'email\nperson@example.com\n'
        });

        assert.deepEqual(records.map(record => [record.kind, record.key, record.format, record.metadata]).sort(), [
            ['image', `published/12/${IMAGE}`, 'json', {file: `data-export/issues/published/12/${IMAGE}`}],
            ['issue', 'published/12/12.json', 'json', {file: 'data-export/issues/published/12/12.json'}]
        ]);
        const image = records.find(record => record.kind === 'image')!;
        assert.deepEqual(JSON.parse(image.content), {
            file: `data-export/issues/published/12/${IMAGE}`,
            size: PNG.length
        });
        const stored = records.find(record => record.kind === 'issue')!;
        assert.deepEqual(JSON.parse(stored.content), await issueFixture());
    });

    it('reads an export inside a top-level directory, and images with upper-case extensions', async function () {
        const records = await parsed({
            'my-export/data-export/issues/published/3/3.json': JSON.stringify(await issue(3)),
            'my-export/data-export/issues/published/3/Photo.JPEG': PNG
        });

        assert.deepEqual(records.map(record => [record.key, record.metadata!.file]).sort(), [
            ['published/3/3.json', 'my-export/data-export/issues/published/3/3.json'],
            ['published/3/Photo.JPEG', 'my-export/data-export/issues/published/3/Photo.JPEG']
        ]);
    });

    it('rejects an export without published issues', async function () {
        await assert.rejects(
            parsed({'data-export/subscribers.csv': 'email\n', 'data-export/issues/published/12/image.png': PNG}),
            /No published Curated issues found/
        );
    });

    it('rejects an issue file that is not a JSON object', async function () {
        await assert.rejects(
            parsed({'data-export/issues/published/1/1.json': '{"title":'}),
            /data-export\/issues\/published\/1\/1\.json is not valid JSON/
        );
        await assert.rejects(
            parsed({'data-export/issues/published/1/1.json': '[1, 2]'}),
            /data-export\/issues\/published\/1\/1\.json is not a Curated issue/
        );
        await assert.rejects(parsed({'data-export/issues/published/1/1.json': 'null'}), /is not a Curated issue/);
    });
});

describe('ingest', function () {
    after(cleanUp);

    it('stores the export and writes each original image into the file cache', async function () {
        const cache = await fileCache();
        const pathToZip = await makeZip({
            ...(await exportFiles([await issueFixture()])),
            'data-export/issues/published/12/Photo One.jpeg': PNG
        });
        const context = await memoryContext();
        await ingest(pathToZip, context, {fileCache: cache});

        assert.equal(context.sources.hasCompletedIngestion, true);
        assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'curated', file: 'export.zip'});
        assert.equal(context.sources.count('issue'), 1);
        assert.deepEqual(context.sources.get('image', `published/12/${IMAGE}`)!.metadata, {
            file: `data-export/issues/published/12/${IMAGE}`,
            outputPath: `/content/images/12/${IMAGE}`
        });
        // File names are sanitized the way the file cache stores them, and the HTML uses the stored path.
        assert.equal(
            context.sources.get('image', 'published/12/Photo One.jpeg')!.metadata.outputPath,
            '/content/images/12/photo-one.jpg'
        );
        assert.deepEqual((await readdir(join(cache.imageDir, '12'))).sort(), [
            IMAGE,
            IMAGE.replace('.png', '_o.png'),
            'photo-one.jpg',
            'photo-one_o.jpg'
        ]);
        await context.close();
    });

    it('keeps the first copy of a repeated path and writes its image once', async function () {
        const written: string[] = [];
        const cache = await fileCache();
        const counting: ImageCache = {
            resolveImageFileName: filename => cache.resolveImageFileName(filename),
            writeContentFile: async (data, options) => {
                written.push(options.outputPath);
                return cache.writeContentFile(data, options);
            }
        };
        const context = await ingested(
            {
                ...(await exportFiles([await issueFixture()])),
                'backup/data-export/issues/published/12/12.json': JSON.stringify(await issue(12, {title: 'Copy'})),
                [`backup/data-export/issues/published/12/${IMAGE}`]: Buffer.concat([PNG, PNG])
            },
            counting
        );

        assert.equal(context.sources.count('issue'), 1);
        assert.equal(context.sources.count('image'), 1);
        assert.deepEqual(written, [`/content/images/12/${IMAGE}`]);
        const conflicts = events(context, 'source:conflict');
        assert.deepEqual(conflicts.map(event => [event.details.kind, event.details.reason]).sort(), [
            ['image', 'Earlier record retained'],
            ['issue', 'Earlier record retained']
        ]);
        await context.close();
    });

    it('needs a file cache, and replaces stored data only when asked', async function () {
        const context = await memoryContext();
        const pathToZip = await makeZip(await exportFiles([await issue(1)]));
        await assert.rejects(ingest(pathToZip, context, {} as any), /needs a fileCache/);

        const cache = await fileCache();
        await ingest(pathToZip, context, {fileCache: cache});
        await assert.rejects(ingest(pathToZip, context, {fileCache: cache}), /replace/);

        // A failed reread keeps the stored export.
        const broken = await makeZip({'data-export/issues/published/2/2.json': 'oops'});
        await assert.rejects(ingest(broken, context, {replace: true, fileCache: cache}), /not valid JSON/);
        assert.deepEqual(
            (await stored(context)).map(record => record.key),
            ['published/1/1.json']
        );

        await ingest(await makeZip(await exportFiles([await issue(2)])), context, {replace: true, fileCache: cache});
        assert.deepEqual(
            (await stored(context)).map(record => record.key),
            ['published/2/2.json']
        );
        await context.close();
    });
});
