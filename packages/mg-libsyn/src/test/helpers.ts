import {readFileSync} from 'node:fs';
import nock from 'nock';
import {MigrateContext} from '@tryghost/mg-context';
import {itemKey} from '../lib/fetch.js';
import type {LibsynChannel, LibsynItem} from '../lib/types.js';

export const SITE = 'https://example.com';

const fixtures = new URL('../../src/test/fixtures/', import.meta.url);

/** The original feed fixture. */
export const FEED = readFileSync(new URL('feed.xml', fixtures), 'utf8');

const fixtureData = JSON.parse(readFileSync(new URL('feed.json', fixtures), 'utf8'));

/** The fixture's two items, as `xmlUtils.parseXml()` reads them. */
export const fixtureItems = (): LibsynItem[] => structuredClone(fixtureData.rss.channel.item);

/** The fixture's channel without its items or the whitespace between them. */
export function fixtureChannel(): LibsynChannel {
    const {item: _item, '#text': _text, ...channel} = structuredClone(fixtureData.rss.channel);
    return channel;
}

const cdata = (value: string) => `<![CDATA[${value}]]>`;

/** An `<item>` with every field the mapper reads, overridden by `values`; a `null` value leaves the element out. */
export function itemXml(id: string, values: Record<string, string | null> = {}): string {
    const fields: Record<string, string | null> = {
        title: `Episode ${id}`,
        pubDate: 'Mon, 10 Aug 2020 07:00:00 +0000',
        guid: `<guid isPermaLink="false">${cdata(`guid-${id}`)}</guid>`,
        link: cdata(`https://traffic.libsyn.com/secure/exampleshow/episode-${id}.mp3`),
        description: cdata(`<p>Notes ${id}</p>`),
        'itunes:duration': '10:00',
        'libsyn:itemId': id,
        'itunes:keywords': 'news',
        ...values
    };
    const elements = Object.entries(fields)
        .filter(([, value]) => value !== null)
        .map(([name, value]) => (value!.startsWith(`<${name}`) ? value : `<${name}>${value}</${name}>`));
    return `<item>${elements.join('')}</item>`;
}

/** A feed with the fixture's channel metadata, or `channel` in its place, and these items. */
export function feedXml(items: string[], channel?: string): string {
    const metadata =
        channel ??
        `<title>Example Show</title>
        <itunes:category text="Business"><itunes:category text="Careers"/></itunes:category>
        <itunes:image href="https://example.com/cover.jpg"/>
        <itunes:owner><itunes:name>Example User</itunes:name><itunes:email>person@example.com</itunes:email></itunes:owner>`;
    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:libsyn="http://libsyn.com/libsyn-rss-spec">
    <channel>${metadata}${items.join('\n')}</channel>
</rss>`;
}

/** Serve `body` as the site's feed and return the requested URLs. */
export function serve(body: string, status = 200, site = SITE): string[] {
    const requests: string[] = [];
    nock(site)
        .get('/rss/')
        .query({'include-libsyn-metadata': 'true'})
        .reply((request: Request) => {
            requests.push(request.url);
            return [status, body, {'Content-Type': 'application/rss+xml'}];
        });
    return requests;
}

export async function memoryContext(): Promise<MigrateContext> {
    const context = new MigrateContext({storage: 'memory'});
    await context.init();
    return context;
}

/** A context holding the channel and items as completed source data, without fetching. */
export async function stored(
    items: LibsynItem[],
    channel: LibsynChannel | null = fixtureChannel()
): Promise<MigrateContext> {
    const context = await memoryContext();
    await context.sources.ingest({metadata: {adapter: 'libsyn'}}, async stage => {
        await stage.write(
            items.map(item => ({kind: 'item', key: itemKey(item), content: JSON.stringify(item), format: 'json'}))
        );
        if (channel) {
            stage.put({kind: 'channel', key: 'channel', content: JSON.stringify(channel), format: 'json'});
        }
    });
    return context;
}

export function events(context: MigrateContext, type: string): {details: Record<string, any>}[] {
    return context.getMigrationReport().events.filter(event => event.type === type) as any[];
}

export async function all<T>(items: AsyncIterable<T>): Promise<T[]> {
    const result = [];
    for await (const item of items) {
        result.push(item);
    }
    return result;
}
