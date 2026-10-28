import errors from '@tryghost/errors';
import type {SourceRecordInput} from '@tryghost/mg-context';
import {urlUtils, xmlUtils} from '@tryghost/mg-utils';
import {getText} from './processor.js';
import type {LibsynItem, XmlObject, XmlValue} from './types.js';

/** The site's URL. Throws unless it is an HTTP(S) URL. */
export function siteUrl(value: unknown): URL {
    const url = urlUtils.httpUrl(value);
    if (!url) {
        throw new errors.IncorrectUsageError({
            message: 'Libsyn migrations need the site URL (--url) as an HTTP or HTTPS URL.'
        });
    }
    return url;
}

/** The site's RSS feed with Libsyn's item IDs, such as `https://example.com/rss/?include-libsyn-metadata=true`. */
export function feedUrl(url: string): string {
    return `${siteUrl(url).href.replace(/\/+$/, '')}/rss/?include-libsyn-metadata=true`;
}

/** The source key of an item: its GUID, or its link when it has none. `null` when it has neither. */
export function itemKey(item: LibsynItem): string | null {
    const guid = getText(item.guid).trim();
    const link = getText(item.link).trim();
    return guid ? `guid:${guid}` : link ? `link:${link}` : null;
}

/**
 * Fetch the site's feed and yield its records one at a time while the response streams: an `item` record for each
 * `<item>`, keyed by `itemKey()`, then one `channel` record keyed `channel` holding every other child of `<channel>`.
 * Nothing is stored or cached.
 */
export async function* parse(url: string): AsyncGenerator<SourceRecordInput> {
    const feed = feedUrl(url);
    let response: Response;
    try {
        response = await fetch(feed);
    } catch (error) {
        throw new errors.InternalServerError({message: `Could not fetch the Libsyn feed ${feed}`, err: error});
    }
    if (!response.ok) {
        throw new errors.InternalServerError({
            message: `Could not fetch the Libsyn feed ${feed}: ${response.status} ${response.statusText}`
        });
    }

    const channel: XmlObject = {};
    let found = false;
    const body = (response.body ?? []) as AsyncIterable<Uint8Array>;
    for await (const {path, value, line, column} of xmlUtils.streamXmlRecords(body, {
        paths: ['rss/channel/*'],
        filename: feed
    })) {
        found = true;
        const name = path.slice(path.lastIndexOf('/') + 1);
        if (name === 'item') {
            yield {
                kind: 'item',
                key: itemKey(value),
                content: JSON.stringify(value),
                format: 'json',
                metadata: {line, column}
            };
        } else {
            const existing = channel[name];
            channel[name] = existing === undefined ? value : ([] as XmlValue[]).concat(existing, value);
        }
    }
    if (!found) {
        throw new errors.InternalServerError({message: `${feed} is not an RSS feed with a channel`});
    }
    yield {kind: 'channel', key: 'channel', content: JSON.stringify(channel), format: 'json', metadata: {feed}};
}
