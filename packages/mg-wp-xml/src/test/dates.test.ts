import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MigrateContext} from '@tryghost/mg-context';
import {inspectSource, ingest, map} from '../index.js';
import {postDates} from '../lib/process.js';

const iso = (date: Date | undefined) => date?.toISOString();

describe('WordPress dates', () => {
    it('prefers post_date_gmt, then pubDate, then post_date, and uses post_modified_gmt for updates', () => {
        const published = {
            'wp:post_date': '2025-07-26 23:37:40',
            'wp:post_date_gmt': '2025-07-27 03:37:40',
            pubDate: 'Sun, 27 Jul 2025 03:00:00 +0000',
            'wp:post_modified_gmt': '2025-07-28 10:00:00'
        };
        assert.deepEqual([postDates(published).published, postDates(published).modified].map(iso), [
            '2025-07-27T03:37:40.000Z',
            '2025-07-28T10:00:00.000Z'
        ]);
        assert.equal(
            iso(postDates({...published, 'wp:post_date_gmt': '0000-00-00 00:00:00'}).published),
            '2025-07-27T03:00:00.000Z'
        );
        // Never-published drafts: empty pubDate (or -0001 from older WordPress) and a zeroed post_date_gmt.
        for (const pubDate of ['', 'Mon, 30 Nov -0001 00:00:00 +0000']) {
            const draft = {
                pubDate,
                'wp:post_date': '2018-07-23 00:57:23',
                'wp:post_date_gmt': '0000-00-00 00:00:00',
                'wp:post_modified_gmt': '0000-00-00 00:00:00'
            };
            assert.deepEqual([postDates(draft).published, postDates(draft).modified].map(iso), [
                '2018-07-23T00:57:23.000Z',
                '2018-07-23T00:57:23.000Z'
            ]);
        }
        assert.deepEqual(postDates({pubDate: '', 'wp:post_date_gmt': '0000-00-00 00:00:00'}), {
            published: undefined,
            modified: undefined
        });
    });

    it('imports never-published drafts and skips only items without any valid date', async () => {
        const directory = await mkdtemp(join(tmpdir(), 'wp-dates-'));
        const context = new MigrateContext({storage: 'memory'});
        const item = (id: string, dates: string) =>
            `<item><wp:post_id>${id}</wp:post_id><title>Draft ${id}</title><link>https://example.com/?p=${id}</link><wp:post_name></wp:post_name><wp:post_type>post</wp:post_type><wp:status>draft</wp:status><content:encoded><![CDATA[<p>Body</p>]]></content:encoded>${dates}</item>`;
        try {
            await context.init();
            await writeFile(
                join(directory, 'export.xml'),
                '<rss><channel><link>https://example.com</link>' +
                    item(
                        '252',
                        '<pubDate></pubDate><wp:post_date>2018-07-23 00:57:23</wp:post_date><wp:post_date_gmt>0000-00-00 00:00:00</wp:post_date_gmt><wp:post_modified>2018-07-23 00:57:23</wp:post_modified><wp:post_modified_gmt>0000-00-00 00:00:00</wp:post_modified_gmt>'
                    ) +
                    item(
                        '772',
                        '<pubDate></pubDate><wp:post_date>2025-05-12 09:33:22</wp:post_date><wp:post_date_gmt>0000-00-00 00:00:00</wp:post_date_gmt><wp:post_modified>2025-05-12 09:33:22</wp:post_modified><wp:post_modified_gmt>2025-05-12 13:33:22</wp:post_modified_gmt>'
                    ) +
                    item(
                        '800',
                        '<pubDate>Mon, 30 Nov -0001 00:00:00 +0000</pubDate><wp:post_date>2019-02-03 04:05:06</wp:post_date>'
                    ) +
                    item('900', '<pubDate></pubDate><wp:post_date_gmt>0000-00-00 00:00:00</wp:post_date_gmt>') +
                    '</channel></rss>'
            );
            await ingest(await inspectSource(directory), context);
            assert.deepEqual(await map({}, context), {selected: 4, imported: 3, skipped: 1});
            assert.deepEqual(
                (await context.getAllPosts()).map(post => [
                    post.lookupKey,
                    iso(post.get('created_at')),
                    iso(post.get('updated_at'))
                ]),
                [
                    ['id:252', '2018-07-23T00:57:23.000Z', '2018-07-23T00:57:23.000Z'],
                    ['id:772', '2025-05-12T09:33:22.000Z', '2025-05-12T13:33:22.000Z'],
                    ['id:800', '2019-02-03T04:05:06.000Z', '2019-02-03T04:05:06.000Z']
                ]
            );
            const skipped = context.getMigrationReport().events.filter(event => event.type === 'record:skipped');
            assert.deepEqual(
                skipped.map(event => (event.details as any).reason),
                ['Invalid WordPress publication date']
            );
        } finally {
            await context.close();
            await rm(directory, {recursive: true, force: true});
        }
    });
});
