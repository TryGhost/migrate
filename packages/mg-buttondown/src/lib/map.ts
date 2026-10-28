import {MigrateContext, PostContext, TagContext, RecordDataError, ghostId as coreGhostId} from '@tryghost/mg-context';
import type {MappingSummary} from '@tryghost/mg-context';
import {dateUtils, stringUtils, urlUtils} from '@tryghost/mg-utils';
import {processHTML} from './process.js';
import type {ButtondownEmail, ButtondownOptions} from './types.js';

export type {MappingSummary};

export function ghostId(site: string, kind: string, key: string): string {
    return coreGhostId('mg-buttondown:1', site, kind, key);
}

/** The site URL without trailing slashes. */
function siteUrl(value: unknown): string {
    if (!urlUtils.httpUrl(value)) {
        throw new Error('Buttondown migrations need the site URL (--url) as an HTTP or HTTPS URL.');
    }
    return (value as string).trim().replace(/\/+$/, '');
}

/** Buttondown writes `2023-01-02 16:55:00+00:00`; a zoneless timestamp is read as UTC. */
function publishDate(email: ButtondownEmail): Date {
    const date = dateUtils.parseDate(email.publish_date);
    if (!date) {
        throw new RecordDataError('Invalid Buttondown publish date');
    }
    return date;
}

/**
 * Rebuild posts and tags from the stored emails and their bodies. Each email is a published, public post tagged
 * `#buttondown`, whose HTML is converted from its `emails/<slug>.md` body. Emails without an `id` or a `slug`, or
 * with an invalid `publish_date`, are skipped with a `record:skipped` diagnostic. An email without a body is
 * imported with empty HTML and an `operation:warning` diagnostic.
 */
export async function map(options: ButtondownOptions, context: MigrateContext): Promise<MappingSummary> {
    if (!context.sources.hasCompletedIngestion) {
        throw new Error('Ingest a complete Buttondown export before mapping.');
    }
    const url = siteUrl(options.url);
    const site = urlUtils.canonicalSite(url);
    return context.rebuildMappedContent(() =>
        context.mapRecords(context.sources.records({kind: 'email'}), async record => {
            if (!record.key) {
                throw new RecordDataError('Email has no id');
            }
            const email: ButtondownEmail = JSON.parse(record.content);
            const slug = String(email.slug ?? '').trim();
            if (!slug) {
                throw new RecordDataError('Email has no slug');
            }
            const date = publishDate(email);
            const bodyKey = `emails/${slug}.md`;
            const body = context.sources.get('body', bodyKey);
            if (!body) {
                context.recordDiagnostic(
                    'operation:warning',
                    {...record.metadata, reason: 'No body file in the export for this email', body: bodyKey},
                    record.id
                );
            }

            const post = new PostContext({lookupKey: record.key});
            post.ghostId = ghostId(site, 'post', record.key);
            post.set('title', String(email.subject ?? ''));
            post.set('slug', slug);
            post.set('created_at', date);
            post.set('updated_at', date);
            post.set('published_at', date);
            post.set('type', 'post');
            post.set('status', 'published');
            post.set('visibility', 'public');
            post.set('custom_excerpt', null);
            // Trimmed here, so Ghost's schema does not report a change for every post.
            post.set('html', processHTML(body?.content ?? '').trim());

            const tag = new TagContext({name: '#buttondown', slug: 'hash-buttondown'});
            tag.ghostId = ghostId(site, 'tag', 'hash-buttondown');
            tag.save(context.db);
            post.addTag(tag);
            context.sources.link(record.id, {type: 'tag', id: tag.dbId!});

            post.save(context.db);
            context.sources.link(record.id, {type: 'post', id: post.dbId!});
            if (body) {
                context.sources.link(body.id, {type: 'post', id: post.dbId!});
            }
            context.addLink(stringUtils.cleanURL(`${url}/${slug}`), `/${post.get('slug')}/`);
        })
    );
}
