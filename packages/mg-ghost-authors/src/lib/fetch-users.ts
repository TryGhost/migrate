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

export interface StreamFetchUsersOptions {
    apiUrl: string;
    adminKey: string;
    fileCache?: {
        hasFile(filename: string, type: string): boolean;
        readTmpJSONFile(filename: string): Promise<any>;
        writeTmpFile(data: unknown, filename: string): Promise<unknown>;
    };
}

export class GhostUserFetchError extends Error {}

/** Paginated counterpart for adapters that must not retain every destination user. */
export async function* streamGhostUsers({
    apiUrl,
    adminKey,
    fileCache
}: StreamFetchUsersOptions): AsyncGenerator<GhostUser> {
    if (!apiUrl || !adminKey) {
        return;
    }
    const {createHash} = await import('node:crypto');
    const cacheKey = createHash('sha256')
        .update(JSON.stringify([apiUrl, adminKey]))
        .digest('hex');
    let api: InstanceType<typeof GhostAdminAPI>;
    try {
        api = new GhostAdminAPI({url: apiUrl.replace(/\/$/, ''), key: adminKey, version: 'v5.0'});
    } catch (cause) {
        throw new GhostUserFetchError((cause as Error).message, {cause});
    }
    let page = 1;
    while (true) {
        const filename = `ghost-users-${cacheKey}-${page}.json`;
        let stored: {users: GhostUser[]; next: boolean} | undefined;
        if (fileCache?.hasFile(filename, 'tmp')) {
            try {
                const cached = await fileCache.readTmpJSONFile(filename);
                if (Array.isArray(cached.users) && typeof cached.next === 'boolean') {
                    stored = cached;
                }
            } catch {
                // A damaged optional cache can be fetched again.
            }
        }
        if (!stored) {
            let response;
            try {
                response = await api.users.browse({limit: 100, page, include: 'roles'});
            } catch (cause) {
                throw new GhostUserFetchError((cause as Error).message, {cause});
            }
            stored = {
                users: Array.isArray(response) ? response : [response],
                next: page < (response.meta?.pagination?.pages ?? page)
            };
            if (fileCache) {
                await fileCache.writeTmpFile(stored, filename);
            }
        }
        for (const user of stored.users) {
            yield user;
        }
        if (!stored.next) {
            return;
        }
        page++;
    }
}
