/* c8 ignore start */
/** One parsed element of a Squarespace export: attributes are `@_name` and text beside children is `#text`. */
export type SquarespaceRecord = Record<string, any>;

/** Options for converting Squarespace HTML. */
export interface ContentOptions {
    /** CSS selectors for elements to remove, such as `'.ads, script[src*="adnetwork.com"]'`. */
    removeSelectors?: string | null;
}

export interface SquarespaceOptions extends ContentOptions {
    /** Import posts. Default `true`. */
    posts?: boolean;
    /** Import pages. Default `false`. */
    pages?: boolean;
    /** Import drafts. Default `true`. */
    drafts?: boolean;
    /** Import tags as well as categories. Default `true`. */
    tags?: boolean;
    /** A tag added to every post. */
    addTag?: string | null;
    [key: string]: any;
}

/** The author a `wp:author` record describes. */
export interface SquarespaceUser {
    login: string;
    data: {slug: string; name: string; email: string};
}

/** A category or tag on an item, with the URL it had on Squarespace. */
export interface SquarespaceTag {
    url: string;
    data: {slug?: string; name: string};
}
/* c8 ignore stop */
