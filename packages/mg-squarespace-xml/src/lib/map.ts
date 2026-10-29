import {
    MigrateContext,
    PostContext,
    TagContext,
    AuthorContext,
    MappingState as CoreMappingState,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary, SourceRecord} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {stringUtils, xmlUtils} from '@tryghost/mg-utils';
import {decode} from 'html-entities';
import {sourceSite, sourceUrl} from './ingest.js';
import {
    featureImageUrl,
    htmlToTextTrimmed,
    postDates,
    postSlug,
    processContent,
    processTags,
    processUser
} from './process.js';
import type {SquarespaceOptions, SquarespaceRecord} from './types.js';

const {ensureArray, getText} = xmlUtils;

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author with a matching email keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** The CLI's defaults, used for options the caller leaves undefined. */
const DEFAULTS = {posts: true, pages: false, drafts: true, tags: true};

type ResolvedOptions = SquarespaceOptions & typeof DEFAULTS;

/** Posts whose author is not in the export are credited to this author. */
const FALLBACK_AUTHOR = {
    slug: 'migrator-added-author',
    name: 'Migrator Added Author',
    email: 'migrator-added-author@example.com'
};

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-squarespace-xml:1', site, kind, key);
}

/** Disk-backed lookups rebuilt from the stored originals for each mapping. */
class MappingState extends CoreMappingState {
    constructor(
        context: MigrateContext,
        readonly url: string,
        readonly site: string
    ) {
        super(context, 'mg-squarespace-xml');
    }
}

function resolveOptions(options: SquarespaceOptions): ResolvedOptions {
    const resolved: Record<string, unknown> = {...DEFAULTS};
    for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
            resolved[key] = value;
        }
    }
    return resolved as ResolvedOptions;
}

/** Index authors by login, display name and email, and items by their position in the export. */
async function indexSources(state: MappingState): Promise<void> {
    for await (const record of state.context.sources.records({kind: 'author'})) {
        if (!record.key) {
            continue;
        }
        const author = JSON.parse(record.content);
        for (const field of ['wp:author_login', 'wp:author_display_name', 'wp:author_email']) {
            const value = getText(author[field]);
            if (value) {
                state.index('creator', value, record.id);
            }
        }
    }
    for await (const record of state.context.sources.records({kind: 'item'})) {
        state.index('position', String(record.metadata.index), record.id);
    }
}

function selected(item: SquarespaceRecord, options: ResolvedOptions): boolean {
    const type = getText(item['wp:post_type']);
    if (type !== 'post' && type !== 'page') {
        return false;
    }
    return !(
        (type === 'post' && !options.posts) ||
        (type === 'page' && !options.pages) ||
        (getText(item['wp:status']) !== 'publish' && !options.drafts)
    );
}

/**
 * The attachment holding an item's feature image: the item its `_thumbnail_id` names or, without one, the item
 * that follows it in the export, where Squarespace writes it.
 */
function featureAttachment(
    state: MappingState,
    record: SourceRecord,
    item: SquarespaceRecord
): {record: SourceRecord; url: string} | undefined {
    const thumbnail = ensureArray(item['wp:postmeta']).find(meta => getText(meta['wp:meta_key']) === '_thumbnail_id');
    const attachment = thumbnail
        ? state.context.sources.get('item', `id:${getText(thumbnail['wp:meta_value']).trim()}`)
        : state.find('position', String(Number(record.metadata.index) + 1), 1)[0];
    const url = attachment ? featureImageUrl(JSON.parse(attachment.content)) : undefined;
    return url ? {record: attachment!, url} : undefined;
}

/** The export's author whose login, display name or email is `creator`, or the fallback author. */
function mappedAuthor(state: MappingState, creator: string): AuthorContext {
    const context = state.context;
    const source = creator ? state.find('creator', creator, 1)[0] : undefined;
    const key = source ? source.key! : 'fallback';
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    let data: Record<string, any> = source ? {...processUser(JSON.parse(source.content)).data} : {...FALLBACK_AUTHOR};
    const match = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: data.slug, data: data as any}], [match])[0].data};
        const sameGhost = state.get('ghost-author', data.id);
        if (sameGhost) {
            state.bind('author', key, sameGhost);
            if (source) context.sources.link(source.id, {type: 'author', id: sameGhost});
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(sameGhost));
        }
    }
    const id = data.id || ghostId(state.site, 'author', key);
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
    state.set('ghost-author', id, entity.dbId!);
    if (source) context.sources.link(source.id, {type: 'author', id: entity.dbId!});
    return entity;
}

