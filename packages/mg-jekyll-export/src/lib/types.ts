/* c8 ignore start */
export interface JekyllOptions {
    /** The live site's URL. It makes root-relative links absolute, gives posts their old URLs and scopes Ghost IDs. */
    url?: string;
    /** The domain of authors' placeholder emails, such as `example.com`. */
    email?: string | false | null;
    /** Comma-separated tag names added to every post. */
    addTags?: string | null;
    /** The live site's dated permalink structure, kept in the paths links are rewritten to. */
    datedPermalinks?: 'none' | '/yyyy/mm/' | '/yyyy/mm/dd/' | string | null;
    [key: string]: any;
}

export interface JekyllTag {
    name: string;
    slug: string;
}

/** One Jekyll post, read from its path, front matter and body. */
export interface JekyllPost {
    /** The slug in the post's live URL: front matter `basename`, or the file name without its date and extension. */
    sourceSlug: string;
    /** The Ghost slug: the slugified `sourceSlug`. */
    slug: string;
    title: string;
    status: 'published' | 'draft';
    /** The front matter date, or the date in the file name; `null` when neither is a valid date. */
    date: Date | null;
    html: string;
    /** The front matter `author` names. */
    authors: string[];
    /** Tags in order: public tags, then internal `#` tags. */
    tags: JekyllTag[];
}
/* c8 ignore stop */
