import {createRequire} from 'node:module';
import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';

export const SITE = 'https://example.com';

export const fixture = createRequire(new URL('../../src/test/', import.meta.url));

/** Serve WordPress REST collections with real paging headers; returns every requested URL. */
export function wordpress(data: Record<string, any[]>, reqheaders: Record<string, string> = {}): URL[] {
    const requests: URL[] = [];
    nock(SITE, {reqheaders})
        .persist()
        .get(/^\/wp-json\/wp\/v2\//)
        .reply((request: Request) => {
            const url = new URL(request.url);
            requests.push(url);
            const items = data[url.pathname.split('/')[4]] ?? [];
            const perPage = Number(url.searchParams.get('per_page') ?? 10);
            const page = Number(url.searchParams.get('page') ?? 1);
            return [
                200,
                items.slice((page - 1) * perPage, page * perPage),
                {'X-WP-Total': String(items.length), 'X-WP-TotalPages': String(Math.ceil(items.length / perPage))}
            ];
        });
    return requests;
}

export function term(taxonomy: string, id: number, slug: string, name = slug) {
    const base = taxonomy === 'category' ? 'category' : taxonomy === 'post_tag' ? 'tag' : taxonomy;
    return {id, taxonomy, slug, name, link: `${SITE}/${base}/${slug}/`};
}

export function user(id: number, slug: string, extra: Record<string, any> = {}) {
    return {id, slug, name: slug.toUpperCase(), link: `${SITE}/author/${slug}/`, ...extra};
}

export function post(id: number, extra: Record<string, any> = {}) {
    const type = extra.type ?? 'post';
    return {
        id,
        type,
        slug: `${type}-${id}`,
        status: 'publish',
        link: `${SITE}/${type}-${id}/`,
        title: {rendered: `Title ${id}`},
        content: {rendered: `<p>Content ${id} <a href="${SITE}/post-1/">first</a></p>`},
        excerpt: {rendered: `<p>Excerpt ${id}</p>`},
        date_gmt: '2024-01-01T10:00:00',
        modified_gmt: '2024-01-02T10:00:00',
        author: 1,
        _embedded: {'wp:term': [[term('category', 10, 'news', 'News')]]},
        ...extra
    };
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

export function reset(): void {
    nock.cleanAll();
    nock.enableNetConnect();
}
