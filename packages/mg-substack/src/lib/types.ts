/* c8 ignore start */
/** One row of a Substack export's `posts.csv`. Every value is the text of its CSV cell. */
export interface SubstackRow {
    post_id: string;
    post_date?: string;
    is_published?: string;
    email_sent_at?: string;
    type?: string;
    audience?: string;
    title?: string;
    subtitle?: string;
    podcast_url?: string;
    [column: string]: string | undefined;
}

/** Options for converting HTML; `processContent()` reads them as given, without defaults. */
export interface ContentOptions {
    /** Use the scraped `og:image` as the feature image. */
    useMetaImage?: boolean;
    /** Use the first image in the content as the feature image when there is none. */
    useFirstImage?: boolean;
    /** Where `/subscribe` links and buttons point. */
    subscribeLink?: string | null;
    /** Remove subscribe buttons, links and forms instead. */
    noSubscribeButtons?: boolean;
    /** Keep comment buttons. */
    comments?: boolean;
    /** Where comment buttons point. */
    commentLink?: string | null;
}

export interface SubstackOptions extends ContentOptions {
    /** The Substack site URL, such as `https://example.substack.com`. Required. */
    url: string;
    posts?: boolean;
    drafts?: boolean;
    pages?: boolean;
    podcasts?: boolean;
    threads?: boolean;
    postsBefore?: string | null;
    postsAfter?: string | null;
    /** Author every post as this email address. Ignored when `useMetaAuthor` is set. */
    email?: string | null;
    /** Take authors from each post's scraped ld+json instead of `email`. */
    useMetaAuthor?: boolean;
    addTag?: string | null;
    addPlatformTag?: boolean;
    addTypeTag?: boolean;
    addAccessTag?: boolean;
    [key: string]: any;
}

/** The post shape `processContent()` reads and updates. */
export interface ContentPost {
    /** The podcast URL from `posts.csv`, if any. */
    substackPodcastURL?: string | false;
    data: {
        html?: string | null;
        title?: string;
        slug?: string;
        og_image?: string;
        podcast_audio_src?: string;
        feature_image?: string;
        feature_image_caption?: string;
        [key: string]: any;
    };
}

/** A tag or author found by scraping a post, as `{url, data}`. */
export interface ScrapedRelation {
    url: string;
    data: {name: string; slug: string; [key: string]: any};
}

/** Web-scraped values for one post, after the runner's post processor. */
export interface ScrapedData {
    tags?: ScrapedRelation[];
    authors?: ScrapedRelation[];
    og_image?: string;
    podcast_audio_src?: string;
    [field: string]: any;
}
/* c8 ignore stop */
