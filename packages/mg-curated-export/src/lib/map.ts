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
import {dateUtils, stringUtils} from '@tryghost/mg-utils';
import {decode} from 'html-entities';
import processContent from './process-content.js';
import type {CuratedIssue, CuratedOptions} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; when one has the author's email, posts keep that user's ID, slug and roles. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

const ROLES = ['Contributor', 'Author', 'Editor', 'Administrator'];
const STATUSES = ['published', 'draft', 'scheduled'];

/** A stable Ghost ID for an issue URL, tag name or author email. */
export function ghostId(kind: string, key: string): string {
    return coreGhostId('mg-curated-export:1', 'curated.co', kind, key);
}

/** A trimmed string option, or `undefined` when it is unset or blank. */
function option(value: unknown): string | undefined {
    return (typeof value === 'string' && value.trim()) || undefined;
}

/** The single author of every post, from `--name` and `--email`, or the Ghost user with that email. */
function authorEntity(state: MappingState, options: CuratedOptions): AuthorContext {
    const context = state.context;
    const binding = state.getBinding('author', 'options');
    if (binding) {
        return AuthorContext.fromRow(context.db.stmts.findAuthorById.get(binding));
    }
    const name = option(options.name) ?? 'Example User';
    const slug = slugify(name);
    let data: Record<string, any> = {
        name,
        slug,
        email: option(options.email) ?? `${slug.slice(0, 50).replace(/-+$/, '')}@example.com`,
        roles: ['Contributor']
    };
    const match = state.get('ghost-user', data.email.toLowerCase());
    if (match) {
        data = {...mergeUsersWithGhost([{url: '', data: data as any}], [match])[0].data};
    }
    const id = data.id || ghostId('author', data.email.toLowerCase());
    delete data.id;
    if (data.roles.some((role: string) => !ROLES.includes(role))) {
        context.recordDiagnostic('operation:warning', {
            author: data.email,
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
    state.bind('author', 'options', author.dbId!);
    return author;
}

/** A tag added to every post, identified by its name. Distinct names whose slugs collide get distinct slugs. */
function tagEntity(state: MappingState, name: string): TagContext {
    const context = state.context;
    const binding = state.getBinding('tag', name);
    if (binding) {
        return TagContext.fromRow(context.db.stmts.findTagById.get(binding));
    }
    let slug = slugify(name);
    if (name.startsWith('#')) {
        slug = `hash-${slug}`;
    }
    const tag = new TagContext({name, slug: state.uniqueSlug('tag', slug)});
    tag.ghostId = ghostId('tag', name);
    tag.save(context.db);
    state.bind('tag', name, tag.dbId!);
    return tag;
}

/** The issue's URL, which gives the post its slug and old address. */
function issueUrl(issue: CuratedIssue): URL {
    const url = typeof issue.url === 'string' ? URL.parse(issue.url.trim()) : null;
    if (!url || !['http:', 'https:'].includes(url.protocol)) {
        throw new RecordDataError('Issue has no valid URL');
    }
    return url;
}

/**
 * Rebuild posts, tags and the author from the stored issues. Each issue becomes a public post by the `--name` and
 * `--email` author, tagged with `--tag` and `#curated`, whose slug is the last segment of its Curated URL. Its HTML
 * lists each category's items, with images served from the paths `ingest()` wrote them to; an image missing from
 * the export is left out with an `operation:warning` diagnostic. Issues without a valid URL or `published_at` are
 * skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: CuratedOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Curated export before mapping.');
    }
    const tagNames = [...new Set([option(options.tag), '#curated'].filter((name): name is string => Boolean(name)))];
    const state = new MappingState(context, 'mg-curated-export');
    return context.rebuildMappedContent(async () => {
        for await (const user of services.ghostUsers ?? []) {
            state.reserveSlug('author', user.slug, user.id);
            if (user.email) {
                state.set('ghost-user', user.email.toLowerCase(), user);
            }
        }
        return context.mapRecords(context.sources.records({kind: 'issue'}), async record => {
            const issue: CuratedIssue = JSON.parse(record.content);
            const url = issueUrl(issue);
            const published = dateUtils.parseDate(issue.published_at);
            if (!published) {
                throw new RecordDataError('Invalid Curated published_at');
            }
            // The key is `published/<number>/<number>.json`; the issue's images are stored beside it.
            const directory = record.key!.replace(/[^/]+$/, '');
            const images = new Set<number>();
            const html = processContent(issue, filename => {
                const image = context.sources.get('image', `${directory}${filename}`);
                const outputPath = image?.metadata.outputPath;
                if (typeof outputPath !== 'string') {
                    context.recordDiagnostic(
                        'operation:warning',
                        {...record.metadata, reason: 'Image not found in the export', image: filename},
                        record.id
                    );
                    return null;
                }
                images.add(image!.id);
                return outputPath;
            });
            const status = String(issue.publication_status);

            const post = new PostContext({lookupKey: record.key!});
            post.ghostId = ghostId('post', stringUtils.cleanURL(url.href));
            post.set('title', issue.title ? decode(String(issue.title)) : '(Untitled)');
            post.set('slug', url.pathname.split('/').filter(Boolean).pop() ?? directory.split('/')[1]);
            post.set('custom_excerpt', issue.summary ? String(issue.summary) : null);
            post.set('status', STATUSES.includes(status) ? status : 'draft');
            post.set('visibility', 'public');
            post.set('type', 'post');
            post.set('created_at', published);
            post.set('published_at', published);
            post.set('updated_at', dateUtils.parseDate(issue.updated_at) ?? published);
            post.set('html', html);

            const author = authorEntity(state, options);
            post.addAuthor(author);
            const tags = tagNames.map(name => tagEntity(state, name));
            for (const tag of tags) {
                post.addTag(tag);
            }
            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            context.sources.link(record.id, {type: 'author', id: author.dbId!});
            for (const tag of tags) {
                context.sources.link(record.id, {type: 'tag', id: tag.dbId!});
            }
            for (const id of images) {
                context.sources.link(id, {type: 'post', id: post.dbId!});
            }
            context.addLink(stringUtils.cleanURL(url.href), `/${post.get('slug')}/`);
        });
    });
}
