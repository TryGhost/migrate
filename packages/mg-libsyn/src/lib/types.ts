/* c8 ignore start */

/**
 * A parsed XML value: an element's text, or an object of its attributes (`@_name`), children and `#text`. A repeated
 * element is an array.
 */
export type XmlValue = string | XmlObject | XmlValue[];

export interface XmlObject {
    [name: string]: XmlValue | undefined;
}

/** One `<item>` of a Libsyn RSS feed, as parsed by `xmlUtils.streamXmlRecords()`. */
export interface LibsynItem extends XmlObject {
    title?: XmlValue;
    'itunes:title'?: XmlValue;
    /** RFC 2822, such as `Mon, 10 Aug 2020 07:00:00 +0000`. */
    pubDate?: XmlValue;
    guid?: XmlValue;
    /** The episode's audio file. */
    link?: XmlValue;
    'itunes:image'?: XmlValue;
    /** The episode's HTML show notes. */
    description?: XmlValue;
    'content:encoded'?: XmlValue;
    enclosure?: XmlValue;
    /** `hh:mm:ss`, `mm:ss` or whole minutes. */
    'itunes:duration'?: XmlValue;
    'libsyn:itemId'?: XmlValue;
    /** Comma-separated. */
    'itunes:keywords'?: XmlValue;
}

/** Every child of the feed's `<channel>` except its items. */
export interface LibsynChannel extends XmlObject {
    title?: XmlValue;
    'itunes:owner'?: XmlValue;
    'itunes:author'?: XmlValue;
    'itunes:category'?: XmlValue;
    'itunes:image'?: XmlValue;
    image?: XmlValue;
}

/** Options applied when mapping a stored Libsyn feed. */
export interface LibsynOptions {
    /** The Libsyn site's URL, such as `https://example.libsyn.com`. Required. */
    url?: string | null;
    /** A tag added to every post, before its other tags. */
    addTag?: string | null;
    /** Add the feed's iTunes categories and subcategories as tags. Defaults to `true`. */
    useFeedCategories?: boolean;
    /** Add each item's `itunes:keywords` as tags. Defaults to `true`. */
    useItemKeywords?: boolean;
    /** Use Libsyn's embedded player. When `false`, each post starts with a Ghost audio card. Defaults to `true`. */
    useEmbed?: boolean;
    [key: string]: any;
}
/* c8 ignore stop */
