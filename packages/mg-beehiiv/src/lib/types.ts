/* c8 ignore start */
/** Options for converting beehiiv HTML. `processHTML()` and `processWebHTML()` read them as given, without defaults. */
export interface ContentOptions {
    /** The live site URL. In CSV email HTML, links lose their tracking parameters and `<url>/subscribe` links are rewritten. */
    url?: string | null;
    /** Where subscribe links point. */
    subscribeLink?: string | null;
    /** Keep comment links, pointing them at `commentLink`. `false` removes them. */
    comments?: boolean;
    /** Where comment links point. */
    commentLink?: string | null;
}

/** One row of a beehiiv posts CSV export. Every value is the text of its CSV cell. */
export interface BeehiivRow {
    id?: string;
    web_title?: string;
    status?: string;
    audience?: string;
    web_audiences?: string;
    content_tags?: string;
    url?: string;
    web_subtitle?: string;
    content_html?: string;
    thumbnail_url?: string;
    created_at?: string;
    [column: string]: string | undefined;
}

export interface BeehiivOptions extends ContentOptions {
    /** The beehiiv site URL, such as `https://example.beehiiv.com`. Required. */
    url: string;
    /** The author of drafts, and of scraped posts whose page lists no author. Defaults to `Author`. */
    defaultAuthorName?: string | null;
    [key: string]: any;
}

/** An author found by scraping a post page, as `{data}`. */
export interface ScrapedRelation {
    url?: string;
    data: {name: string; slug?: string; email?: string; [key: string]: any};
}

/** Web-scraped values for one post, after the runner's post processor. */
export interface ScrapedData {
    authors?: ScrapedRelation[];
    [field: string]: any;
}
/* c8 ignore stop */
