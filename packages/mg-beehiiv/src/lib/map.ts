import {
    MigrateContext,
    PostContext,
    AuthorContext,
    MappingState,
    RecordDataError,
    ghostId as coreGhostId
} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {slugify} from '@tryghost/string';
import {dateUtils, stringUtils, urlUtils} from '@tryghost/mg-utils';
import {processHTML, removeDuplicateFeatureImage} from './process.js';
import {namedAuthor, namedTag, publicFirst, rememberGhostUsers} from './entities.js';
import type {IdFor} from './entities.js';
import type {BeehiivOptions, BeehiivRow, ScrapedData} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

/** Ghost's limit on tags per post. */
const MAX_TAGS = 500;

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-beehiiv:1', site, kind, key);
}

/** The site URL without trailing slashes. */
function siteUrl(value: unknown): string {
    if (!urlUtils.httpUrl(value)) {
        throw new Error('beehiiv migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return (value as string).trim().replace(/\/+$/, '');
}

/** The slug in a beehiiv post URL (`/p/<slug>`), or the title's slug when there is no URL. */
export function createSlug({url, title}: {url?: string; title?: string}): string {
    if (url) {
        return slugify(url.split('/p/')[1]);
    }
    return slugify(title);
}

/** Make a beehiiv `uploads/` path an absolute image URL; other values are returned unchanged. */
export function fullImageURL(path: string): string {
    if (path.startsWith('uploads/') || path.startsWith('/uploads/')) {
        return `https://media.beehiiv.com/cdn-cgi/image/quality=100/${path.replace(/^\//, '')}`;
    }
    return path;
}

/** beehiiv writes zoneless timestamps such as `2023-01-18 21:25:27`; they are read as UTC. */
function rowDate(row: BeehiivRow): Date {
    const date = dateUtils.parseDate(row.created_at);
    if (!date) {
        throw new RecordDataError('Invalid beehiiv post date');
    }
    return date;
}

/** The post's audience, from `audience` or the newer `web_audiences` column. */
function audience(row: BeehiivRow): string {
    return row.audience || row.web_audiences || '';
}

function visibility(row: BeehiivRow): 'public' | 'members' | 'paid' {
    const value = audience(row);
    if (['premium', 'All premium subscribers', 'All paid subscribers'].includes(value)) {
        return 'paid';
    }
    return value === 'both' ? 'members' : 'public';
}

/** The content tags, `#beehiiv`, and a `#beehiiv-visibility-<audience>` tag. */
function rowTags(row: BeehiivRow): {name: string; slug: string}[] {
    const tags = (row.content_tags ?? '')
        .split(';')
        .map(name => name.trim())
        .filter(Boolean)
        .map(name => ({name, slug: slugify(name)}));
    tags.push({name: '#beehiiv', slug: 'hash-beehiiv'});
    const value = audience(row);
    if (value) {
        const slug = slugify(value);
        tags.push({name: `#beehiiv-visibility-${slug}`, slug: `hash-beehiiv-visibility-${slug}`});
    }
    return tags;
}

/**
 * Rebuild posts, tags and authors from the stored CSV rows. Content options apply here, so changing one needs no
 * new read of the export. Drafts are given the default author; published posts get their authors when scraped.
 * Rows without an `id` or with an invalid `created_at` are skipped with a `record:skipped` diagnostic.
 */
export async function map(
    options: BeehiivOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete beehiiv posts CSV before mapping.');
    }
    const resolved = {...options, url: siteUrl(options.url)};
    const site = urlUtils.canonicalSite(resolved.url);
    const idFor: IdFor = (kind, key) => ghostId(site, kind, key);
    const state = new MappingState(context, 'mg-beehiiv');
    return context.rebuildMappedContent(async () => {
        await rememberGhostUsers(state, services.ghostUsers);
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const row: BeehiivRow = JSON.parse(record.content);
            if (!record.key) {
                throw new RecordDataError('Row has no id');
            }
            const date = rowDate(row);
            const tags = rowTags(row).map(({name, slug}) => namedTag(name, idFor, slug));
            if (tags.length > MAX_TAGS) {
                throw new RecordDataError('Post exceeds Ghost tag relationship limit');
            }
            const post = new PostContext({lookupKey: record.key});
            post.ghostId = idFor('post', record.key);
            post.set('title', row.web_title ?? '');
            post.set('slug', createSlug({url: row.url, title: row.web_title}) || slugify(record.key));
            post.set('created_at', date);
            post.set('updated_at', date);
            post.set('published_at', date);
            post.set('type', 'post');
            post.set('status', row.status === 'confirmed' ? 'published' : 'draft');
            post.set('custom_excerpt', row.web_subtitle || null);
            post.set('visibility', visibility(row));
            const featureImage = row.thumbnail_url ? fullImageURL(row.thumbnail_url) : null;
            post.set('feature_image', featureImage);
            let html = processHTML({html: row.content_html ?? '', title: row.web_title, options: resolved});
            if (featureImage) {
                html = removeDuplicateFeatureImage({html, featureSrc: featureImage});
            }
            post.set('html', html);
            if (post.get('status') === 'draft') {
                const author = namedAuthor(state, resolved.defaultAuthorName || 'Author', idFor);
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
            if (row.url) {
                context.addLink(stringUtils.cleanURL(row.url), `/${post.get('slug')}/`);
            }
        });
    });
}

/**
 * Apply a scraped post page to a mapped post: schema fields such as `meta_description` and `og_title`, and the
 * page's authors, identified by slug as mapped authors are. The caller saves the post.
 */
export function applyScrapedData(post: PostContext, scraped: ScrapedData, options: BeehiivOptions): void {
    const site = urlUtils.canonicalSite(siteUrl(options.url));
    for (const [field, value] of Object.entries(scraped)) {
        if (
            field !== 'authors' &&
            field in post.schema.shape &&
            value !== null &&
            value !== undefined &&
            value !== ''
        ) {
            post.set(field, value);
        }
    }
    for (const {data} of scraped.authors ?? []) {
        const slug = data.slug || slugify(data.name) || 'author';
        const author = new AuthorContext({
            name: data.name,
            slug,
            email: data.email || `${slug}@example.com`
        });
        author.ghostId = ghostId(site, 'author', `slug:${slug}`);
        post.addAuthor(author);
    }
}
