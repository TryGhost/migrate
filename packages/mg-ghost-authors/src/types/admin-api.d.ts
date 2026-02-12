declare module '@tryghost/admin-api' {
    interface BrowseOptions {
        limit?: number;
        page?: number;
        include?: string;
        filter?: string;
        fields?: string;
    }

    interface PaginationMeta {
        page: number;
        limit: number;
        pages: number;
        total: number;
        next: number | null;
        prev: number | null;
    }

    interface BrowseResponse<T> extends Array<T> {
        meta?: {
            pagination: PaginationMeta;
        };
    }

    interface GhostAdminAPIOptions {
        url: string;
        key: string;
        version: string;
    }

    interface User {
        id: string;
        slug: string;
        name: string;
        email: string;
        bio?: string;
        profile_image?: string;
        website?: string;
        roles?: Array<{name: string}>;
    }

    interface UsersAPI {
        browse(options?: BrowseOptions): Promise<BrowseResponse<User>>;
    }

    class GhostAdminAPI {
        constructor(options: GhostAdminAPIOptions);
        users: UsersAPI;
    }

    export default GhostAdminAPI;
}
