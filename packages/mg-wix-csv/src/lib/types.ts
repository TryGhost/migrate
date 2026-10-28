/* c8 ignore start */
/** One row of a Wix blog posts CSV export. Every value is the text of its CSV cell. */
export interface WixRow {
    ID?: string;
    Title?: string;
    Slug?: string;
    Author?: string;
    Excerpt?: string;
    Featured?: string;
    Pinned?: string;
    'Main Category'?: string;
    Categories?: string;
    Tags?: string;
    'Cover Image'?: string;
    'Plain Content'?: string;
    'Rich Content'?: string;
    'Published Date'?: string;
    'Last Published Date'?: string;
    'Post Page URL'?: string;
    'Internal ID'?: string;
    [column: string]: string | undefined;
}

/** Mapping options. Every one applies in `map()`, so changing one needs no new read of the CSV. */
export interface WixOptions {
    /** The live site URL. `Post Page URL` paths are relative to it, and it scopes stable Ghost IDs. */
    url?: string | null;
    /** The author of rows without an `Author`. Defaults to `Author`. */
    defaultAuthorName?: string | null;
    /** Tag posts with their `Main Category`. Defaults to `true`. */
    includeMainCategory?: boolean;
    /** Tag posts with their `Categories`. Defaults to `true`. */
    includeCategories?: boolean;
    /** Tag posts with their `Tags`. Defaults to `true`. */
    includeTags?: boolean;
}
/* c8 ignore stop */
