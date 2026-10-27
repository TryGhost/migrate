import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {tasks, type TaskContext} from './fetch.js';

export interface ParseOptions {
    /** The beehiiv API key. It is used for requests only and never stored. */
    key: string;
    /** Called with each page's title before it is fetched. */
    onProgress?: (title: string) => void;
}

export interface IngestOptions extends ParseOptions {
    /** Replace completed source data. Without it, ingesting into a context that has source data throws. */
    replace?: boolean;
}

/** Yield the source records for every page of a publication's posts, one page at a time, without storing them. */
export async function* parse(id: string, {key, onProgress}: ParseOptions): AsyncGenerator<SourceRecordInput> {
    for (const task of await tasks({key, id})) {
        onProgress?.(task.title);
        yield* await task.records();
    }
}

/**
 * Fetch every post of a beehiiv publication into `context.sources` as `post` records keyed by post ID, with their
 * free and premium web content. Every page is fetched; `map()` applies the date filters. A post returned twice
 * while paging keeps its first version and reports a `source:conflict`.
 */
export async function ingest(
    id: string,
    context: MigrateContext,
    {key, replace = false, onProgress}: IngestOptions
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'beehiiv-api', publication: id}}, async stage => {
        const ctx: TaskContext = {sourceIngestion: stage};
        for (const task of await tasks({key, id})) {
            onProgress?.(task.title);
            await task.task(ctx);
        }
    });
}

/** The publication ID stored with the completed ingestion. */
export function sourcePublication(context: MigrateContext): string {
    const id = context.sources.currentIngestion?.metadata.publication;
    if (typeof id !== 'string' || !id) {
        throw new Error('Completed beehiiv API source data has no publication ID.');
    }
    return id;
}
