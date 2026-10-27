/* c8 ignore start */
import type {ContentOptions} from '@tryghost/mg-beehiiv';

/** A post from beehiiv's `GET /v2/publications/:id/posts`, with expanded web content. */
export interface BeehiivApiPost {
    id: string;
    title: string;
    subtitle?: string | null;
    authors?: string[];
    /** Unix time in seconds. */
    created?: number | null;
    status?: 'archived' | 'confirmed' | 'draft';
    /** Unix time in seconds; `null` for posts never published. */
    publish_date?: number | null;
    slug?: string;
    thumbnail_url?: string;
    web_url?: string;
    platform?: 'web' | 'email' | 'both';
    content_tags?: string[];
    meta_default_description?: string | null;
    meta_default_title?: string | null;
    web_targets?: {tier: 'free' | 'premium'; [key: string]: unknown}[];
    content?: {
        free?: {web?: string};
        premium?: {web?: string};
    };
    [key: string]: unknown;
}

export interface BeehiivApiOptions extends Omit<ContentOptions, 'url'> {
    /** Only posts published on or after this date. */
    postsAfter?: string | null;
    /** Only posts published on or before this date. */
    postsBefore?: string | null;
    /** A tag added to every post. */
    addTag?: string | null;
    [key: string]: any;
}
/* c8 ignore stop */
