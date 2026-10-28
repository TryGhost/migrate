import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {tasks, type TaskContext} from './fetch.js';

export interface ParseOptions {
    /** The Blogger API key. It is used for requests only and never stored. */
    apiKey: string;
    /** Milliseconds to wait before each request. Defaults to 500. */
    requestDelay?: number;
    /** Called with each page's title before it is fetched. */
    onProgress?: (title: string) => void;
}

export interface IngestOptions extends ParseOptions {
    /** Replace completed source data. Without it, ingesting into a context that has source data throws. */
    replace?: boolean;
}

const blogList = (blogIDs: string | string[]): string[] => [blogIDs].flat().map(String);

/** Yield the source records for every page of each blog's posts, one page at a time, without storing them. */
export async function* parse(
    blogIDs: string | string[],
    {apiKey, requestDelay, onProgress}: ParseOptions
): AsyncGenerator<SourceRecordInput> {
    for await (const task of tasks({apiKey, blogIDs: blogList(blogIDs), requestDelay})) {
        onProgress?.(task.title);
        yield* await task.records();
    }
}

/**
 * Fetch every post of the given blogs into `context.sources` as `post` records keyed `post:id:<id>`, blogs in the
 * given order. The blog IDs narrow the fetch and are stored with the ingestion; `map()` applies every other option.
 * A post returned twice while paging keeps its most recently updated version and reports a `source:conflict`.
 */
export async function ingest(
    blogIDs: string | string[],
    context: MigrateContext,
    {apiKey, requestDelay, replace = false, onProgress}: IngestOptions
): Promise<void> {
    const blogs = blogList(blogIDs);
    await context.sources.ingest({replace, metadata: {adapter: 'blogger', blogs}}, async stage => {
        const ctx: TaskContext = {sourceIngestion: stage};
        for await (const task of tasks({apiKey, blogIDs: blogs, requestDelay})) {
            onProgress?.(task.title);
            await task.task(ctx);
        }
    });
}

/** The blog IDs stored with the completed ingestion. */
export function sourceBlogs(context: MigrateContext): string[] {
    const blogs = context.sources.currentIngestion?.metadata.blogs;
    if (!Array.isArray(blogs)) {
        throw new Error('Completed Blogger source data has no blog IDs.');
    }
    return blogs.map(String);
}
