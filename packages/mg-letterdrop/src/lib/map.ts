import {
    AuthorContext,
    MappingState,
    MigrateContext,
    PostContext,
    RecordDataError,
    TagContext,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {stringUtils} from '@tryghost/mg-utils';
import {processPost, type LetterdropTag} from './processor.js';
import type {LetterdropOptions, LetterdropPost} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID, name and slug. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** Ghost relationship limit for one post. */
const MAX_RELATIONS = 500;

/** A stable Ghost ID for a post ID, tag slug or author name, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-letterdrop:1', site, kind, key);
}

/** The live site's URL without a trailing slash. Throws unless it is an HTTP(S) URL. */
function siteUrl(value: unknown): URL {
    const url = typeof value === 'string' ? URL.parse(value.trim()) : null;
    if (!url || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Letterdrop migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return url;
}

/** An ISO 8601 date, read as UTC when it has no offset, or `null` when it is missing or invalid. */
function parseDate(value: unknown): Date | null {
    if (typeof value !== 'string' || !value.trim()) {
        return null;
    }
    const zoned = /(?:Z|[+-]\d\d:?\d\d)$/i.test(value.trim()) ? value : `${value}Z`;
    const date = new Date(zoned);
    return Number.isNaN(date.getTime()) ? null : date;
}

const placeholderEmail = (slug: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`;

/**
 * The saved author for a name. Authors are identified by name, so different names whose slugs collide stay separate
 * users with distinct slugs and emails. A Ghost user with the author's `<slug>@example.com` email supplies its ID,
 * name and slug.
 */
function mappedAuthor(state: MappingState, site: string, name: string): AuthorContext {
    const context = state.context;
    const key = `name:${name}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const base = slugify(name) || 'author';
    let data: Record<string, any> = {name, slug: base, email: placeholderEmail(base), roles: ['Contributor']};
    const match: GhostUser | undefined = state.get('ghost-user', data.email);
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
        const sameGhost = state.getBinding('ghost-author', data.id);
        if (sameGhost) {
            state.bind('author', key, sameGhost);
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(sameGhost));
        }
    }
    const id = data.id || ghostId(site, 'author', key);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: name,
            reason: 'Unsupported author roles replaced by supported Ghost roles'
        });
        data.roles = data.roles.filter((role: string) => ROLES.includes(role));
        if (!data.roles.length) {
            data.roles = ['Contributor'];
        }
    }
    data.slug = state.uniqueSlug('author', data.slug, id);
    if (!match && data.slug !== base) {
        // Distinct authors need distinct emails as well as slugs.
        data.email = placeholderEmail(data.slug);
    }
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
    return entity;
}

/** The saved tag for a slug. Tags are identified by slug, so names that share one are one tag, named by the first. */
function mappedTag(context: MigrateContext, site: string, {name, slug}: LetterdropTag): TagContext {
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId(site, 'tag', `slug:${slug}`);
    tag.save(context.db);
    return tag;
}

/**
 * Rebuild posts, tags and authors from the stored Letterdrop posts. Each post is published, dated by `publishedOn`
 * (then `updated`), with its author, then `addPrimaryTag`, its tags and `#letterdrop` as tags. Every option applies
 * here, so changing one needs no new fetch. Posts without an ID or a valid date, or over Ghost's tag limit, are
 * skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: LetterdropOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete Letterdrop source data before mapping.');
    }
    const url = siteUrl(options.url);
    const site = url.host.toLowerCase() + url.pathname.replace(/\/+$/, '');
    const processOptions = {
        url: url.href.replace(/\/+$/, ''),
        subscribeLink: options.subscribeLink ?? '#/portal/signup',
        subscribeText: options.subscribeText ?? 'Subscribe',
        addPrimaryTag: options.addPrimaryTag
    };
    const state = new MappingState(context, 'mg-letterdrop');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const item: LetterdropPost = JSON.parse(record.content);
            if (!record.key) {
                throw new RecordDataError('Post has no ID');
            }
            const published = parseDate(item.publishedOn) ?? parseDate(item.updated);
            if (!published) {
                throw new RecordDataError('Invalid Letterdrop post dates');
            }
            const data = processPost(item, processOptions);
            if (data.tags.length > MAX_RELATIONS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(site, 'post', item.id);
            post.set('title', data.title);
            post.set('slug', data.slug || item.id);
            post.set('status', 'published');
            post.set('visibility', 'public');
            post.set('type', 'post');
            post.set('created_at', published);
            post.set('published_at', published);
            post.set('updated_at', parseDate(item.updated) ?? published);
            post.set('html', data.html);
            for (const field of ['custom_excerpt', 'meta_title', 'meta_description', 'feature_image'] as const) {
                if (data[field]) {
                    post.set(field, data[field]);
                }
            }

            if (data.author) {
                const author = mappedAuthor(state, site, data.author);
                post.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }
            for (const tag of data.tags.map(value => mappedTag(context, site, value))) {
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (typeof item.url === 'string' && URL.canParse(item.url)) {
                context.addLink(stringUtils.cleanURL(item.url), `/${post.get('slug')}/`);
            }
        });
    });
}
