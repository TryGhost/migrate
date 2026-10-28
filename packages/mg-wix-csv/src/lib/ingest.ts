import {basename} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecord, SourceRecordInput} from '@tryghost/mg-context';
import {parseDate} from './process.js';
import type {WixRow} from './types.js';

/** A row's key: `id:<ID>`, else `url:<Post Page URL>`, else `slug:<Slug>`, else `null`. */
function rowKey(row: WixRow): string | null {
    if (row.ID) {
        return `id:${row.ID}`;
    }
    if (row['Post Page URL']) {
        return `url:${row['Post Page URL']}`;
    }
    return row.Slug ? `slug:${row.Slug}` : null;
}

/**
 * Yield each row of a Wix posts CSV as a `post` record, one row at a time and without storing it. Rows are keyed
 * by the export's `ID`, else their `Post Page URL`, else their `Slug`; a row with none of these is unkeyed.
 */
export async function* parse(pathToCsv: string): AsyncGenerator<SourceRecordInput> {
    const file = basename(pathToCsv);
    let row = 0;
    for await (const data of fsUtils.csv.streamRows(pathToCsv)) {
        row += 1;
        yield {
            kind: 'post',
            key: rowKey(data),
            content: JSON.stringify(data),
            format: 'json',
            metadata: {file, row}
        };
    }
}

/** When a row was last published, or NaN when it has no valid date. */
const published = (content: string) => {
    const row: WixRow = JSON.parse(content);
    return (parseDate(row['Last Published Date']) ?? parseDate(row['Published Date']))?.getTime() ?? NaN;
};

/** The more recently published version of a post wins; a tie or an undated row keeps the earlier one. */
function newer(existing: SourceRecord, incoming: SourceRecordInput): 'keep' | 'replace' {
    return published(incoming.content) > published(existing.content) ? 'replace' : 'keep';
}

/**
 * Read a Wix posts CSV into `context.sources`. A post that appears more than once keeps its most recently published
 * row (the first on a tie) and reports a `source:conflict` when the rows differ. Explicit `replace: true` is
 * required when completed source data exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToCsv: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'wix-csv', file: basename(pathToCsv)}}, async stage => {
        for await (const record of parse(pathToCsv)) {
            stage.reconcile(record, {choose: newer});
        }
    });
}
