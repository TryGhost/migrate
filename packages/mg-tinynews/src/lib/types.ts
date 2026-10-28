/* c8 ignore start */
/** One run of text inside a content block, or one image of an image block. */
export interface TinyNewsChild {
    content?: string;
    link?: string | null;
    style?: {bold?: boolean; italic?: boolean; underline?: boolean} | null;
    imageUrl?: string;
    imageAlt?: string | null;
    [field: string]: any;
}

/** One block of an article's `content`, such as a `text` paragraph, an `image` or an `embed`. */
export interface TinyNewsBlock {
    type?: string | null;
    style?: string | null;
    link?: string | null;
    html?: string | null;
    listType?: string;
    children?: TinyNewsChild[] | null;
    items?: {children?: TinyNewsChild[] | null}[] | null;
    [field: string]: any;
}

/** An author, as nested in an article or listed in the authors file. */
export interface TinyNewsAuthor {
    id?: number | string | null;
    first_names?: string | null;
    last_name?: string | null;
    email?: string | null;
    photoUrl?: string | null;
    translations?: ({bio?: string | null; title?: string | null} | null)[] | null;
    [field: string]: unknown;
}

/** The localised fields of an article or page. Only the first translation is migrated. */
export interface TinyNewsTranslation {
    published?: boolean | null;
    first_published_at?: string | null;
    last_published_at?: string | null;
    headline?: string | null;
    /** Content blocks, or an HTML string. */
    content?: TinyNewsBlock[] | string | null;
    created_by_email?: string | null;
    facebook_title?: string | null;
    facebook_description?: string | null;
    twitter_title?: string | null;
    twitter_description?: string | null;
    search_title?: string | null;
    search_description?: string | null;
    main_image?: {children?: TinyNewsChild[] | null} | null;
    [field: string]: unknown;
}

/** A Tiny News tag or category. */
export interface TinyNewsTag {
    slug?: string | null;
    title?: string | null;
    published?: boolean | null;
    tag_translations?: ({title?: string | null} | null)[] | null;
    [field: string]: unknown;
}

/** An item of the articles or pages file. */
export interface TinyNewsArticle {
    id?: number | string | null;
    slug?: string | null;
    live_url?: string | null;
    author?: ({author?: TinyNewsAuthor | null} | null)[] | null;
    translations?: (TinyNewsTranslation | null)[] | null;
    category?: TinyNewsTag | null;
    tags?: ({tag?: TinyNewsTag | null} | null)[] | null;
    [field: string]: unknown;
}

/** An item of `data.newsletter_editions` in the newsletters file. */
export interface TinyNewsNewsletter {
    id?: number | string | null;
    slug?: string | null;
    headline?: string | null;
    subheadline?: string | null;
    /** The edition's HTML. */
    content?: string | null;
    newsletter_published_at?: string | null;
    newsletter_created_at?: string | null;
    [field: string]: unknown;
}

/** The JSON files of one Tiny News export. Only `articles` is required. */
export interface TinyNewsInput {
    /** A JSON array of articles. */
    articles: string;
    /** A JSON array of pages. */
    pages?: string | null;
    /** A JSON object holding newsletter editions at `data.newsletter_editions`. */
    newsletters?: string | null;
    /** A JSON object holding authors at `data.authors`. */
    authors?: string | null;
}

export interface TinyNewsOptions {
    /** The live site's URL. It scopes the stable Ghost IDs and gives newsletters their old URLs. */
    url?: string;
    [key: string]: any;
}
/* c8 ignore stop */
