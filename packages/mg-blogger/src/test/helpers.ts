import {readFileSync} from 'node:fs';
import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';
import {pageRecords} from '../lib/fetch.js';
import type {BloggerPost} from '../lib/types.js';

export const KEY = 'test-key';
export const BLOG = '12345678';
export const OTHER = '87654321';

/** The three posts in the original API response fixture. */
export const fixture: BloggerPost[] = JSON.parse(
    readFileSync(new URL('../../src/test/fixtures/response.json', import.meta.url), 'utf8')
);

/** An API post with every field the mapper reads, overridden by `values`. */
export function apiPost(id: string, values: Record<string, any> = {}): BloggerPost {
    return {
        kind: 'blogger#post',
        id,
        blog: {id: BLOG},
        published: '2020-01-02T03:04:05-05:00',
        updated: '2020-01-03T03:04:05-05:00',
        url: `http://example.blogspot.com/2020/01/post-${id}.html`,
        title: `Post ${id}`,
        content: `<p>Body ${id}</p>`,
        author: {id: 'author-1', displayName: 'Jane Doe'},
        ...values
    };
}

/**
 * Serve each blog's pages of posts from the posts endpoint, chained by page tokens, requiring the API key. Returns
 * the requested paths and query strings.
 */
export function blogger(blogs: Record<string, BloggerPost[][]>): string[] {
    const requests: string[] = [];
    nock('https://www.googleapis.com')
        .persist()
        .get(/^\/blogger\/v3\/blogs\/[^/]+\/posts$/)
        .query(true)
        .reply((request: Request) => {
            const url = new URL(request.url);
            requests.push(`${url.pathname.split('/')[4]}${url.search.replace(`key=${KEY}`, '')}`);
            if (url.searchParams.get('key') !== KEY) {
                return [400, {error: {code: 400, message: 'API key not valid'}}];
            }
            const pages = blogs[url.pathname.split('/')[4]];
            if (!pages) {
                return [404, {error: {code: 404, message: 'Blog not found'}}];
            }
            const page = Number(url.searchParams.get('pageToken') ?? 1);
            const body: Record<string, any> = {kind: 'blogger#postList', items: pages[page - 1]};
            if (page < pages.length) {
                body.nextPageToken = String(page + 1);
            }
            return [200, body];
        });
    return requests;
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding each blog's posts as completed source data, without fetching. */
export async function stored(
    blogs: Record<string, BloggerPost[]>,
    metadata: Record<string, any> = {}
): Promise<MigrateContext> {
    const context = await memoryContext();
    await context.sources.ingest(
        {metadata: {adapter: 'blogger', blogs: Object.keys(blogs), ...metadata}},
        async stage => {
            for (const [blog, posts] of Object.entries(blogs)) {
                await stage.write(pageRecords(blog, posts, 1));
            }
        }
    );
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
