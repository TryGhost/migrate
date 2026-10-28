import {
    MigrateContext,
    PostContext,
    TagContext,
    AuthorContext,
    MappingState,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary, SourceRecord} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {stringUtils} from '@tryghost/mg-utils';
import processPost, {mediumHandle} from './process-post.js';
import processProfile from './process-profile.js';
import type {MediumOptions, MediumRelation, ScrapedData} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author with a matching email keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];
const AUTHOR_FIELDS = ['name', 'slug', 'email', 'profile_image', 'twitter'];

/** The CLI's defaults, used for options the caller leaves undefined. */
const DEFAULTS = {
    addPlatformTag: true,
    mediumAsCanonical: false
};

type ResolvedOptions = MediumOptions & typeof DEFAULTS;

function resolveOptions(options: MediumOptions): ResolvedOptions {
    const resolved: Record<string, unknown> = {...DEFAULTS};
    for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
            resolved[key] = value;
        }
    }
    return resolved as ResolvedOptions;
}

/** A stable Ghost ID for a Medium post ID, tag slug or author key. */
export function ghostId(kind: string, key: string): string {
    return coreGhostId('mg-medium-export:1', 'medium.com', kind, key);
}

/** An author to map: the source key that identifies it, its Medium URL, its fields, and its profile record. */
interface AuthorSource {
    key: string;
    url?: string;
    data: Record<string, any>;
    recordId?: number;
}

/** A profile record's author, keyed by its Medium handle so the same person's posts share it. */
function profileAuthor(record: SourceRecord): AuthorSource {
    const {url, data} = processProfile({html: record.content});
    const handle = mediumHandle(url);
    return {
        key: handle ? `handle:${handle}` : `profile:${record.key}`,
        url,
        data: {...data, slug: handle},
        recordId: record.id
    };
}

/**
 * A post's author: the export profile when the post's author link names the same Medium handle, otherwise the
 * author link itself. A post without an author link, such as a draft, is written by the profile in its zip, or by
 * the only profile in the export.
 */
function postAuthor(
    state: MappingState,
    record: SourceRecord,
    author: MediumRelation | undefined
): AuthorSource | undefined {
    if (author) {
        const handle = mediumHandle(author.url);
        const profile = handle ? state.get('profile-handle', handle) : undefined;
        return (
            profile ?? {
                key: handle ? `handle:${handle}` : `name:${author.data.name}`,
                url: author.url,
                data: author.data
            }
        );
    }
    return state.get('profile-file', String(record.metadata.file)) ?? state.get('profile-file', '');
}

