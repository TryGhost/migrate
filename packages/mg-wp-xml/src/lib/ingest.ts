import type {MigrateContext, SourceRecordInput} from '@tryghost/mg-context';
import {dateUtils, xmlUtils} from '@tryghost/mg-utils';
import type {WordPressInput} from './input.js';
import {inspectSource} from './input.js';
import {getText} from './process.js';

export function canonicalSite(value: string): string {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('WordPress site URLs must use HTTP or HTTPS.');
    }
    return url.host.toLowerCase() + url.pathname.replace(/\/+$/, '');
}

export function sourceUrl(value: string, base: string): string | undefined {
    if (!value.trim()) {
        return undefined;
    }
    try {
        const url = new URL(value, base);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
    } catch {
        return undefined;
    }
}

function revision(item: Record<string, any>): number | undefined {
    for (const field of ['wp:post_modified_gmt', 'wp:post_modified']) {
        const date = dateUtils.parseDate(getText(item[field]));
        if (date) {
            return date.getTime();
        }
    }
    return undefined;
}

/** Yield the parser's original channel records; callers choose how to store them. */
export async function* parse(input: string | WordPressInput): AsyncGenerator<SourceRecordInput> {
    const source = typeof input === 'string' ? await inspectSource(input) : input;
    let site: string | undefined;
    for (const file of source.files) {
        let channelUrl = '';
        let blogUrl = '';
        let index = 0;
        for await (const record of xmlUtils.streamXmlRecords(file.path, {paths: ['rss/channel/*']})) {
            const name = record.path.split('/').pop()!;
            const value = record.value;
            let kind = 'channel';
            let key: string | undefined = `${file.name}:${name}:${index++}`;
            if (name === 'item') {
                kind = 'item';
                const id = getText(value['wp:post_id']).trim();
                const url = sourceUrl(getText(value.link || value['wp:attachment_url']), blogUrl || channelUrl);
                key = id ? `id:${id}` : url ? `url:${url}` : undefined;
            } else if (name === 'wp:author') {
                kind = 'author';
                const id = getText(value['wp:author_id']).trim();
                const login = getText(value['wp:author_login']).trim();
                key = id ? `id:${id}` : login ? `login:${login}` : undefined;
            } else if (['wp:category', 'wp:tag', 'wp:term'].includes(name)) {
                kind = 'term';
                const taxonomy =
                    name === 'wp:category'
                        ? 'category'
                        : name === 'wp:tag'
                          ? 'post_tag'
                          : getText(value['wp:term_taxonomy']);
                const id = getText(value['wp:term_id']).trim();
                const slug = getText(value['wp:category_nicename'] || value['wp:tag_slug'] || value['wp:term_slug']);
                key = id ? `${taxonomy}:id:${id}` : slug ? `${taxonomy}:slug:${slug}` : undefined;
            } else if (name === 'link') {
                channelUrl = getText(value);
            } else if (name === 'wp:base_blog_url') {
                blogUrl = getText(value);
            }
            yield {
                kind,
                key,
                content: JSON.stringify(value),
                format: 'json',
                metadata: {file: file.name, name, line: record.line, column: record.column}
            };
        }
        const url = blogUrl || channelUrl;
        if (!url) {
            throw new Error(`${file.name}: Missing WordPress channel site URL`);
        }
        const identity = canonicalSite(url);
        if (site && site !== identity) {
            throw new Error(
                `${file.name}: Exports from different WordPress sites cannot be combined (${site}, ${identity})`
            );
        }
        site = identity;
    }
}

/** Ingest only when requested by the caller; replacement preserves completed input on failure. */
export async function ingest(
    input: string | WordPressInput,
    context: MigrateContext,
    {replace = false}: {replace?: boolean} = {}
): Promise<void> {
    await context.sources.ingest({replace, metadata: {adapter: 'wp-xml'}}, async stage => {
        for await (const record of parse(input)) {
            const {previous, replaced} = stage.reconcile(record, {
                // Items keep their newest revision; everything else keeps its first definition.
                choose: (existing, incoming) => {
                    const modified = incoming.kind === 'item' ? revision(JSON.parse(incoming.content)) : undefined;
                    const earlier = incoming.kind === 'item' ? revision(JSON.parse(existing.content)) : undefined;
                    return modified !== undefined && earlier !== undefined && modified > earlier ? 'replace' : 'keep';
                },
                reportIdentical: record.kind === 'item'
            });
            if (previous && !replaced && record.kind === 'author' && previous.content !== record.content) {
                stage.put({...record, key: undefined, metadata: {...record.metadata, canonicalKey: record.key!}});
            }
        }
    });
}
