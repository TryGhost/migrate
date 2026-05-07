declare module '@tryghost/admin-api' {
    export interface BrowseOptions {
        limit?: number | string;
        page?: number;
        include?: string;
        filter?: string | null;
        fields?: string;
        formats?: string;
    }

    export interface PaginationMeta {
        page: number;
        limit: number;
        pages: number;
        total: number;
        next: number | null;
        prev: number | null;
    }

    export interface BrowseResponse<T> extends Array<T> {
        meta?: {
            pagination: PaginationMeta;
        };
    }

    export interface GhostAdminAPIOptions {
        url: string;
        key: string;
        version: string;
    }

    export interface User {
        id: string;
        slug: string;
        name: string;
        email?: string;
        bio?: string;
        profile_image?: string;
        website?: string;
        roles?: Array<{name: string} | string>;
        url?: string;
    }

    export interface Tag {
        id: string;
        slug: string;
        name: string;
        description?: string | null;
        visibility?: string;
        url?: string;
    }

    export interface Post {
        id: string;
        slug: string;
        title: string;
        url: string;
        html?: string;
        type?: string;
        authors?: User[];
        tags?: Tag[];
        primary_author?: User;
        primary_tag?: Tag;
        tiers?: unknown;
        post_revisions?: unknown;
        count?: unknown;
        [key: string]: unknown;
    }

    export interface UsersAPI {
        browse(options?: BrowseOptions): Promise<BrowseResponse<User>>;
    }

    export interface PostsAPI {
        browse(options?: BrowseOptions, fetchOptions?: {source?: string}): Promise<BrowseResponse<Post>>;
    }

    export interface PagesAPI {
        browse(options?: BrowseOptions, fetchOptions?: {source?: string}): Promise<BrowseResponse<Post>>;
    }

    class GhostAdminAPI {
        constructor(options: GhostAdminAPIOptions);
        users: UsersAPI;
        posts: PostsAPI;
        pages: PagesAPI;
    }

    export default GhostAdminAPI;
}
