import {
    MigrateContext,
    PostContext,
    TagContext,
    AuthorContext,
    MappingState,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import {mergeUsersWithGhost} from '@tryghost/mg-ghost-authors';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {dateUtils, stringUtils} from '@tryghost/mg-utils';
import {decode} from 'he';
import {processContent} from './process.js';
import type {ContentPost, ScrapedData, ScrapedRelation, SubstackOptions, SubstackRow} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an `--email` author with a matching email keeps that user's ID. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** The CLI's defaults, used for options the caller leaves undefined. */
const DEFAULTS = {
    posts: true,
    drafts: true,
    pages: true,
    podcasts: true,
    threads: false,
    useMetaImage: true,
    useFirstImage: true,
    useMetaAuthor: true,
    addPlatformTag: true,
    addTypeTag: true,
    addAccessTag: true,
    comments: true,
    noSubscribeButtons: false,
    subscribeLink: '#/portal/signup',
    commentLink: '#ghost-comments-root'
};

type ResolvedOptions = SubstackOptions & typeof DEFAULTS;

/** The site URL without trailing slashes. */
function siteUrl(value: unknown): string {
    const url = typeof value === 'string' ? URL.parse(value) : null;
    if (!url || !['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Substack migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return (value as string).replace(/\/+$/, '');
}

function resolveOptions(options: SubstackOptions): ResolvedOptions {
    const resolved: Record<string, unknown> = {...DEFAULTS};
    for (const [key, value] of Object.entries(options)) {
        if (value !== undefined) {
            resolved[key] = value;
        }
    }
    resolved.url = siteUrl(options.url);
    return resolved as ResolvedOptions;
}

/** The host and path that scope stable Ghost IDs to one site. */
function canonicalSite(url: string): string {
    const parsed = new URL(url);
    return parsed.host.toLowerCase() + parsed.pathname.replace(/\/+$/, '');
}

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-substack:1', site, kind, key);
}

function postSlug(postId: string): string {
    return postId.replace(/^(?:\d{1,10}\.)(\S*)/gm, '$1');
}

/** The URL a `posts.csv` row's post was published at, such as `https://example.substack.com/p/my-post`. */
export function postUrl(row: SubstackRow, url: string): string {
    return `${siteUrl(url)}/p/${postSlug(row.post_id)}`;
}

/** Substack writes ISO dates in UTC; a zoneless timestamp is read as UTC too. */
function rowDate(row: SubstackRow): Date | undefined {
    if (!row.post_date?.trim()) {
        return undefined;
    }
    const date = dateUtils.parseDate(row.post_date);
    if (!date) {
        throw new RecordDataError('Invalid Substack post date');
    }
    return date;
}

function selected(row: SubstackRow, options: ResolvedOptions): boolean {
    const type = (row.type ?? '').toLowerCase();
    return !(
        (type === 'newsletter' && !options.posts) ||
        (type === 'page' && !options.pages) ||
        (type === 'thread' && !options.threads) ||
        (type === 'podcast' && !options.podcasts) ||
        ((row.is_published ?? '').toLowerCase() !== 'true' && !options.drafts)
    );
}

/** Posts without a date are left out of date-bounded migrations. */
function inDateRange(date: Date | undefined, options: ResolvedOptions): boolean {
    if (options.postsAfter && !(date && date > new Date(options.postsAfter))) {
        return false;
    }
    if (options.postsBefore) {
        const end = new Date(options.postsBefore);
        end.setDate(end.getDate() + 1);
        return Boolean(date && date < end);
    }
    return true;
}

/** Convert a post's export HTML, using scraped values when the runner has them. */
function renderContent(row: SubstackRow, html: string, options: ResolvedOptions, scraped: ScrapedData = {}) {
    const slug = postSlug(row.post_id);
    const post: ContentPost = {
        substackPodcastURL: row.podcast_url || false,
        data: {
            html,
            title: row.title || slug,
            slug,
            og_image: scraped.og_image,
            podcast_audio_src: scraped.podcast_audio_src
        }
    };
    processContent(post, options.url, options);
    return {
        html: post.data.html!,
        feature_image: post.data.feature_image ?? null,
        feature_image_caption: post.data.feature_image_caption ?? null
    };
}

/** Substack tags are identified by slug, so tags that share a slug are one Ghost tag. */
function tagEntity(name: string, slug: string, site: string): TagContext {
    if (name.startsWith('#') && !slug.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId(site, 'tag', slug);
    return tag;
}

/** The type, `--addTag`, platform, type and access tags for a row. */
function rowTags(row: SubstackRow, options: ResolvedOptions): {name: string; slug: string}[] {
    const type = slugify(row.type ?? '');
    const access = slugify(row.audience ?? '');
    const tags = [{name: stringUtils.startCase(type), slug: type}];
    if (options.addTag?.trim()) {
        tags.push({name: options.addTag.trim(), slug: slugify(options.addTag.trim())});
    }
    if (options.addPlatformTag) {
        tags.push({name: '#substack', slug: 'hash-substack'});
    }
    if (options.addTypeTag) {
        tags.push({name: `#substack-type-${type}`, slug: `hash-substack-type-${type}`});
    }
    if (options.addAccessTag) {
        tags.push({name: `#substack-access-${access}`, slug: `hash-substack-access-${access}`});
    }
    return tags.filter(tag => tag.name);
}

function emailAuthor(state: MappingState, email: string, site: string): AuthorContext {
    const context = state.context;
    const key = `email:${email.toLowerCase()}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const slug = slugify(email.replace(/(^[\w_-]*)(@[\w_-]*\.\w*(?:\.\w{0,2})?)/, '$1'));
    let data: Record<string, any> = {name: stringUtils.startCase(slug), slug, email, roles: ['Contributor']};
    const match = state.get('ghost-user', email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId(site, 'author', key);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
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
    return entity;
}

/**
 * Rebuild posts, pages, tags and authors from the stored `posts.csv` rows and their HTML files. Every filter and
 * content option applies here, so changing one needs no new read of the export. Records with an invalid date or
 * no HTML file are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: SubstackOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Substack export before mapping.');
    }
    const resolved = resolveOptions(options);
    for (const name of ['postsBefore', 'postsAfter'] as const) {
        if (resolved[name] && !Number.isFinite(Date.parse(resolved[name]))) {
            throw new Error(`Invalid ${name} date: ${resolved[name]}`);
        }
    }
    const site = canonicalSite(resolved.url);
    // Posts never given a date are dated when the export was read, so remapping keeps their dates.
    const readAt = new Date(context.sources.currentIngestion!.completedAt);
    const state = new MappingState(context, 'mg-substack');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const row: SubstackRow = JSON.parse(record.content);
            if (!selected(row, resolved)) {
                return false;
            }
            const date = rowDate(row);
            if (!inDateRange(date, resolved)) {
                return false;
            }
            if (!record.key) {
                throw new RecordDataError('Row has no post_id');
            }
            const source = context.sources.get('html', `${record.key}.html`);
            if (!source) {
                throw new RecordDataError('No HTML file in the export for this post');
            }
            const slug = postSlug(record.key);
            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(site, 'post', record.key);
            post.set('title', row.title || slug);
            post.set('slug', slug);
            post.set('comment_id', record.key.replace(/\..*$/, ''));
            post.set('created_at', date ?? readAt);
            post.set('updated_at', date ?? readAt);
            post.set('published_at', date ?? readAt);
            post.set('custom_excerpt', row.subtitle ? decode(row.subtitle) : null);
            post.set('type', slugify(row.type ?? '') === 'page' ? 'page' : 'post');
            post.set('status', (row.is_published ?? '').toLowerCase() === 'true' ? 'published' : 'draft');
            post.set(
                'visibility',
                row.audience === 'only_paid' ? 'paid' : row.audience === 'only_free' ? 'members' : 'public'
            );
            for (const [field, value] of Object.entries(renderContent(row, source.content, resolved))) {
                post.set(field, value);
            }
            if (resolved.email && !resolved.useMetaAuthor) {
                const author = emailAuthor(state, resolved.email, site);
                post.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }
            for (const {name, slug: tagSlug} of rowTags(row, resolved).sort(
                (a, b) => Number(a.name.startsWith('#')) - Number(b.name.startsWith('#'))
            )) {
                const tag = tagEntity(name, tagSlug, site);
                tag.save(context.db);
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            context.sources.link(source.id, {type: 'post', id: post.dbId!});
            context.addLink(stringUtils.cleanURL(postUrl(row, resolved.url)), `/${post.get('slug')}/`);
        });
    });
}

function scrapedAuthor({data}: ScrapedRelation, site: string): AuthorContext {
    const author = new AuthorContext({
        name: data.name,
        slug: data.slug,
        email: data.email || `${data.slug}@example.com`,
        profile_image: data.profile_image ?? null,
        roles: ['Contributor']
    });
    author.ghostId = ghostId(site, 'author', `slug:${data.slug}`);
    return author;
}

/**
 * Apply a scraped post page to a mapped post: schema fields such as `meta_title` and `og_image`, the section and
 * post tags (placed before the mapped tags), the ld+json authors, and the HTML again with the scraped `og_image`
 * and podcast audio, re-converted from the stored export HTML. The caller saves the post.
 */
export function applyScrapedData(
    post: PostContext,
    scraped: ScrapedData,
    context: MigrateContext,
    options: SubstackOptions
): void {
    const resolved = resolveOptions(options);
    const site = canonicalSite(resolved.url);
    for (const [field, value] of Object.entries(scraped)) {
        if (
            field !== 'tags' &&
            field !== 'authors' &&
            field in post.schema.shape &&
            value !== null &&
            value !== undefined &&
            value !== ''
        ) {
            post.set(field, value);
        }
    }
    if (scraped.og_image || scraped.podcast_audio_src) {
        const row: SubstackRow = JSON.parse(context.sources.get('post', post.lookupKey!)!.content);
        const html = context.sources.get('html', `${post.lookupKey}.html`)!.content;
        for (const [field, value] of Object.entries(renderContent(row, html, resolved, scraped))) {
            post.set(field, value);
        }
    }
    const order = new Map<string, number>();
    for (const {data} of scraped.tags ?? []) {
        if (!data.name?.trim()) {
            continue;
        }
        const tag = tagEntity(data.name, data.slug, site);
        if (!order.has(tag.data.slug)) {
            order.set(tag.data.slug, order.size);
        }
        post.addTag(tag);
    }
    if (order.size) {
        post.setTagOrder(tags => {
            const rank = (tag: TagContext) =>
                Number(tag.data.name.startsWith('#')) * 2 * tags.length + (order.get(tag.data.slug) ?? order.size);
            return [...tags].sort((a, b) => rank(a) - rank(b));
        });
    }
    for (const author of scraped.authors ?? []) {
        post.addAuthor(scrapedAuthor(author, site));
    }
}
