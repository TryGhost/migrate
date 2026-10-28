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
import {stringUtils, urlUtils} from '@tryghost/mg-utils';
import {slugify} from '@tryghost/string';
import {processRow} from './process.js';
import type {WixTag} from './process.js';
import type {WixOptions, WixRow} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** Ghost's limit on tags per post. */
const MAX_TAGS = 500;

/** A stable Ghost ID for a post's record key, or a tag's or author's `slug:<slug>` key, scoped to the site. */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-wix-csv:1', site, kind, key);
}

/** The live site's URL without trailing slashes, and its host and path, which scope stable Ghost IDs. */
function site(value: unknown): {url: string; scope: string} {
    const url = urlUtils.httpUrl(value);
    if (!url) {
        throw new Error('Wix migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return {url: (value as string).trim().replace(/\/+$/, ''), scope: urlUtils.canonicalSite(url)};
}

/**
 * The saved author for a name. Wix names authors without an ID or email, so names with the same slug are one
 * author, with a `<slug>@example.com` email. A Ghost user with that email supplies its ID, slug and roles;
 * otherwise the slug is suffixed around Ghost users' slugs.
 */
function authorEntity(state: MappingState, scope: string, name: string): AuthorContext {
    const context = state.context;
    const slug = slugify(name) || 'author';
    const key = `slug:${slug}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    let data: Record<string, any> = {name, slug, email: `${slug}@example.com`};
    const match: GhostUser | undefined = state.get('ghost-user', data.email);
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId(scope, 'author', key);
    delete data.id;
    if (data.roles?.some((role: string) => !ROLES.includes(role))) {
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
    const author = new AuthorContext();
    for (const [field, value] of Object.entries(data)) {
        if (value !== undefined) {
            author.set(field, value);
        }
    }
    author.ghostId = id;
    author.save(context.db);
    state.bind('author', key, author.dbId!);
    return author;
}

/** The saved tag for a slug; the first name seen for a slug is kept. */
function tagEntity(state: MappingState, scope: string, source: WixTag): TagContext {
    const context = state.context;
    const key = `slug:${source.slug}`;
    const binding = state.getBinding('tag', key);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    const id = ghostId(scope, 'tag', key);
    const tag = new TagContext({name: source.name, slug: state.uniqueSlug('tag', source.slug, id)});
    tag.ghostId = id;
    tag.save(context.db);
    state.bind('tag', key, tag.dbId!);
    return tag;
}

/**
 * Rebuild posts, tags and authors from the stored CSV rows. Every option applies here, so changing one needs no new
 * read of the export. A post is dated by its `Published Date`, falling back to its `Last Published Date`; a draft
 * with neither is dated when the CSV was read, so remapping is repeatable. Rows without an ID, URL or slug,
 * published rows without a valid date, and posts with more than 500 tags are skipped with a `record:skipped`
 * diagnostic.
 */
export async function map(
    options: WixOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Wix posts CSV before mapping.');
    }
    const {url, scope} = site(options.url);
    const resolved = {...options, url};
    // Drafts never given a date are dated when the CSV was read, so remapping keeps their dates.
    const readAt = new Date(context.sources.currentIngestion!.completedAt);
    const state = new MappingState(context, 'mg-wix-csv');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            if (!record.key) {
                throw new RecordDataError('Row has no ID, Post Page URL or Slug');
            }
            const row: WixRow = JSON.parse(record.content);
            const processed = processRow(row, resolved);
            const draft = processed.fields.status === 'draft';
            const date = processed.published ?? processed.lastPublished ?? (draft ? readAt : null);
            if (!date) {
                throw new RecordDataError('Published row has no valid Published Date or Last Published Date');
            }
            if (processed.tags.length > MAX_TAGS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(scope, 'post', record.key);
            for (const [field, value] of Object.entries(processed.fields)) {
                post.set(field, value);
            }
            post.set('created_at', date);
            post.set('updated_at', processed.lastPublished ?? date);
            post.set('published_at', draft ? null : date);

            const author = authorEntity(state, scope, processed.author);
            post.addAuthor(author);
            context.sources.link(record.id, {type: 'author', id: author.dbId!});

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
