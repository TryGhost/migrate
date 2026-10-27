import {MigrateContext, PostContext, MappingState, RecordDataError, ghostId as coreGhostId} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import type {GhostUser} from '@tryghost/mg-ghost-authors';
import {
    namedAuthor,
    namedTag,
    processWebHTML,
    publicFirst,
    rememberGhostUsers,
    removeDuplicateFeatureImage
} from '@tryghost/mg-beehiiv';
import type {IdFor} from '@tryghost/mg-beehiiv';
import {slugify} from '@tryghost/string';
import {stringUtils} from '@tryghost/mg-utils';
import {sourcePublication} from './ingest.js';
import type {BeehiivApiOptions, BeehiivApiPost} from './types.js';

export type {MappingSummary};

export interface MappingServices {
    /** Existing Ghost users; an author whose placeholder email matches one keeps that user's ID. */
    ghostUsers?: Iterable<GhostUser> | AsyncIterable<GhostUser>;
}

/** Ghost relationship limits for one post. */
const MAX_RELATIONS = 500;

export function ghostId(publication: string, kind: string, key: string): string {
    return coreGhostId('mg-beehiiv-api:1', publication, kind, key);
}

function visibility(webTargets: BeehiivApiPost['web_targets'] = []): 'public' | 'members' | 'paid' {
    const tiers = new Set(webTargets.map(target => target.tier));
    if (tiers.has('free') && tiers.has('premium')) {
        return 'members';
    }
    return tiers.has('premium') ? 'paid' : 'public';
}

function status(item: BeehiivApiPost): 'published' | 'draft' {
    return item.platform !== 'email' && item.status === 'confirmed' ? 'published' : 'draft';
}

/** A Unix time in seconds as a date, or `null` when there is none. */
function unixDate(value: unknown): Date | null {
    return typeof value === 'number' && Number.isFinite(value) ? new Date(value * 1000) : null;
}

/**
 * `--postsAfter` and `--postsBefore` compare the publish date with the start of each day, as they always have.
 * Posts never published have no publish date: `--postsAfter` leaves them out and `--postsBefore` keeps them.
 */
function inDateRange(item: BeehiivApiPost, after: number | null, before: number | null): boolean {
    const published = item.publish_date as number;
    return !((after !== null && !(published >= after)) || (before !== null && !(published <= before)));
}

/** A date option as Unix seconds, or `null` when it is not set. */
function dayStart(name: string, value: string | null | undefined): number | null {
    if (!value) {
        return null;
    }
    const time = Date.parse(value);
    if (!Number.isFinite(time)) {
        throw new Error(`Invalid ${name} date: ${value}`);
    }
    return time / 1000;
}

/**
 * Rebuild posts, tags and authors from the stored API posts. The date filters, `addTag` and the content options
 * apply here, so changing them needs no new fetch. Posts without an ID or any valid date are skipped with a
 * `record:skipped` diagnostic.
 */
export async function map(
    options: BeehiivApiOptions,
    context: MigrateContext,
    services: MappingServices = {}
): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest complete beehiiv API source data before mapping.');
    }
    const publication = sourcePublication(context);
    const after = dayStart('postsAfter', options.postsAfter);
    const before = dayStart('postsBefore', options.postsBefore);
    const addTag = options.addTag?.trim();
    const idFor: IdFor = (kind, key) => ghostId(publication, kind, key);
    const state = new MappingState(context, 'mg-beehiiv-api');
    return context.rebuildMappedContent(async () => {
        await rememberGhostUsers(state, services.ghostUsers);
        return context.mapRecords(context.sources.records({kind: 'post'}), async record => {
            const item: BeehiivApiPost = JSON.parse(record.content);
            if (!inDateRange(item, after, before)) {
                return false;
            }
            if (!record.key) {
                throw new RecordDataError('Post has no ID');
            }
            const published = unixDate(item.publish_date);
            const created = unixDate(item.created) ?? published;
            if (!created) {
                throw new RecordDataError('Invalid beehiiv post dates');
            }
            const authors = (item.authors ?? []).filter(name => typeof name === 'string' && name.trim());
            const tags = (item.content_tags ?? [])
                .filter(name => typeof name === 'string' && name.trim())
                .map(name => namedTag(name.trim(), idFor));
            tags.push(namedTag('#beehiiv', idFor, 'hash-beehiiv'));
            if (addTag) {
                tags.push(namedTag(addTag, idFor));
            }
            if (authors.length > MAX_RELATIONS || tags.length > MAX_RELATIONS) {
                throw new RecordDataError('Post exceeds Ghost author/tag relationship limits');
            }
            const post = new PostContext({lookupKey: record.key});
            post.ghostId = idFor('post', record.key);
            post.set('title', item.title ?? '');
            post.set('slug', item.slug || slugify(item.title) || slugify(record.key));
            post.set('comment_id', record.key);
            post.set('created_at', created);
            // Posts never published are dated when they were created.
            post.set('published_at', published ?? created);
            post.set('updated_at', published ?? created);
            post.set('type', 'post');
            post.set('status', status(item));
            post.set('custom_excerpt', item.subtitle || null);
            post.set('visibility', visibility(item.web_targets));
            post.set('feature_image', item.thumbnail_url || null);
            post.set('og_title', item.meta_default_title || null);
            post.set('og_description', item.meta_default_description || null);
            let html = processWebHTML({
                html: item.content?.premium?.web ?? item.content?.free?.web,
                url: item.web_url,
                options
            });
            if (item.thumbnail_url) {
                html = removeDuplicateFeatureImage({html, featureSrc: item.thumbnail_url});
            }
            post.set('html', html);
            for (const name of authors) {
                const author = namedAuthor(state, name, idFor);
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
            if (item.web_url && URL.canParse(item.web_url)) {
                context.addLink(stringUtils.cleanURL(item.web_url), `/${post.get('slug')}/`);
            }
        });
    });
}
