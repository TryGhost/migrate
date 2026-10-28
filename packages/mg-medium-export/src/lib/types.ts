/* c8 ignore start */
export interface MediumOptions {
    /** Add a tag with this name to every post. */
    addTag?: string | null;
    /** Add the `#medium` tag, and `#auto-feature-image` when an image before the content becomes the feature image. */
    addPlatformTag?: boolean;
    /** Use the Medium post URL as the canonical URL. */
    mediumAsCanonical?: boolean;
    /** The domain of generated author email addresses, such as `example.com`. */
    email?: string | false | null;
    [key: string]: any;
}

/** A tag or author as the content processors return it, with its Medium URL where it has one. */
export interface MediumRelation {
    url?: string;
    data: {name: string; slug?: string; [key: string]: any};
}

/** A post as `processPost()` returns it. */
export interface MediumPost {
    /** The post's Medium URL: its canonical link, or a draft's link. */
    url?: string;
    data: {
        title: string;
        slug: string;
        custom_excerpt: string;
        status: 'published' | 'draft';
        created_at: Date;
        updated_at: Date;
        published_at?: Date;
        canonical_url?: string;
        /** The Medium post ID, such as `6d912ac65341`. */
        comment_id: string;
        author?: MediumRelation;
        tags: MediumRelation[];
        html: string;
        feature_image?: string | null;
        feature_image_alt?: string | null;
        feature_image_caption?: string | null;
    };
}

/** A tag found by scraping a post page. */
export interface ScrapedTag {
    url?: string;
    name: string;
    slug?: string;
}

/** Web-scraped values for one post, after the runner's post processor. */
export interface ScrapedData {
    tags?: ScrapedTag[];
    author?: {url?: string; profile_image?: string};
    [field: string]: any;
}
/* c8 ignore stop */
