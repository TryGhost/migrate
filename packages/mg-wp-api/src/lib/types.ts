/* c8 ignore start */
// Interfaces only: nothing here runs.

export type WpApiRecord = Record<string, any>;

/** The legacy `{url, data}` author shape shared with mg-wp-xml and mg-ghost-authors. */
export interface LegacyAuthor {
    url?: string;
    data: Record<string, any>;
}

export interface LegacyTag {
    url: string;
    data: {slug: string; name: string};
}

export interface MappedPost {
    url: string;
    data: Record<string, any>;
}

export interface WpApiOptions {
    url?: string;
    tags?: boolean;
    addTag?: string | null;
    excerpt?: boolean;
    excerptSelector?: string | false | null;
    featureImage?: string;
    featureImageCaption?: boolean;
    removeDuplicateFeatureImage?: boolean;
    customTaxonomies?: string[] | null;
    cpt?: string[] | null;
    rawHtml?: boolean;
    removeSelectors?: string | null;
    convertLibsynEmbed?: boolean;
    skipShortcodes?: boolean;
    scrape?: string[];
    attachments?: any[] | null;
    posts?: boolean;
    pages?: boolean;
    drafts?: boolean;
    maxPosts?: number;
    onlyURLs?: string | null;
    datedPermalinks?: string;
    /** Path to a WordPress XML export of Co-Authors Plus guest authors. */
    coAuthors?: string | null;
    /** Guest author profiles read from `coAuthors`, keyed by their `cap-` slug. */
    coAuthorProfiles?: Map<string, LegacyAuthor> | null;
    [key: string]: any;
}
/* c8 ignore stop */
