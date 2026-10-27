import {basename} from 'node:path';
import fsUtils from '@tryghost/mg-fs-utils';
import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';

/**
 * Yield each row of a beehiiv posts CSV as a `post` record keyed by its `id`, one row at a time and without
 * storing it. Rows without an `id` are yielded unkeyed.
 */
export async function* parse(pathToCsv: string): AsyncGenerator<SourceRecordInput> {
    const file = basename(pathToCsv);
    let row = 0;
    for await (const data of fsUtils.csv.streamRows(pathToCsv)) {
        row += 1;
        yield {
            kind: 'post',
            key: data.id || undefined,
            content: JSON.stringify(data),
            format: 'json',
            metadata: {file, row}
        };
    }
}

/**
 * Read a beehiiv posts CSV into `context.sources`. An `id` that appears twice keeps its first row, and a differing
 * duplicate is reported as a `source:conflict`. Explicit `replace: true` is required when completed source data
 * exists; a failed read keeps the previous data.
 */
export async function ingest(
    pathToCsv: string,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'beehiiv', file: basename(pathToCsv)}}, async stage => {
        for await (const record of parse(pathToCsv)) {
            stage.reconcile(record);
        }
    });
}
