/* c8 ignore start */

/** A post from the Letterdrop API's `POST /api/v1/posts`. */
export interface LetterdropPost {
    id: string;
    title?: string | null;
    subtitle?: string | null;
    /** The post's HTML. */
    body?: string | null;
    author?: {name?: string | null; avatar?: string | null} | null;
    tags?: string[] | null;
    coverImage?: string | null;
    slug?: string | null;
    /** The post's URL on the live site, such as `https://example.com/p/my-post`. */
    url?: string | null;
    metaTitle?: string | null;
    metaDescription?: string | null;
    /** ISO 8601. */
    publishedOn?: string | null;
    updated?: string | null;
    [key: string]: unknown;
}

/** Options applied when mapping stored Letterdrop posts. */
export interface LetterdropOptions {
    /** The live site's URL, such as `https://example.com`. Required. */
    url?: string | null;
    /** A tag added to every post as its primary tag. */
    addPrimaryTag?: string | null;
    /** Where subscribe embeds and links to the site's plans, subscribe and promo pages point. Defaults to `#/portal/signup`. */
    subscribeLink?: string | null;
    /** The text of the buttons that replace subscribe embeds. Defaults to `Subscribe`. */
    subscribeText?: string | null;
    [key: string]: any;
}
/* c8 ignore stop */
