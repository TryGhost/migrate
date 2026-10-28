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
import {decode} from 'html-entities';
import {processHTMLContent, slugFromURL} from './process.js';
import {sourceBlogs} from './ingest.js';
import type {BloggerOptions, BloggerPost} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID, name and slug. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];

/** Ghost relationship limits for one post. */
const MAX_RELATIONS = 500;

/**
 * A stable Ghost ID. Posts are scoped to their blog ID; tags and authors are shared by every blog, so they use
 * `blogger.com`.
 */
export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-blogger:1', site, kind, key);
}

/**
 * The saved author for a Blogger profile. Authors are identified by Blogger profile ID, or by name when a post has
 * none, so different accounts that share a display name stay separate users. A Ghost user with the author's
 * `<slug>@example.com` email supplies its ID, name and slug.
 */
function mappedAuthor(state: MappingState, author: NonNullable<BloggerPost['author']>, name: string): AuthorContext {
    const context = state.context;
    const base = slugify(name) || 'author';
    const key = author.id ? `id:${author.id}` : `name:${base}`;
    const binding = state.getBinding('author', key);
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const email = (slug: string) => `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`;
    let data: Record<string, any> = {name, slug: base, email: email(base)};
    const match = state.get('ghost-user', data.email);
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
        const sameGhost = state.getBinding('ghost-author', data.id);
        if (sameGhost) {
            state.bind('author', key, sameGhost);
            return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(sameGhost));
        }
    }
    const id = data.id || ghostId('blogger.com', 'author', key);
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
    if (!match && data.slug !== base) {
        // Distinct authors need distinct emails as well as slugs.
        data.email = email(data.slug);
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

/** Blogger labels are identified by slug, so labels that share a slug are one tag. `#` names are internal tags. */
function namedTag(name: string, slug = slugify(name)): TagContext {
    if (name.startsWith('#') && !slug.startsWith('hash-')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug});
    tag.ghostId = ghostId('blogger.com', 'tag', `slug:${slug}`);
    return tag;
}

/** Order tags public first, then internal (`#`) tags, keeping their order otherwise. */
function publicFirst(tags: TagContext[]): TagContext[] {
    return [...tags].sort((a, b) => Number(a.data.name.startsWith('#')) - Number(b.data.name.startsWith('#')));
}

/**
 * Rebuild posts, tags and authors from the stored Blogger posts. `blogID` selects stored blogs, and `addTag` and
 * `firstImageAsFeatured` apply here, so changing them needs no new fetch; a blog that was not fetched needs a new
 * ingestion. Posts without an ID or a valid date, or over Ghost's relationship limits, are skipped with a
 * `record:skipped` diagnostic.
 */
export async function map(
    options: BloggerOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete Blogger source data before mapping.');
    }
    const stored = sourceBlogs(context);
    const blogs = options.blogID?.length ? options.blogID.map(String) : stored;
    const missing = blogs.filter(blog => !stored.includes(blog));
    if (missing.length) {
        throw new Error(
            `The stored Blogger source data does not include blog ${missing.join(', ')}. Fetch it again with --rereadSource.`
        );
    }
    const firstImageAsFeatured = options.firstImageAsFeatured ?? true;
    const addTag = options.addTag?.trim();
    const state = new MappingState(context, 'mg-blogger');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const item: BloggerPost = JSON.parse(record.content);
            const blog = String(item.blog?.id ?? record.metadata.blog);
            if (!blogs.includes(blog)) {
                return false;
            }
            if (!record.key) {
                throw new RecordDataError('Post has no ID');
            }
            const published = dateUtils.parseDate(item.published) ?? dateUtils.parseDate(item.updated);
            if (!published) {
                throw new RecordDataError('Invalid Blogger post dates');
            }
            const tags = (item.labels ?? [])
                .map(label => decode(String(label)).trim())
                .filter(Boolean)
                .map(label => namedTag(label));
            if (addTag) {
                tags.push(namedTag(addTag));
            }
            tags.push(namedTag(`#blogger-site-${blog}`, `hash-blogger-site-${blog}`));
            tags.push(namedTag('#blogger', 'hash-blogger'));
            if (tags.length > MAX_RELATIONS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }

            const title = decode(item.title ?? '') || '(Untitled)';
            const {html, feature_image: featureImage} = await processHTMLContent({
                postData: {},
                html: item.content ?? '',
                options: {firstImageAsFeatured}
            });
            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(blog, 'post', item.id);
            post.set('title', title);
            post.set('slug', (item.url && slugFromURL(item.url)) || slugify(title) || item.id);
            post.set('status', 'published');
            post.set('type', 'post');
            post.set('created_at', published);
            post.set('published_at', published);
            post.set('updated_at', dateUtils.parseDate(item.updated) ?? published);
            post.set('html', html);
            if (featureImage) {
                post.set('feature_image', featureImage);
            }

            const authorName = decode(item.author?.displayName ?? '').trim();
            if (authorName) {
                const author = mappedAuthor(state, item.author!, authorName);
                post.addAuthor(author);
                context.sources.link(record.id, {type: 'author', id: author.dbId!});
            }

            for (const tag of publicFirst(tags)) {
                tag.save(context.db);
                post.addTag(tag);
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (item.url && URL.canParse(item.url)) {
                context.addLink(stringUtils.cleanURL(item.url), `/${post.get('slug')}/`);
            }
        });
    });
}
