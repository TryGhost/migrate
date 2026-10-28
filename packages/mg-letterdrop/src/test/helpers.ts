import {readFileSync} from 'node:fs';
import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';
import {pageRecords} from '../lib/fetch.js';
import type {LetterdropPost} from '../lib/types.js';

export const TOKEN = 'test-token';
export const SITE = 'https://example.com';

const fixtureData: {posts: LetterdropPost[]} = JSON.parse(
    readFileSync(new URL('../../src/test/fixtures/api-response.json', import.meta.url), 'utf8')
);

/** The two posts in the original API response fixture. */
export const fixture = (): LetterdropPost[] => structuredClone(fixtureData.posts);

/** An API post with every field the mapper reads, overridden by `values`. */
export function apiPost(id: string, values: Record<string, any> = {}): LetterdropPost {
    return {
        id,
        title: `Post ${id}`,
        subtitle: `Subtitle ${id}`,
        body: `<p>Body ${id}</p>`,
        author: {name: 'Jane Doe', avatar: `${SITE}/jane.jpg`},
        tags: ['News'],
        coverImage: `${SITE}/cover-${id}.jpg`,
        slug: `post-${id}`,
        url: `${SITE}/p/post-${id}`,
        metaTitle: `Meta ${id}`,
        metaDescription: `Description ${id}`,
        publishedOn: '2023-01-02T03:04:05.000Z',
        updated: '2023-01-03T03:04:05.000Z',
        ...values
    };
}

/**
 * Serve pages of posts from the posts endpoint, requiring the API token and reading the form's offset. A page's
 * `hasNextPage` is true while later pages remain. Returns the requested offsets and limits.
 */
export function letterdrop(pages: LetterdropPost[][]): string[] {
    const requests: string[] = [];
    nock('https://app.letterdrop.com')
        .persist()
        .post('/api/v1/posts')
        .reply(async (request: Request) => {
            const form = new URLSearchParams(await request.text());
            requests.push(`${form.get('offset')}:${form.get('limit')}`);
            if (request.headers.get('api-key') !== TOKEN) {
                return [401, {message: 'Invalid API key'}];
            }
            const page = Number(form.get('offset')) / 20;
            return [200, {data: pages[page] ?? [], meta: {hasNextPage: page < pages.length - 1}}];
        });
    return requests;
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding the posts as completed source data, without fetching. */
export async function stored(posts: LetterdropPost[]): Promise<MigrateContext> {
    const context = await memoryContext();
    await context.sources.ingest({metadata: {adapter: 'letterdrop'}}, async stage => {
        await stage.write(pageRecords(posts, 1));
    });
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}
