import fsUtils from '@tryghost/mg-fs-utils';
import {
    MigrateContext,
    PostContext,
    AuthorContext,
    TagContext,
    MappingState,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary, SourceRecord} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {stringUtils} from '@tryghost/mg-utils';
import {processAuthor, processPost} from './processor.js';
import {sourceSite} from './ingest.js';
import type {LegacyAuthor, LegacyTag, WpApiOptions, WpApiRecord} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    fileCache?: any;
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-wp-api:1', site, kind, key);
}

/** WordPress `*_gmt` values are UTC without a zone designator. */
function utcDate(value: string): Date {
    return new Date(/Z$|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`);
}

function authorKey({data}: LegacyAuthor): string {
    return data.id ? `user:id:${data.id}` : data.slug ? `author:slug:${data.slug}` : `author:name:${data.name}`;
}

function mappedAuthor(state: MappingState, author: LegacyAuthor, site: string): AuthorContext {
    const context = state.context;
    const key = authorKey(author);
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const source = context.sources.get('user', key);
    // The WordPress user ID is not a Ghost ID; only a matched Ghost user supplies one.
    let {id: _wordpressId, ...data} = author.data;
    data.name ||= stringUtils.startCase(data.slug || 'Example User');
    data.slug ||= slugify(data.name);
    data.email ||= `${data.slug.slice(0, 50).replace(/-+$/, '')}@example.com`;
    const match = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: author.url ?? '', data: data as any}], [match])[0].data};
        const sameGhost = state.getBinding('ghost-author', data.id);
        if (sameGhost) {
            state.bind('author', key, sameGhost);
            if (source) {
                context.sources.link(source.id, {type: 'author', id: sameGhost});
            }
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(sameGhost));
        }
    }
    const id = data.id || ghostId(site, 'author', key);
    delete data.id;
    if (data.roles?.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: key,
            reason: 'Unsupported author roles replaced by supported Ghost roles'
        });
        data.roles = data.roles.filter((role: string) => ROLES.includes(role));
        if (!data.roles.length) {
            data.roles = ['Contributor'];
        }
    }
    data.slug = state.uniqueSlug('author', data.slug, id);
    const entity = new AuthorContext();
    for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) {
            entity.set(field, value);
        }
    }
    entity.ghostId = id;
    entity.save(context.db);
    state.bind('author', key, entity.dbId!);
    state.bind('ghost-author', id, entity.dbId!);
    if (source) {
        context.sources.link(source.id, {type: 'author', id: entity.dbId!});
    }
    if (author.url) {
        context.addLink(stringUtils.cleanURL(author.url), `/author/${entity.get('slug')}/`);
    }
    return entity;
}

function mappedTag(state: MappingState, tag: LegacyTag, key: string, site: string): TagContext {
    const context = state.context;
    const binding = state.getBinding('tag', key);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    const name = tag.data.name.trim();
    let slug = tag.data.slug || slugify(name);
    if (name.startsWith('#') && !slug.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const entity = new TagContext();
    entity.set('name', name);
    entity.set('slug', state.uniqueSlug('tag', slug));
    entity.ghostId = ghostId(site, 'tag', key);
    entity.save(context.db);
    state.bind('tag', key, entity.dbId!);
    if (/^https?:\/\//.test(tag.url)) {
        context.addLink(stringUtils.cleanURL(tag.url), `/tag/${entity.get('slug')}/`);
    }
    return entity;
}

/** Select by the endpoint a record was fetched from: `--cpt` names REST routes, which may differ from post types. */
function selected(
    record: SourceRecord,
    wpPost: WpApiRecord,
    options: WpApiOptions,
    onlyURLs: Set<string> | null
): boolean {
    const endpoint = record.metadata.endpoint;
    if (!['posts', 'pages', ...(options.cpt ?? [])].includes(endpoint as string)) {
        return false;
    }
    return !(
        (endpoint === 'posts' && options.posts === false) ||
        (endpoint === 'pages' && options.pages === false) ||
        (wpPost.status !== 'publish' && options.drafts === false) ||
        (onlyURLs && !onlyURLs.has(wpPost.link))
    );
}

/** The users processPost() may need for this post: its author, matching co-authors, and the first user. */
function postUsers(state: MappingState, wpPost: WpApiRecord, firstUser: SourceRecord | undefined): LegacyAuthor[] {
    const records = [firstUser, state.context.sources.get('user', `user:id:${wpPost.author}`)];
    for (const term of (wpPost._embedded?.['wp:term'] ?? []).flat()) {
        if (term.taxonomy === 'author' && term.slug) {
            records.push(...state.find('user-slug', term.slug));
        }
    }
    const seen = new Set<number>();
    const users: LegacyAuthor[] = [];
    for (const record of records) {
        if (record && !seen.has(record.id)) {
            seen.add(record.id);
            users.push(processAuthor(JSON.parse(record.content)));
        }
    }
    return users;
}

/**
 * Rebuild posts, pages, tags and authors from the stored API records. Filters (`posts`, `pages`, `drafts`, `cpt`,
 * `maxPosts`, `onlyURLs`, `addTag`) apply here, so changing them needs no new fetch.
 */
export async function map(
    options: WpApiOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete WordPress API source data before mapping.');
    }
    const {url: siteUrl, site} = sourceSite(context);
    let onlyURLs: Set<string> | null = null;
    if (options.onlyURLs) {
        const rows: {url: string}[] = await fsUtils.csv.parseCSV(options.onlyURLs);
        onlyURLs = new Set(rows.map(row => row.url));
    }
    const state = new MappingState(context, 'mg-wp-api');
    return context.rebuildMappedContent(async () => {
        let firstUser: SourceRecord | undefined;
        for await (const record of context.sources.records({kind: 'user'})) {
            firstUser ??= record;
            const slug = JSON.parse(record.content).slug;
            if (slug) {
                state.index('user-slug', slug, record.id);
            }
        }
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        options = {...options, url: siteUrl};
        let posts = 0;
        return context.mapRecords(context.sources.records({kind: 'content'}), async record => {
            const wpPost = JSON.parse(record.content);
            if (!selected(record, wpPost, options, onlyURLs)) {
                return false;
            }
            if (record.metadata.endpoint === 'posts' && options.maxPosts) {
                if (posts >= options.maxPosts) {
                    return false;
                }
                posts++;
            }
            if (!Number.isFinite(utcDate(String(wpPost.date_gmt)).getTime())) {
                throw new RecordDataError('Invalid WordPress publication date');
            }
            if (!URL.canParse(wpPost.link)) {
                throw new RecordDataError('Invalid WordPress post URL');
            }
            const output = await processPost(wpPost, postUsers(state, wpPost, firstUser), options, services.fileCache);
            const post = new PostContext({lookupKey: record.key!});
            post.ghostId = ghostId(site, 'post', record.key!);
            for (const [field, value] of Object.entries(output.data)) {
                if (['tags', 'authors', 'author'].includes(field) || value === undefined) {
                    continue;
                }
                if (['created_at', 'published_at', 'updated_at'].includes(field)) {
                    post.set(field, value ? utcDate(value) : null);
                } else if (field === 'comment_id') {
                    post.set(field, String(value));
                } else {
                    post.set(field, value);
                }
            }
            const authors: LegacyAuthor[] = output.data.authors ?? (output.data.author ? [output.data.author] : []);
            const tags: LegacyTag[] = output.data.tags.filter((tag: LegacyTag) => tag.data.name.trim());
            if (
                !post.schema.shape.authors.safeParse(authors).success ||
                !post.schema.shape.tags.safeParse(tags).success
            ) {
                throw new RecordDataError('Post exceeds Ghost author/tag relationship limits');
            }
            for (const author of authors) {
                const entity = mappedAuthor(state, author, site);
                post.addAuthor(entity);
                context.sources.link(record.id, {type: 'author', id: entity.dbId!});
            }
            // Embedded terms carry the taxonomy and ID that identify a tag across posts.
            const termKeys = new Map<string, string>();
            for (const term of (wpPost._embedded?.['wp:term'] ?? []).flat()) {
                termKeys.set(term.link, `${term.taxonomy}:id:${term.id}`);
            }
            tags.sort((a, b) => Number(a.data.name.startsWith('#')) - Number(b.data.name.startsWith('#')));
            for (const tag of tags) {
                const entity = mappedTag(state, tag, termKeys.get(tag.url) ?? `${tag.url}:${tag.data.slug}`, site);
                post.addTag(entity);
                context.sources.link(record.id, {type: 'tag', id: entity.dbId!});
            }
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            const path = new URL(wpPost.link).pathname;
            const dated = options.datedPermalinks?.includes('yyyy/mm/dd')
                ? path.match(/(?:^|\/)(\d{4}\/\d{2}\/\d{2})\//)
                : options.datedPermalinks?.includes('yyyy/mm')
                  ? path.match(/(?:^|\/)(\d{4}\/\d{2})\//)
                  : null;
            context.addLink(stringUtils.cleanURL(wpPost.link), `/${dated ? dated[1] + '/' : ''}${post.get('slug')}/`);
        });
    });
}
