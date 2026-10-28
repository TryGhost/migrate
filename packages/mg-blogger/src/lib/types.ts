/* c8 ignore start */

/** A post from the Blogger API's `GET /blogger/v3/blogs/:blogId/posts`. */
export interface BloggerPost {
    kind?: string;
    id: string;
    blog?: {id?: string};
    /** RFC 3339, with the blog's UTC offset. */
    published?: string;
    updated?: string;
    url?: string;
    title?: string;
    content?: string;
    author?: {id?: string; displayName?: string; url?: string};
    labels?: string[];
    [key: string]: unknown;
}

/** Options applied when mapping stored Blogger posts. */
export interface BloggerOptions {
    /** Map only the posts of these stored blogs. Defaults to every stored blog. */
    blogID?: string[] | null;
    /** A tag added to every post. */
    addTag?: string | null;
    /** Use a leading image as the post's feature image. Defaults to `true`. */
    firstImageAsFeatured?: boolean;
    [key: string]: any;
}
/* c8 ignore stop */
