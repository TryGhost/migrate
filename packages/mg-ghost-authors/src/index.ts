import {fetchGhostUsers} from './lib/fetch-users.js';
import {mergeUsersWithGhost} from './lib/merge-users.js';

export {fetchGhostUsers};
export type {GhostUser, FetchUsersOptions} from './lib/fetch-users.js';

export {mergeUsersWithGhost};
export type {MigratedUser, MergeOptions} from './lib/merge-users.js';

/**
 * CLI option definitions for Ghost API credentials
 * These can be spread into any migration command's options array
 */
export const ghostAuthOptions = [
    {
        type: 'string',
        flags: '--ghostApiUrl',
        defaultValue: null,
        desc: 'Ghost site URL to fetch existing users (e.g. https://example.ghost.io)'
    },
    {
        type: 'string',
        flags: '--ghostAdminKey',
        defaultValue: null,
        desc: 'Ghost Admin API key to authenticate with Ghost (format: id:secret)'
    }
];

interface GhostUserTaskOptions {
    ghostApiUrl?: string;
    ghostAdminKey?: string;
}

interface MigrationContext {
    fileCache: {
        hasFile: (filename: string, subdir: string) => boolean;
    };
    ghostUsers: Array<{email: string; name?: string; slug?: string}>;
    result: {
        users?: Array<{data: {email?: string; name?: string; slug?: string}}>;
    };
    errors: Array<{message: string; error: unknown}>;
}

interface ListrTask {
    output: string;
}

/**
 * Creates the task runner tasks for fetching and merging Ghost users
 * This can be spread into any migration source's task array after the initial data processing
 *
 * @param options - The options object containing ghostApiUrl and ghostAdminKey
 * @returns Array of task objects for the task runner
 */
export const createGhostUserTasks = (options: GhostUserTaskOptions) => {
    return [
        {
            title: 'Fetch existing Ghost users',
            skip: () => !options.ghostApiUrl || !options.ghostAdminKey,
            task: async (ctx: MigrationContext, task: ListrTask) => {
                try {
                    const wasCached = ctx.fileCache.hasFile('ghost-existing-users.json', 'tmp');
                    ctx.ghostUsers = await fetchGhostUsers({
                        apiUrl: options.ghostApiUrl!,
                        adminKey: options.ghostAdminKey!,
                        fileCache: ctx.fileCache
                    });
                    const cacheStatus = wasCached ? ' (from cache)' : '';
                    task.output = `Fetched ${ctx.ghostUsers.length} Ghost users${cacheStatus}`;

                    // Merge existing Ghost users with imported authors
                    if (ctx.ghostUsers.length > 0 && ctx.result.users) {
                        ctx.result.users = mergeUsersWithGhost(ctx.result.users, ctx.ghostUsers);
                        task.output = `Merged ${ctx.ghostUsers.length} Ghost users with imported authors`;
                    }
                } catch (error) {
                    ctx.errors.push({message: 'Failed to fetch Ghost users', error});
                    // Don't throw - continue with migration without Ghost user matching
                    ctx.ghostUsers = [];
                }
            }
        }
    ];
};