function mappedAuthor(state: MappingState, source: AuthorSource, options: ResolvedOptions): AuthorContext {
    const context = state.context;
    const binding = state.getBinding('author', source.key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    let data: Record<string, any> = {};
    for (const field of AUTHOR_FIELDS) {
        if (source.data[field]) {
            data[field] = source.data[field];
        }
    }
    data.name ||= data.slug ? stringUtils.startCase(data.slug) : 'Example User';
    data.slug ||= slugify(data.name);
    data.email ||= `${data.slug.slice(0, 50).replace(/-+$/, '')}@${options.email || 'example.com'}`;
    data.roles = ['Contributor'];
    const match = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId('author', source.key);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: source.key,
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
    state.bind('author', source.key, entity.dbId!);
    if (source.recordId) {
        context.sources.link(source.recordId, {type: 'author', id: entity.dbId!});
    }
    if (source.url) {
        context.addLink(stringUtils.cleanURL(source.url), `/author/${entity.get('slug')}/`);
    }
    return entity;
}

/** Medium tags are identified by slug, so tags that share a slug are one Ghost tag. */
function tagEntity(name: string, slug: string | undefined): TagContext {
    slug ||= slugify(name);
    if (name.startsWith('#') && !slug!.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId('tag', slug!);
    return tag;
}

/** Public tags first, then internal `#` tags, each in their existing order. */
function sortTags(post: PostContext): void {
    post.setTagOrder(tags =>
        [...tags].sort((a, b) => Number(a.data.name.startsWith('#')) - Number(b.data.name.startsWith('#')))
    );
}

/** Add a tag to a post, mapping its Medium tag page to the Ghost tag page. */
function addTag(context: MigrateContext, post: PostContext, name: string, slug?: string, url?: string): void {
    const tag = tagEntity(name, slug);
    tag.save(context.db);
    post.addTag(tag);
    if (url && /^https?:\/\//.test(url)) {
        context.addLink(stringUtils.cleanURL(url), `/tag/${tag.get('slug')}/`);
    }
}

/**
 * Rebuild posts, tags and authors from the stored export. Every option applies here, so changing one needs no new
 * read of the export. Posts without a Medium post ID or with an invalid publish date, and a second file for the
 * same Medium post, are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: MediumOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Medium export before mapping.');
    }
    const resolved = resolveOptions(options);
    // Drafts and posts without a publish date are dated when the export was read, so remapping keeps their dates.
    const readAt = new Date(context.sources.currentIngestion!.completedAt);
    const state = new MappingState(context, 'mg-medium-export');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        // Each zip's profile authors the posts in that zip that name no author; the export's only profile, if there
        // is just one, authors those in other zips. A profile also describes posts whose author has its handle.
        const profiles: AuthorSource[] = [];
        for await (const record of context.sources.records({kind: 'profile'})) {
            const source = profileAuthor(record);
            profiles.push(source);
            state.set('profile-file', record.key!, source);
            if (source.key.startsWith('handle:') && !state.get('profile-handle', source.key.slice(7))) {
                state.set('profile-handle', source.key.slice(7), source);
            }
        }
        if (profiles.length === 1) {
            state.set('profile-file', '', profiles[0]);
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const item = processPost({name: record.key!, html: record.content, options: resolved, date: readAt});
            const mediumId = item.data.comment_id;
            const earlier = state.get('post-id', mediumId);
            if (earlier) {
                throw new RecordDataError(`${earlier} is the same Medium post (${mediumId}) and is imported instead`);
            }
            state.set('post-id', mediumId, record.key);

            const post = new PostContext({lookupKey: record.key!});
            post.ghostId = ghostId('post', mediumId);
            post.set('title', item.data.title || '(Untitled)');
            post.set('slug', item.data.slug || mediumId);
            post.set('custom_excerpt', item.data.custom_excerpt || null);
            post.set('status', item.data.status);
            post.set('created_at', item.data.created_at);
            post.set('updated_at', item.data.updated_at);
            post.set('published_at', item.data.published_at ?? null);
            post.set('comment_id', mediumId);
            post.set('html', item.data.html);
            for (const field of ['feature_image', 'feature_image_alt', 'feature_image_caption', 'canonical_url']) {
                const value = item.data[field as keyof typeof item.data];
                if (value) {
                    post.set(field, value);
                }
            }

            const author = postAuthor(state, record, item.data.author);
            if (author) {
                const entity = mappedAuthor(state, author, resolved);
                post.addAuthor(entity);
                context.sources.link(record.id, {type: 'author', id: entity.dbId!});
            }
            for (const tag of item.data.tags) {
                const name = tag.data.name.trim();
                if (name) {
                    addTag(context, post, name, tag.data.slug, tag.url);
                }
            }
            sortTags(post);
            post.save(context.db);
            for (const tag of post.data.tags as TagContext[]) {
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            for (const url of [item.url, `https://medium.com/p/${mediumId}`]) {
                if (url) {
                    context.addLink(stringUtils.cleanURL(url), `/${post.get('slug')}/`);
                }
            }
        });
    });
}

/**
 * Apply a scraped post page to a mapped post: schema fields such as `meta_description` and `og_image`, the scraped
 * tags (public tags before internal ones), and the author's profile image when the author has none. The caller
 * saves the post, which saves its tags and authors.
 */
export function applyScrapedData(post: PostContext, scraped: ScrapedData, context: MigrateContext): void {
    for (const [field, value] of Object.entries(scraped)) {
        if (
            field !== 'tags' &&
            field !== 'author' &&
            field in post.schema.shape &&
            value !== null &&
            value !== undefined &&
            value !== ''
        ) {
            post.set(field, value);
        }
    }
    let tagged = false;
    for (const tag of scraped.tags ?? []) {
        const name = (tag.name ?? '').trim();
        if (name) {
            addTag(context, post, name, tag.slug, tag.url);
            tagged = true;
        }
    }
    if (tagged) {
        sortTags(post);
    }
    const [author] = post.data.authors as AuthorContext[];
    if (scraped.author?.profile_image && author && !author.get('profile_image')) {
        author.set('profile_image', scraped.author.profile_image);
    }
}