/** Tags are identified by slug, so a category and a tag that share a slug are one Ghost tag. */
function mappedTag(state: MappingState, name: string, slug: string, url?: string): TagContext {
    if (name.startsWith('#') && !slug.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId(state.site, 'tag', slug);
    tag.save(state.context.db);
    if (url) {
        const target = `/tag/${tag.get('slug')}/`;
        state.context.addLink(stringUtils.cleanURL(url), target);
        state.context.addLink(stringUtils.cleanURL(new URL(url, state.url).href), target);
    }
    return tag;
}

/**
 * Rebuild posts, pages, tags and authors from the stored export. Every option applies here, so changing one needs
 * no new read. Items with an invalid date, without an ID, or over Ghost's 500-tag limit are skipped with a
 * `record:skipped` diagnostic.
 */
export async function map(
    options: SquarespaceOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Squarespace export before mapping.');
    }
    const resolved = resolveOptions(options);
    const {url: siteUrl, site} = await sourceSite(context);
    const state = new MappingState(context, siteUrl, site);
    return context.rebuildMappedContent(async () => {
        await indexSources(state);
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'item'}), async record => {
            const item: SquarespaceRecord = JSON.parse(record.content);
            if (!selected(item, resolved)) {
                return false;
            }
            const {published, modified} = postDates(item);
            if (!published) {
                throw new RecordDataError('Invalid Squarespace publication date');
            }
            if (!record.key) {
                throw new RecordDataError('Item has neither a Squarespace ID nor a usable URL');
            }
            const link = getText(item.link);
            const url = sourceUrl(link, siteUrl);
            const html = processContent(getText(item['content:encoded']), {...resolved, url: siteUrl});
            const rawTitle = getText(item.title);

            const tags: {name: string; slug: string; url?: string}[] = [];
            for (const {url: tagUrl, data} of processTags(ensureArray(item.category), resolved.tags)) {
                const name = data.name.trim();
                if (name) {
                    tags.push({name, slug: data.slug || slugify(name), url: data.slug ? tagUrl : undefined});
                }
            }
            if (resolved.addTag?.trim()) {
                tags.push({name: resolved.addTag.trim(), slug: slugify(resolved.addTag.trim())});
            }
            tags.push({name: '#sqs', slug: 'hash-sqs'});
            if (!rawTitle) {
                tags.push({name: '#no-title', slug: 'hash-no-title'});
            }
            if (new Set(tags.map(tag => tag.slug)).size > 500) {
                throw new RecordDataError('Post exceeds the Ghost tag limit');
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(site, 'post', record.key);
            post.set('title', rawTitle ? decode(rawTitle) : htmlToTextTrimmed(html, 50));
            post.set('slug', postSlug(link));
            post.set('status', getText(item['wp:status']) === 'publish' ? 'published' : 'draft');
            post.set('type', getText(item['wp:post_type']));
            post.set('html', html);
            post.set('published_at', published);
            post.set('created_at', published);
            post.set('updated_at', modified!);
            const image = featureAttachment(state, record, item);
            if (image) {
                post.set('feature_image', image.url);
            }

            const author = mappedAuthor(state, getText(item['dc:creator']));
            post.addAuthor(author);
            context.sources.link(record.id, {type: 'author', id: author.dbId!});
            for (const {name, slug, url: tagUrl} of tags.sort(
                (a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#'))
            )) {
                const tag = mappedTag(state, name, slug, tagUrl);
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (image) {
                context.sources.link(image.record.id, {type: 'post', id: post.dbId!});
            }
            if (url) {
                context.addLink(stringUtils.cleanURL(url), `/${post.get('slug')}/`);
            }
        });
    });
}
