/* c8 ignore start */
/** One item in a Curated issue category: a `Text` note or a `Link` to another page. */
export interface CuratedItem {
    type?: string;
    identifier?: string;
    title?: string;
    /** The item's HTML. */
    description?: string;
    description_markdown?: string;
    /** A `Text` item's HTML footer, such as its source. */
    footer?: string;
    url?: string;
    /** The domain a `Link` item shows under its description. */
    url_domain?: string;
    /** The item's image file, stored beside the issue's JSON in the export. */
    image_original_filename?: string;
    image_extra_large_filename?: string;
    image_medium_filename?: string;
    [field: string]: unknown;
}

/** A Curated issue, as stored in `data-export/issues/published/<number>/<number>.json`. */
export interface CuratedIssue {
    number?: number;
    title?: string;
    summary?: string;
    url?: string;
    publication_status?: string;
    published_at?: string;
    updated_at?: string;
    categories?: {code?: string; name?: string; items?: CuratedItem[]}[];
    [field: string]: unknown;
}

export interface CuratedOptions {
    /** The name of the author of every post. Defaults to `Example User`. */
    name?: string | false | null;
    /** The email address of the author of every post. Defaults to `<author slug>@example.com`. */
    email?: string | false | null;
    /** A tag added to every post, before `#curated`. */
    tag?: string | false | null;
    [key: string]: any;
}

/** Where `ingest()` writes the export's images: an `@tryghost/mg-fs-utils` `FileCache`. */
export interface ImageCache {
    resolveImageFileName(filename: string): {filename: string; storagePath: string; outputPath: string};
    writeContentFile(
        data: Buffer,
        options: {filename: string; storagePath: string; outputPath: string; optimize?: boolean}
    ): Promise<string>;
}
/* c8 ignore stop */
