import GhostAdminAPI from '@tryghost/admin-api';
import errors from '@tryghost/errors';

export interface GhostUser {
    id: string;
    slug: string;
    name: string;
    email: string;
    bio?: string;
    profile_image?: string;
    website?: string;
    roles?: Array<{name: string} | string>;
}

export interface FetchUsersOptions {
    apiUrl: string;
    adminKey: string;
    /** Optional file cache instance for caching fetched users */
    fileCache?: {
        hasFile: (filename: string, type: string) => boolean;
        readTmpJSONFile: (filename: string) => Promise<GhostUser[]>;
        writeTmpFile: (data: unknown, filename: string) => Promise<void>;
    };
}

const CACHE_FILENAME = 'ghost-existing-users.json';

/**
 * Fetch all users from an existing Ghost instance via Admin API
 * Results are cached to avoid repeated API calls during re-runs
 */
export async function fetchGhostUsers(options: FetchUsersOptions): Promise<GhostUser[]> {
    const {apiUrl, adminKey, fileCache} = options;

    if (!apiUrl || !adminKey) {
        return [];
    }

    // Check cache first
    if (fileCache?.hasFile(CACHE_FILENAME, 'tmp')) {
        try {
            const cached = await fileCache.readTmpJSONFile(CACHE_FILENAME);
            return cached;
        } catch {
            // If cache read fails, continue to fetch fresh data
        }
    }

    try {
        // Validate admin key format (id:secret)
        const keyParts = adminKey.split(':');
        if (keyParts.length !== 2 || !keyParts[0] || !keyParts[1]) {
            throw new errors.IncorrectUsageError({
                message: 'Invalid Admin API key format. Expected format: id:secret'
            });
        }

        // Initialize the Ghost Admin API client
        const api = new GhostAdminAPI({
            url: apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl,
            key: adminKey,
            version: 'v5.0'
        });

        // Fetch all users with pagination
        const allUsers: GhostUser[] = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            const response = await api.users.browse({
                limit: 100,
                page,
                include: 'roles'
            });

            allUsers.push(...response);

            // Check if there are more pages
            if (response.meta?.pagination) {
                hasMore = page < response.meta.pagination.pages;
                page += 1;
            } else {
                hasMore = false;
            }
        }

        // Cache the users for future runs
        if (fileCache) {
            try {
                await fileCache.writeTmpFile(allUsers, CACHE_FILENAME);
            } catch {
                // Continue even if caching fails
            }
        }

        return allUsers;
    } catch (error) {
        // Log but don't throw - migrations should continue without Ghost user matching
        if (error instanceof errors.IncorrectUsageError) {
            throw error;
        }
        // For other errors (network, auth, etc.), return empty array
        return [];
    }
}
