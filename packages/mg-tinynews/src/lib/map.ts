import {
    AuthorContext,
    MappingState,
    MigrateContext,
    PostContext,
    RecordDataError,
    TagContext,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary, SourceRecord} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {stringUtils} from '@tryghost/mg-utils';
import {
    DEFAULT_AUTHOR,
    NEWSLETTER_AUTHOR,
    emailAuthor,
    httpUrl,
    newsletterUrl,
    personAuthor,
    processArticle,
    processNewsletter,
    type ProcessedAuthor,
    type ProcessedTag
} from './process.js';
import type {TinyNewsArticle, TinyNewsAuthor, TinyNewsOptions} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose email matches one keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** Ghost relationship limit for one post. */
const MAX_RELATIONS = 500;

const LABELS: Record<string, string> = {article: 'Article', page: 'Page', newsletter: 'Newsletter'};

/** A stable Ghost ID for a post key, tag slug or author key, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-tinynews:1', site, kind, key);
}

/** The live site's URL without a trailing slash, and its host and path, which scope stable Ghost IDs to one site. */
function site(value: unknown): {url: string; scope: string} {
    const url = httpUrl(value);
    if (!url) {
        throw new Error('Tiny News migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    const {host, pathname} = new URL(url);
    return {url: url.replace(/\/+$/, ''), scope: host.toLowerCase() + pathname.replace(/\/+$/, '')};
}

/**
 * The URL of a stored article, page or newsletter on the live site, or `null` when it has none: an article's or
 * page's `live_url`, or `<url>/newsletters/<slug>` for a newsletter.
 */
export function sourceUrl(options: TinyNewsOptions, record: SourceRecord): string | null {
    const item = JSON.parse(record.content);
    return record.metadata.type === 'newsletter' ? newsletterUrl(site(options.url).url, item) : httpUrl(item.live_url);
}

/** Authors in the authors file are matched to an article's author by first names and last name. */
const nameKey = (author: TinyNewsAuthor) => JSON.stringify([author.first_names ?? null, author.last_name ?? null]);

const placeholderEmail = (slug: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`;

/**
 * The saved author for a processed author, identified by its key, so authors whose slugs collide stay separate users
 * with distinct slugs and placeholder emails. A Ghost user with the author's email supplies its ID, slug and roles.
 */
function authorEntity(state: MappingState, scope: string, source: ProcessedAuthor): AuthorContext {
    const context = state.context;
    const binding = state.getBinding('author', source.key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const base = source.slug || 'author';
    let data: Record<string, any> = {
        name: source.name,
        slug: base,
        email: source.email ?? placeholderEmail(base),
        roles: ['Contributor'],
        profile_image: source.profile_image,
        bio: source.bio
    };
    const match: GhostUser | undefined = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        // Authors that share an email are the same Ghost user.
        const same = state.getBinding('ghost-author', match.id);
        if (same) {
            state.bind('author', source.key, same);
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(same));
        }
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId(scope, 'author', source.key);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: source.name,
            reason: 'Unsupported author roles replaced by supported Ghost roles'
        });
        data.roles = data.roles.filter((role: string) => ROLES.includes(role));
        if (!data.roles.length) {
            data.roles = ['Contributor'];
        }
    }
    data.slug = state.uniqueSlug('author', data.slug, id);
    if (!match && !source.email && data.slug !== base) {
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
    state.bind('author', source.key, author.dbId!);
    state.bind('ghost-author', id, author.dbId!);
    return author;
}

/** The saved tag for a slug; the first name seen for a slug is kept. */
function tagEntity(state: MappingState, scope: string, source: ProcessedTag): TagContext {
    const context = state.context;
    const binding = state.getBinding('tag', source.slug);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    const id = ghostId(scope, 'tag', source.slug);
    const tag = new TagContext({name: source.name, slug: state.uniqueSlug('tag', source.slug, id)});
    tag.ghostId = id;
    tag.save(context.db);
    state.bind('tag', source.slug, tag.dbId!);
    return tag;
}

/**
 * An article's or page's author: its first author, enriched from the matching author in the authors file; otherwise
 * its translation's `created_by_email`; otherwise the only author in the authors file; otherwise the default author.
 * Also returns the authors-file record that contributed, if any.
 */
function articleAuthor(
    state: MappingState,
    item: TinyNewsArticle,
    soleAuthor: SourceRecord | null
): {author: ProcessedAuthor; profile: SourceRecord | null} {
    const nested = item.author?.[0]?.author;
    if (nested && typeof nested === 'object') {
        const profile = state.find('author-name', nameKey(nested), 1)[0] ?? null;
        const author = personAuthor(nested, profile && JSON.parse(profile.content));
        if (author) {
            return {author, profile};
        }
    }
    const byEmail = emailAuthor(item.translations?.[0]?.created_by_email);
    if (byEmail) {
        return {author: byEmail, profile: null};
    }
    const sole = soleAuthor && personAuthor(JSON.parse(soleAuthor.content));
    if (sole) {
        return {author: sole, profile: soleAuthor};
    }
    return {author: DEFAULT_AUTHOR, profile: null};
}

/**
 * Rebuild posts, tags and authors from the stored export. Articles become posts and pages become pages, published
 * or draft as in Tiny News, from their first translation, with their category and tags (internal when unpublished)
 * and `#tinynews`. Newsletter editions become published posts tagged `#newsletter` and `#tinynews`, by the
 * Newsletter author. Records without a key or translation, published records without a valid date, and records with
 * more than 500 tags are skipped with a `record:skipped` diagnostic. Content blocks that cannot be converted are left
 * out with an `operation:warning`. A draft without a date is dated when the export was read, so remapping is
 * repeatable.
 */
export async function map(
    options: TinyNewsOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Tiny News export before mapping.');
    }
    const {url: siteUrl, scope} = site(options.url);
    const readAt = new Date(context.sources.currentIngestion!.completedAt);
    const state = new MappingState(context, 'mg-tinynews');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        let soleAuthor: SourceRecord | null = null;
        for await (const record of context.sources.records({kind: 'author'})) {
            state.index('author-name', nameKey(JSON.parse(record.content)), record.id);
            soleAuthor = record;
        }
        if (context.sources.count('author') !== 1) {
            soleAuthor = null;
        }

        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const type = String(record.metadata.type);
            const label = LABELS[type];
            if (!record.key) {
                throw new RecordDataError(`${label} has no id or slug`);
            }
            const item = JSON.parse(record.content);
            const processed =
                type === 'newsletter'
                    ? processNewsletter(item, siteUrl)
                    : processArticle(item, type === 'page' ? 'page' : 'post', {
                          onUnhandled: reason =>
                              context.recordDiagnostic('operation:warning', {...record.metadata, reason}, record.id)
                      });
            const published = processed.published ?? (processed.fields.status === 'draft' ? readAt : null);
            if (!published) {
                throw new RecordDataError(`Published ${label.toLowerCase()} has no valid date`);
            }
            if (processed.tags.length > MAX_RELATIONS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(scope, 'post', record.key);
            for (const [field, value] of Object.entries(processed.fields)) {
                post.set(field, value);
            }
            post.set('created_at', processed.created ?? published);
            post.set('published_at', published);
            post.set('updated_at', processed.updated ?? published);

            const {author, profile} =
                type === 'newsletter'
                    ? {author: NEWSLETTER_AUTHOR, profile: null}
                    : articleAuthor(state, item, soleAuthor);
            const authorContext = authorEntity(state, scope, author);
            post.addAuthor(authorContext);
            context.sources.link(record.id, {type: 'author', id: authorContext.dbId!});
            if (profile) {
                context.sources.link(profile.id, {type: 'author', id: authorContext.dbId!});
            }

            for (const tag of processed.tags.map(source => tagEntity(state, scope, source))) {
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (processed.url) {
                context.addLink(stringUtils.cleanURL(processed.url), `/${post.get('slug')}/`);
            }
        });
    });
}
