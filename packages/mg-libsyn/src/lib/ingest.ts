import type {MigrateContext, SourceRecord, SourceRecordInput} from '@tryghost/mg-context';
import {xmlUtils} from '@tryghost/mg-utils';
import {feedUrl, parse} from './fetch.js';
import {parseDate} from './processor.js';

const {getText} = xmlUtils;

export interface IngestOptions {
    /** Replace completed source data. Without it, ingesting into a context that has source data throws. */
    replace?: boolean;
}

const published = (record: SourceRecord | SourceRecordInput): number =>
    parseDate(getText(JSON.parse(record.content).pubDate))?.getTime() ?? -Infinity;

/**
 * Fetch the site's feed into `context.sources`: an `item` record per episode, keyed `guid:<guid>` (or `link:<link>`),
 * and the channel's metadata as one `channel` record. The feed URL is recorded in the ingestion metadata, and every
 * option applies in `map()`. An item repeated in the feed keeps its latest `pubDate` and reports a `source:conflict`.
 */
export async function ingest(
    url: string,
    context: MigrateContext,
    {replace = false}: IngestOptions = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'libsyn', feed: feedUrl(url)}}, async stage => {
        for await (const record of parse(url)) {
            stage.reconcile(record, {
                choose: (existing, incoming) => (published(incoming) > published(existing) ? 'replace' : 'keep'),
                reportIdentical: true
            });
        }
    });
}
