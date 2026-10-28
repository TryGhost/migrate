import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {PAGE_SIZE, tasks, type TaskContext} from './fetch.js';

export interface ParseOptions {
    /** Called with each page's title before it is fetched. */
    onProgress?: (title: string) => void;
}

export interface IngestOptions extends ParseOptions {
    /** Replace completed source data. Without it, ingesting into a context that has source data throws. */
    replace?: boolean;
}

/** Yield the source records for every page of posts, one page at a time, without storing them. */
export async function* parse(apiToken: string, {onProgress}: ParseOptions = {}): AsyncGenerator<SourceRecordInput> {
    for await (const task of tasks({apiToken})) {
        onProgress?.(task.title);
        yield* await task.records();
    }
}

/**
 * Fetch every post into `context.sources` as `post` records keyed `post:id:<id>`, pages in API order. The token is
 * used for requests only and never stored; `map()` applies every option. A post returned twice while paging keeps
 * its most recently updated version and reports a `source:conflict`.
 */
export async function ingest(
    apiToken: string,
    context: MigrateContext,
    {replace = false, onProgress}: IngestOptions = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'letterdrop', pageSize: PAGE_SIZE}}, async stage => {
        const ctx: TaskContext = {sourceIngestion: stage};
        for await (const task of tasks({apiToken})) {
            onProgress?.(task.title);
            await task.task(ctx);
        }
    });
}
