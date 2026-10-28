import assert from 'node:assert/strict';
import {after, describe, it} from 'node:test';
import {contentStats, ingest, parse} from '../index.js';
import {cleanUp, emailsJson, events, fixture, fixtureExport, ingested, makeZip, memoryContext} from './helpers.js';

const email = (id: string, slug = id) => ({
    id,
    subject: `Title ${id}`,
    publish_date: '2024-01-01 00:00:00+00:00',
    slug
});

async function records(path: string) {
    const result = [];
    for await (const record of parse(path)) {
        result.push(record);
    }
    return result;
}

describe('Buttondown ingest', () => {
    after(cleanUp);

    it('counts the email bodies without reading them', async () => {
        const stats = await contentStats(await makeZip(await fixtureExport()));
        assert.deepEqual(stats, {posts: 2});
    });

    it('yields each email in emails.json and each body, keyed by id and path', async () => {
        const result = await records(await makeZip(await fixtureExport()));
        const emails = result.filter(record => record.kind === 'email');
        assert.deepEqual(
            emails.map(record => [record.key, record.format, record.metadata]),
            [
                ['abcd1234-7fee-4942-a9cf-0de5d4ebb255', 'json', {file: 'emails.json', index: 0}],
                ['efab5678-16d8-4e02-979f-38fdfbe04624', 'json', {file: 'emails.json', index: 1}]
            ]
        );
        assert.equal(JSON.parse(emails[0].content).subject, 'This is a Plain Post');
        const bodies = result.filter(record => record.kind === 'body');
        assert.deepEqual(bodies.map(record => record.key).sort(), ['emails/fancy-post.md', 'emails/plain-post.md']);
        const plain = bodies.find(record => record.key === 'emails/plain-post.md')!;
        assert.equal(plain.format, 'markdown');
        assert.equal(plain.content, await fixture('emails/plain-post.md'));
        assert.deepEqual(plain.metadata, {file: 'emails/plain-post.md'});
    });

    it('reads emails.csv rows when there is no emails.json', async () => {
        const result = await records(await makeZip(await fixtureExport('emails.csv')));
        const emails = result.filter(record => record.kind === 'email');
        assert.deepEqual(
            emails.map(record => [record.key, record.metadata]),
            [
                ['abcd1234-7fee-4942-a9cf-0de5d4ebb255', {file: 'emails.csv', row: 1}],
                ['efab5678-16d8-4e02-979f-38fdfbe04624', {file: 'emails.csv', row: 2}]
            ]
        );
        assert.equal(JSON.parse(emails[1].content).publish_date, '2023-01-05 13:00:00+00:00');
    });

    it('prefers emails.json over emails.csv, and matches files inside a top-level directory', async () => {
        const files = await fixtureExport();
        const result = await records(
            await makeZip({
                'export/emails.csv': 'id,subject,publish_date,slug\ncsv-only,From CSV,2024-01-01,csv-only\n',
                'export/emails.json': files['emails.json'],
                'export/emails/plain-post.md': files['emails/plain-post.md'],
                'export/notes.md': 'Not an email body'
            })
        );
        assert.deepEqual(result.map(record => [record.kind, record.key, record.metadata!.file]).sort(), [
            ['body', 'emails/plain-post.md', 'export/emails/plain-post.md'],
            ['email', 'abcd1234-7fee-4942-a9cf-0de5d4ebb255', 'export/emails.json'],
            ['email', 'efab5678-16d8-4e02-979f-38fdfbe04624', 'export/emails.json']
        ]);
    });

    it('yields emails without an id unkeyed', async () => {
        const result = await records(
            await makeZip({
                'emails.json': emailsJson([{subject: 'No ID', slug: 'no-id'}, null]),
                'emails/no-id.md': 'Body'
            })
        );
        assert.deepEqual(
            result.filter(record => record.kind === 'email').map(record => record.key),
            [undefined, undefined]
        );
        const rows = await records(
            await makeZip({
                'emails.csv': 'id,subject,publish_date,slug\n,No ID,2024-01-01,no-id\n',
                'emails/no-id.md': 'Body'
            })
        );
        assert.deepEqual(
            rows.filter(record => record.kind === 'email').map(record => record.key),
            [undefined]
        );
    });

    it('rejects an export without an email list', async () => {
        await assert.rejects(
            records(await makeZip({'emails/plain-post.md': 'Body', 'subscribers.csv': 'email\n'})),
            /No emails data found in zip \(expected emails\.json or emails\.csv\)/
        );
    });

    it('rejects an emails.json that is not a list', async () => {
        await assert.rejects(
            records(await makeZip({'emails.json': '{"id": "one"}', 'emails/one.md': 'Body'})),
            /emails\.json is not a list of emails/
        );
    });

    it('rejects an export whose emails have no bodies, but reads an empty export', async () => {
        await assert.rejects(
            records(await makeZip({'emails.json': emailsJson([email('one')])})),
            /No email bodies \(emails\/\*\.md\) found/
        );
        const context = await ingested({'emails.csv': 'id,subject,publish_date,slug\n'});
        assert.equal(context.sources.hasCompletedIngestion, true);
        assert.equal(context.sources.count(), 0);
        await context.close();
    });

    it('stores the export, keeps the first of a repeated id and reports the conflict', async () => {
        const context = await ingested({
            'emails.json': emailsJson([email('one'), {...email('one'), subject: 'Changed'}, email('two')]),
            'emails/one.md': 'One',
            'emails/two.md': 'Two'
        });
        try {
            assert.equal(context.sources.count('email'), 2);
            assert.equal(JSON.parse(context.sources.get('email', 'one')!.content).subject, 'Title one');
            assert.equal(context.sources.get('body', 'emails/two.md')!.content, 'Two');
            assert.deepEqual(context.sources.currentIngestion!.metadata, {adapter: 'buttondown', file: 'export.zip'});
            const [conflict] = events(context, 'source:conflict');
            assert.equal(conflict.details.key, 'one');
            assert.equal(conflict.details.reason, 'Earlier record retained');
        } finally {
            await context.close();
        }
    });

    it('requires replace to read again, and keeps the stored export when a reread fails', async () => {
        const context = await ingested(await fixtureExport());
        try {
            const path = await makeZip({'emails.json': emailsJson([email('new')]), 'emails/new.md': 'New'});
            await assert.rejects(ingest(path, context));
            await assert.rejects(ingest(await makeZip({'emails/new.md': 'New'}), context, {replace: true}));
            assert.equal(context.sources.count('email'), 2);
            await ingest(path, context, {replace: true});
            assert.deepEqual(context.sources.get('email', 'new')?.key, 'new');
            assert.equal(context.sources.count('email'), 1);
        } finally {
            await context.close();
        }
    });

    it('ingests into a context opened by the caller', async () => {
        const context = await memoryContext();
        try {
            await ingest(await makeZip(await fixtureExport('emails.csv')), context);
            assert.equal(context.sources.count('body'), 2);
        } finally {
            await context.close();
        }
    });
});
