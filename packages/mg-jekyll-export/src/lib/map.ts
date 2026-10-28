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
import {stringUtils, urlUtils} from '@tryghost/mg-utils';
import {processPost, readPost} from './process-post.js';
import type {JekyllOptions, JekyllPost, JekyllTag} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** A stable Ghost ID for a post path, tag slug or author email, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-jekyll-export:1', site, kind, key);
}

function siteUrl(value: unknown): URL {
    const url = urlUtils.httpUrl(value);
    if (!url) {
        throw new Error('Jekyll migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return url;
}

/** The path prefix a dated permalink structure gives a post, such as `2021/08/23/` for `/yyyy/mm/dd/`. */
function datedPrefix(date: Date | null, structure: JekyllOptions['datedPermalinks']): string {
    if (!date || !structure) {
        return '';
    }
    const [year, month, day] = date.toISOString().slice(0, 10).split('-');
    if (structure.includes('yyyy/mm/dd')) {
        return `${year}/${month}/${day}/`;
    }
    return structure.includes('yyyy/mm') ? `${year}/${month}/` : '';
}

/**
 * A post's URL on the live site: `--url`, the date prefix `--datedPermalinks` describes (from the post's UTC date),
 * and the post's source slug, such as `https://example.com/2021/08/23/my-post`.
 */
export function postUrl(
    options: Pick<JekyllOptions, 'url' | 'datedPermalinks'>,
    post: Pick<JekyllPost, 'sourceSlug' | 'date'>
) {
    const base = urlUtils.trimTrailingSlashes(siteUrl(options.url).href);
    return `${base}/${datedPrefix(post.date, options.datedPermalinks)}${post.sourceSlug}`;
}

/** The live URL of a stored post record. Throws a `RecordDataError` for invalid front matter. */
export function sourceUrl(
    options: Pick<JekyllOptions, 'url' | 'datedPermalinks'>,
    record: {key: string | null; content: string}
): string {
    return postUrl(options, readPost(record.key!, record.content));
}

const placeholderEmail = (slug: string, domain: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@${domain}`;

interface AuthorData {
    name: string;
    slug: string;
    email: string;
}

/**
 * The saved author for a placeholder email. Authors are identified by that email, so names with the same slug are
 * one user. A Ghost user with the same email supplies its ID, slug and roles.
 */
function authorEntity(state: MappingState, site: string, author: AuthorData): AuthorContext {
    const context = state.context;
    const key = author.email.toLowerCase();
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const match: GhostUser | undefined = state.get('ghost-user', key);
    const user = {...author, roles: ['Contributor']};
    const data: Record<string, any> = match ? {...mergeUsersWithGhost([{url: '', data: user}], [match])[0].data} : user;
    const id = data.id || ghostId(site, 'author', key);
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: author.name,
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

/** The saved tag for a slug, so names with the same slug are one tag. */
function tagEntity(state: MappingState, site: string, {name, slug}: JekyllTag): TagContext {
    const context = state.context;
    const binding = state.getBinding('tag', slug);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    const tag = new TagContext({name, slug: state.uniqueSlug('tag', slug)});
    tag.ghostId = ghostId(site, 'tag', slug);
    tag.save(context.db);
    state.bind('tag', slug, tag.dbId!);
    return tag;
}

/**
 * Rebuild posts, tags and authors from the stored post files. Each file becomes a post dated by its front matter
 * `date` or the date in its file name (a draft without either is dated when the export was read), with its
 * `author` names as authors (the Example User when it has none) and its categories, tags, `addTags`, and `#jekyll`
 * as tags. Every option applies here, so changing one needs no new read. Posts without a valid date, and files with
 * invalid front matter, are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: JekyllOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Jekyll export before mapping.');
    }
    const url = siteUrl(options.url);
    const site = urlUtils.canonicalSite(url);
    const domain = (typeof options.email === 'string' && options.email.trim()) || 'example.com';
    const readAt = new Date(context.sources.currentIngestion!.completedAt);
    const state = new MappingState(context, 'mg-jekyll-export');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const post = processPost(record.key!, record.content, {url: url.href, addTags: options.addTags});
            const date = post.date ?? (post.status === 'draft' ? readAt : null);
            if (!date) {
                throw new RecordDataError('No valid date in the front matter or file name');
            }

            const entity = new PostContext({lookupKey: record.key!});
            entity.ghostId = ghostId(site, 'post', record.key!);
            entity.set('title', post.title);
            entity.set('slug', post.slug);
            entity.set('status', post.status);
            entity.set('visibility', 'public');
            entity.set('type', 'post');
            entity.set('created_at', date);
            entity.set('published_at', date);
            entity.set('updated_at', date);
            entity.set('html', post.html);

            if (post.authors.length > 500 || post.tags.length > 500) {
                throw new RecordDataError('Post exceeds Ghost author/tag relationship limits');
            }
            const authors: AuthorData[] = post.authors.length
                ? post.authors.map(name => {
                      const slug = slugify(name) || 'author';
                      return {name, slug, email: placeholderEmail(slug, domain)};
                  })
                : [{name: 'Example User', slug: 'exampleuser', email: 'exampleuser@example.com'}];
            for (const author of authors.map(data => authorEntity(state, site, data))) {
                entity.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }
            for (const tag of post.tags.map(data => tagEntity(state, site, data))) {
                entity.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            entity.save(context.db);
            context.sources.link(record.id, {type: 'post', id: entity.dbId!});
            const prefix = datedPrefix(post.date, options.datedPermalinks);
            context.addLink(stringUtils.cleanURL(postUrl(options, post)), `/${prefix}${entity.get('slug')}/`);
        });
    });
}
