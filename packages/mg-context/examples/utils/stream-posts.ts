// Shared ingestion and mapping helpers; this file is not a standalone script.
// To see them in use, run from packages/mg-context:
// pnpm exec tsx examples/stream-posts.ts
import {MigrateContext, PostContext} from '../../src/index.js';

export interface SyntheticPost {
    index: number;
    html: string;
}

/** This is caller policy, not source identity validation inside mg-context. */
export async function ingestSyntheticData(
    context: MigrateContext,
    count: number,
    {reread = false, skip = false, html}: {reread?: boolean; skip?: boolean; html?: string} = {}
): Promise<void> {
    const complete = context.sources.hasCompletedIngestion;
    if (skip && (!complete || reread)) {
        throw new Error('Cannot skip ingestion without completed data or when rereading.');
    }
    if (complete && !reread) {
        if (context.sources.count('post') !== count) {
            throw new Error('The stored record count differs; use --reread-source to replace input.');
        }
        return;
    }
    await context.sources.ingest({replace: reread, metadata: {count}}, async stage => {
        async function* records() {
            for (let index = 0; index < count; index += 1) {
                yield {
                    kind: 'post', key: `post-${index + 1}`, format: 'json',
                    content: JSON.stringify({index, html: html ?? `<p>Original content for post ${index + 1}.</p>`})
                };
            }
        }
        await stage.write(records());
    });
}

export async function mapSyntheticData(
    context: MigrateContext,
    mapper: (post: PostContext, original: SyntheticPost) => void | Promise<void>
): Promise<void> {
    await context.rebuildMappedContent(async () => {
        for await (const record of context.sources.records({kind: 'post'})) {
            const post = await context.addPost({lookupKey: record.key!});
            await mapper(post, JSON.parse(record.content) as SyntheticPost);
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
        }
    });
}
