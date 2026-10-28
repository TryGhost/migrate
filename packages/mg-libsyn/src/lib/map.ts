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
import {slugify} from '@tryghost/string';
import {stringUtils, urlUtils, xmlUtils} from '@tryghost/mg-utils';
import {siteUrl} from './fetch.js';
import {parseDate, processChannel, processPost, type LibsynTag, type ProcessedChannel} from './processor.js';
import type {LibsynItem, LibsynOptions} from './types.js';

const {getText} = xmlUtils;

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; the feed owner keeps the ID, name and slug of the one with the owner's email. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** Ghost relationship limit for one post. */
const MAX_RELATIONS = 500;

/** A stable Ghost ID for an item key, tag slug or the feed owner, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-libsyn:1', site, kind, key);
}

const placeholderEmail = (slug: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`;

/**
 * The saved author of every post: the feed owner, with the owner's email or a `<slug>@example.com` placeholder. A
 * Ghost user with the same email supplies its ID, name and slug.
 */
function mappedAuthor(
    state: MappingState,
    site: string,
    channel: SourceRecord,
    owner: NonNullable<ProcessedChannel['author']>
): AuthorContext {
    const context = state.context;
    const binding = state.getBinding('author', 'owner');
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const slug = slugify(owner.name) || 'author';
    let data: Record<string, any> = {
        name: owner.name,
        slug,
        email: owner.email ?? placeholderEmail(slug),
        roles: ['Contributor']
    };
    const match: GhostUser | undefined = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId(site, 'author', 'owner');
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: owner.name,
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
    state.bind('author', 'owner', entity.dbId!);
    context.sources.link(channel.id, {type: 'author', id: entity.dbId!});
    return entity;
}

/** The saved tag for a slug. Tags are identified by slug, so names that share one are one tag, named by the first. */
function mappedTag(context: MigrateContext, site: string, {name, slug}: LibsynTag): TagContext {
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId(site, 'tag', `slug:${slug}`);
    tag.save(context.db);
    return tag;
}

/**
 * Rebuild posts, tags and authors from the stored feed. Each item becomes a published post dated by its `pubDate`,
 * written by the feed owner, tagged with `addTag`, the feed's categories, its keywords and `#libsyn`. Every option
 * applies here, so changing one needs no new fetch. Items without a GUID or link, without a valid `pubDate`, or over
 * Ghost's tag limit are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: LibsynOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete Libsyn source data before mapping.');
    }
    const url = siteUrl(options.url);
    const site = urlUtils.canonicalSite(url);
    const base = urlUtils.trimTrailingSlashes(url.href);
    const channel = context.sources.get('channel', 'channel');
    if (!channel) {
        throw new Error('Completed Libsyn source data has no channel record.');
    }
    const feed = processChannel(JSON.parse(channel.content));
    const processOptions = {
        addTag: options.addTag,
        categories: options.useFeedCategories === false ? [] : feed.categories,
        useItemKeywords: options.useItemKeywords !== false,
        useEmbed: options.useEmbed !== false,
        image: feed.image
    };
    const state = new MappingState(context, 'mg-libsyn');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'item'}), async record => {
            const item: LibsynItem = JSON.parse(record.content);
            if (!record.key) {
                throw new RecordDataError('Item has neither a GUID nor a link');
            }
            const published = parseDate(getText(item.pubDate));
            if (!published) {
                throw new RecordDataError('Invalid Libsyn item date');
            }
            const data = processPost(item, processOptions);
            if (data.tags.length > MAX_RELATIONS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(site, 'post', record.key);
            post.set('title', data.title);
            post.set('slug', data.slug || 'untitled');
            post.set('status', 'published');
            post.set('visibility', 'public');
            post.set('type', 'post');
            post.set('created_at', published);
            post.set('published_at', published);
            post.set('updated_at', published);
            post.set('html', data.html);

            if (feed.author) {
                const author = mappedAuthor(state, site, channel, feed.author);
                post.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }
            for (const tag of data.tags.map(value => mappedTag(context, site, value))) {
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (data.slug) {
                context.addLink(stringUtils.cleanURL(`${base}/${data.slug}`), `/${post.get('slug')}/`);
            }
        });
    });
}
