import {
    MigrateContext,
    PostContext,
    AuthorContext,
    TagContext,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {stringUtils, xmlUtils} from '@tryghost/mg-utils';
import {postDates, processUser, processAttachment, processPost} from './process.js';
import {sourceUrl} from './ingest.js';
import {MappingState, sourceSite, indexSources} from './mapping-state.js';
import type {WordPressOptions, LegacyAuthor} from './types.js';

const {ensureArray, getText} = xmlUtils;

export type {MappingSummary};
export interface MappingServices {
    fileCache?: any;
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-wp-xml:1', site, kind, key);
}

function mappedAuthor(state: MappingState, author: LegacyAuthor, site: string): AuthorContext {
    const context = state.context;
    const source = author.sourceKey ? context.sources.get('author', author.sourceKey) : state.author(author.url);
    const key = source?.key ?? author.sourceKey ?? `fallback:${author.url}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    let data = {...(source ? processUser(JSON.parse(source.content)).data : author.data)};
    data.name ||= stringUtils.startCase(data.slug || 'Example User');
    data.slug ||= slugify(data.name);
    data.email ||= `${data.slug.slice(0, 50).replace(/-+$/, '')}@example.com`;
    const match = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        const merged = mergeUsersWithGhost([{url: author.url, data: data as any}], [match])[0];
        data = {...merged.data};
        const sameGhostId = state.get('ghost-author', data.id);
        const sameGhost = sameGhostId ? (context.db.stmts.findAuthorById.get(sameGhostId) as any) : undefined;
        if (sameGhost) {
            state.bind('author', key, sameGhost.id as number);
            if (source) context.sources.link(source.id, {type: 'author', id: sameGhost.id as number});
            return AuthorContext.fromRow(sameGhost);
        }
    }
    const id = data.id || ghostId(site, 'author', key);
    delete data.id;
    const allowed = ['Contributor', 'Author', 'Editor', 'Administrator'];
    if (data.roles?.some((role: string) => !allowed.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: key,
            reason: 'Unsupported author roles replaced by supported Ghost roles'
        });
        data.roles = data.roles.filter((role: string) => allowed.includes(role));
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
    state.set('ghost-author', id, entity.dbId!);
    if (source) context.sources.link(source.id, {type: 'author', id: entity.dbId!});
    for (const alias of [author.url, `/author/${author.data.slug}/`]) {
        context.addLink(stringUtils.cleanURL(alias), `/author/${entity.get('slug')}/`);
        context.addLink(stringUtils.cleanURL(new URL(alias, state.url).href), `/author/${entity.get('slug')}/`);
    }
    return entity;
}

function mappedTag(state: MappingState, tag: any, site: string): TagContext {
    const context = state.context;
    const name = getText(tag.data.name).trim();
    const named = tag.sourceKey ? state.find('term-name', JSON.stringify([tag.sourceKey, name])) : [];
    const candidates = named.length ? named : tag.sourceKey ? state.find('term', tag.sourceKey) : [];
    if (candidates.length > 1) throw new RecordDataError(`Ambiguous WordPress term: ${tag.sourceKey}`);
    const source = candidates[0];
    const term = source ? JSON.parse(source.content) : {};
    const taxonomy = tag.sourceKey?.split(':')[0] ?? 'migration';
    const key = getText(term['wp:term_id']).trim()
        ? `${taxonomy}:id:${getText(term['wp:term_id']).trim()}`
        : (tag.sourceKey ?? tag.url);
    const binding = state.getBinding('tag', key);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
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
    if (source) context.sources.link(source.id, {type: 'tag', id: entity.dbId!});
    const target = `/tag/${entity.get('slug')}/`;
    for (const alias of [tag.url, taxonomy === 'category' ? `/category/${tag.data.slug}/` : `/tag/${tag.data.slug}/`]) {
        context.addLink(stringUtils.cleanURL(alias), target);
        context.addLink(stringUtils.cleanURL(new URL(alias, state.url).href), target);
    }
    return entity;
}

function selected(item: Record<string, any>, options: WordPressOptions): boolean {
    const type = getText(item['wp:post_type']);
    if (!['post', 'page', ...(options.cpt ?? [])].includes(type)) {
        return false;
    }
    return !(
        (type === 'post' && options.posts === false) ||
        (type === 'page' && options.pages === false) ||
        (getText(item['wp:status']) !== 'publish' && options.drafts === false)
    );
}

/** Rebuild derived content. Original records and their identity remain unchanged. */
export async function map(
    options: WordPressOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete WordPress source data before mapping.');
    }
    const {url: siteUrl, site} = await sourceSite(context);
    for (const name of ['postsBefore', 'postsAfter']) {
        if (options[name] && !Number.isFinite(Date.parse(options[name]))) {
            throw new Error(`Invalid ${name} date: ${options[name]}`);
        }
    }
    const state = new MappingState(context, siteUrl, site);
    return context.rebuildMappedContent(async () => {
        await indexSources(state);
        if (services.ghostUsers) {
            for await (const user of services.ghostUsers) {
                state.reserveSlug('author', user.slug, user.id);
                if (user.email) {
                    state.set('ghost-user', user.email.toLowerCase(), user);
                }
            }
        }
        options = {...options, url: siteUrl};
        return context.mapRecords(context.sources.records({kind: 'item'}), async record => {
            const item = JSON.parse(record.content);
            if (!selected(item, options)) {
                return false;
            }
            const date = postDates(item).published;
            if (!date) {
                throw new RecordDataError('Invalid WordPress publication date');
            }
            if (options.postsAfter && date <= new Date(options.postsAfter)) {
                return false;
            }
            if (options.postsBefore) {
                const end = new Date(options.postsBefore);
                end.setDate(end.getDate() + 1);
                if (date >= end) {
                    return false;
                }
            }
            if (!record.key) {
                throw new RecordDataError('Item has neither a WordPress ID nor a usable source URL');
            }
            const rawUrl = getText(item.link);
            const url = sourceUrl(rawUrl, siteUrl);
            if (rawUrl.trim() && !url) {
                throw new RecordDataError('Invalid WordPress post URL');
            }
            const users: LegacyAuthor[] = [];
            const logins = [
                getText(item['dc:creator']),
                ...ensureArray(item.category)
                    .filter(category => category['@_domain'] === 'author')
                    .map(category => category['@_nicename'])
            ];
            for (const login of new Set<string>(logins)) {
                const raw = state.author(login);
                if (raw) {
                    const profile = processUser(JSON.parse(raw.content));
                    users.push({
                        ...profile,
                        url: slugify(login),
                        data: {...profile.data, slug: slugify(login)},
                        sourceKey: raw.key!
                    });
                }
            }
            const thumbnail = ensureArray(item['wp:postmeta']).find(
                meta => getText(meta['wp:meta_key']) === '_thumbnail_id'
            );
            const attachment = thumbnail
                ? context.sources.get('item', `id:${getText(thumbnail['wp:meta_value']).trim()}`)
                : undefined;
            const attachments = attachment ? [await processAttachment(JSON.parse(attachment.content))] : [];
            const output = await processPost(
                item,
                users,
                {
                    ...options,
                    attachments,
                    onWarning: details =>
                        context.recordDiagnostic('operation:warning', {...record.metadata, details}, record.id)
                },
                services.fileCache
            );
            const post = new PostContext({lookupKey: record.key!});
            post.ghostId = ghostId(site, 'post', record.key!);
            for (const [field, value] of Object.entries(output.data)) {
                if (!['tags', 'authors', 'author'].includes(field) && value !== undefined) {
                    post.set(field, value);
                }
            }
            const authors = output.data.authors || [output.data.author];
            const tags = output.data.tags.filter((tag: any) => getText(tag.data.name).trim());
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
            tags.sort((a: any, b: any) => Number(a.data.name.startsWith('#')) - Number(b.data.name.startsWith('#')));
            for (const tag of tags) {
                const entity = mappedTag(state, tag, site);
                post.addTag(entity);
                context.sources.link(record.id, {type: 'tag', id: entity.dbId!});
            }
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            const path = url ? new URL(url).pathname : '';
            const dated = options.datedPermalinks?.includes('yyyy/mm/dd')
                ? path.match(/(?:^|\/)(\d{4}\/\d{2}\/\d{2})\//)
                : options.datedPermalinks?.includes('yyyy/mm')
                  ? path.match(/(?:^|\/)(\d{4}\/\d{2})\//)
                  : null;
            if (url) {
                context.addLink(stringUtils.cleanURL(url), `/${dated ? dated[1] + '/' : ''}${post.get('slug')}/`);
            }
        });
    });
}
