import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';
import {pageRecords} from '../lib/fetch.js';

export const PUB = 'pub_00000000-0000-0000-0000-000000000001';
export const KEY = 'test-key';
export const SITE = 'https://example.beehiiv.com';

const webTarget = (tier: 'free' | 'premium') => ({
    action: 'include',
    receiver_type: 'Publication',
    receiver_id: PUB,
    tier
});

/** An API post with every field the mapper reads, overridden by `values`. */
export function apiPost(id: string, values: Record<string, any> = {}): Record<string, any> {
    return {
        id,
        title: `Title ${id}`,
        subtitle: `Subtitle ${id}`,
        slug: id,
        web_url: `${SITE}/p/${id}`,
        status: 'confirmed',
        audience: 'free',
        platform: 'both',
        publish_date: 1700000000,
        created: 1699900000,
        thumbnail_url: '',
        meta_default_title: null,
        meta_default_description: null,
        authors: ['Jane Doe'],
        content_tags: [],
        web_targets: [webTarget('free')],
        content: {premium: {web: `<div id="content-blocks"><p>Body ${id}</p></div>`}},
        ...values
    };
}

export {webTarget};

/**
 * Serve `posts` from the beehiiv posts endpoint, `limit` per page, requiring the API key. Returns the requested
 * query strings.
 */
export function beehiiv(posts: Record<string, any>[]): string[] {
    const requests: string[] = [];
    nock('https://api.beehiiv.com', {reqheaders: {authorization: `Bearer ${KEY}`}})
        .persist()
        .get(`/v2/publications/${PUB}/posts`)
        .query(true)
        .reply((request: Request) => {
            const url = new URL(request.url);
            requests.push(url.search);
            const limit = Number(url.searchParams.get('limit'));
            const page = Number(url.searchParams.get('page') ?? 1);
            return [200, {data: posts.slice((page - 1) * limit, page * limit), total_results: posts.length}];
        });
    return requests;
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding `posts` as completed source data for the test publication, without fetching. */
export async function stored(
    posts: Record<string, any>[],
    metadata: Record<string, any> = {}
): Promise<MigrateContext> {
    const context = await memoryContext();
    await context.sources.ingest({metadata: {adapter: 'beehiiv-api', publication: PUB, ...metadata}}, async stage => {
        await stage.write(pageRecords(posts, 1));
    });
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
