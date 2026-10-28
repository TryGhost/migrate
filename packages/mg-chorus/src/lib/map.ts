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
import {dateUtils, stringUtils, urlUtils} from '@tryghost/mg-utils';
import jsonToHtml from './json-to-html.js';
import type {ChorusEntry, ChorusOptions} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** A stable Ghost ID for an entry `uid`, tag name or author name, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-chorus:1', site, kind, key);
}

/** The host and path of the live site's URL, which scope stable Ghost IDs to one site. */
function siteScope(value: unknown): string {
    const url = urlUtils.httpUrl(value);
    if (!url) {
        throw new Error('Chorus migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return urlUtils.canonicalSite(url);
}

/** An entry's URL on the live site, or `null` when it has no HTTP or HTTPS URL. */
export function entryUrl(entry: ChorusEntry): string | null {
    return urlUtils.httpUrl(entry.url)?.href ?? null;
}

/** The decoded last segment of a URL's path, as a slug: `my-article` for `https://example.com/2019/9/26/1/my-article`. */
function urlSlug(url: string): string {
    const segment = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    try {
        return slugify(decodeURIComponent(segment));
    } catch {
        return slugify(segment);
    }
}

/** A trimmed name, or `undefined` when it is not a string or is blank. */
function name(value: unknown): string | undefined {
    return (typeof value === 'string' && value.trim()) || undefined;
}

const placeholderEmail = (slug: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`;

/**
 * The saved author for a name. Authors are identified by name, so names whose slugs collide stay separate users
 * with distinct slugs and emails. A Ghost user with the author's `<slug>@example.com` email supplies its ID, slug
 * and roles.
 */
function authorEntity(state: MappingState, site: string, authorName: string): AuthorContext {
    const context = state.context;
    const binding = state.getBinding('author', authorName);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const base = slugify(authorName) || 'author';
    let data: Record<string, any> = {
        name: authorName,
        slug: base,
        email: placeholderEmail(base),
        roles: ['Contributor']
    };
    const match: GhostUser | undefined = state.get('ghost-user', data.email);
    if (match) {
        // Names that share a placeholder email are the same Ghost user.
        const same = state.getBinding('ghost-author', match.id);
        if (same) {
            state.bind('author', authorName, same);
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(same));
        }
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId(site, 'author', authorName);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: authorName,
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
    const author = new AuthorContext();
    for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) {
            author.set(field, value);
        }
    }
    author.ghostId = id;
    author.save(context.db);
    state.bind('author', authorName, author.dbId!);
    state.bind('ghost-author', id, author.dbId!);
    return author;
}

/** The saved tag for a name. Names whose slugs collide get distinct slugs; `#` names are internal `hash-` tags. */
function tagEntity(state: MappingState, site: string, tagName: string): TagContext {
    const context = state.context;
    const binding = state.getBinding('tag', tagName);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    const slug = tagName.startsWith('#') ? `hash-${slugify(tagName)}` : slugify(tagName);
    const tag = new TagContext({name: tagName, slug: state.uniqueSlug('tag', slug)});
    tag.ghostId = ghostId(site, 'tag', tagName);
    tag.save(context.db);
    state.bind('tag', tagName, tag.dbId!);
    return tag;
}

/**
 * Rebuild posts, tags and authors from the stored entries. Each entry becomes a published, public post whose slug
 * is the last segment of its Chorus URL, with its byline author, author profile and contributors as authors, and
 * `addPrimaryTag`, its community groups and `#chorus` as tags. `addPrimaryTag` applies here, so changing it needs
 * no new read. Entries without a valid URL or `createdAt` are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: ChorusOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Chorus export before mapping.');
    }
    const site = siteScope(options.url);
    const primaryTag = name(options.addPrimaryTag);
    const state = new MappingState(context, 'mg-chorus');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'entry'}), async record => {
            const entry: ChorusEntry = JSON.parse(record.content);
            const url = entryUrl(entry);
            if (!url) {
                throw new RecordDataError('Entry has no valid URL');
            }
            const created = dateUtils.parseDate(entry.createdAt);
            if (!created) {
                throw new RecordDataError('Invalid Chorus createdAt');
            }
            const title = name(entry.title) ?? '(Untitled)';

            const post = new PostContext({lookupKey: record.key!});
            post.ghostId = ghostId(site, 'post', record.key!);
            post.set('title', title);
            post.set('slug', urlSlug(url) || slugify(title));
            post.set('custom_excerpt', name(entry.dek?.html) ?? null);
            post.set('status', 'published');
            post.set('visibility', 'public');
            post.set('type', 'post');
            post.set('created_at', created);
            post.set('published_at', created);
            post.set('updated_at', dateUtils.parseDate(entry.updatedAt) ?? created);
            post.set('html', jsonToHtml(entry.body?.components));

            const authorNames = [
                name(entry.author?.fullOrUserName),
                name(entry.authorProfile?.name),
                ...(entry.contributors ?? []).map(contributor => name(contributor?.fullOrUserName))
            ].filter((value): value is string => Boolean(value));
            for (const author of authorNames.map(authorName => authorEntity(state, site, authorName))) {
                post.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }

            const tagNames = [
                primaryTag,
                ...(entry.communityGroups ?? []).map(group => name(group?.name)),
                '#chorus'
            ].filter((value): value is string => Boolean(value));
            // Public tags come first, then internal (`#`) tags, keeping their order otherwise.
            tagNames.sort((a, b) => Number(a.startsWith('#')) - Number(b.startsWith('#')));
            for (const tag of tagNames.map(tagName => tagEntity(state, site, tagName))) {
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            context.addLink(stringUtils.cleanURL(url), `/${post.get('slug')}/`);
        });
    });
}
