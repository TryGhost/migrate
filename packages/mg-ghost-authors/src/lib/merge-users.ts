import type {GhostUser} from './fetch-users.js';

export interface MigratedUser {
    url: string;
    data: {
        id?: string;
        slug: string;
        name?: string;
        email?: string;
        bio?: string;
        profile_image?: string;
        website?: string;
        roles?: string[];
    };
}

export interface MergeOptions {
    /** Prefer Ghost bio over source bio when both exist */
    preferGhostBio?: boolean;
}

/**
 * Clean and normalize bio text by stripping HTML and extra whitespace
 */
function cleanBioText(bioHtml: string | undefined | null): string | undefined {
    if (!bioHtml || typeof bioHtml !== 'string') {
        return undefined;
    }

    // Strip HTML tags
    let bioText = bioHtml.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    bioText = bioText
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, '\'')
        .replace(/&nbsp;/g, ' ');

    // Remove extra whitespace and newlines, then trim
    bioText = bioText.replace(/\s+/g, ' ').trim();

    return bioText.length > 0 ? bioText : undefined;
}

/**
 * Merge migrated users with existing Ghost users by matching email addresses.
 * When a match is found, the Ghost user's ID is used so content is attributed
 * to the existing author rather than creating a duplicate.
 *
 * @param sourceUsers - Users from the source platform being migrated
 * @param ghostUsers - Existing users fetched from the target Ghost instance
 * @param options - Merge options
 * @returns Merged user array with Ghost IDs where matches were found
 */
export function mergeUsersWithGhost(
    sourceUsers: MigratedUser[],
    ghostUsers: GhostUser[],
    options: MergeOptions = {}
): MigratedUser[] {
    if (!ghostUsers || ghostUsers.length === 0) {
        return sourceUsers;
    }

    return sourceUsers.map((sourceUser) => {
        // Try to find a matching Ghost user by email (case-insensitive)
        const matchedGhostUser = ghostUsers.find((ghostUser) => {
            return ghostUser.email &&
                   sourceUser.data.email &&
                   ghostUser.email.toLowerCase() === sourceUser.data.email.toLowerCase();
        });

        if (!matchedGhostUser) {
            return sourceUser;
        }

        // Determine which bio to use
        let bio: string | undefined;
        if (options.preferGhostBio && matchedGhostUser.bio) {
            bio = cleanBioText(matchedGhostUser.bio);
        } else if (sourceUser.data.bio) {
            bio = sourceUser.data.bio; // Source bio is already cleaned by the source processor
        } else if (matchedGhostUser.bio) {
            bio = cleanBioText(matchedGhostUser.bio);
        }

        // Extract roles from Ghost user
        let roles: string[] = ['Contributor']; // Default role
        if (matchedGhostUser.roles && Array.isArray(matchedGhostUser.roles) && matchedGhostUser.roles.length > 0) {
            // Ghost API returns roles as objects with name property
            const firstRole = matchedGhostUser.roles[0];
            if (typeof firstRole === 'object' && firstRole.name) {
                roles = matchedGhostUser.roles.map((r) => {
                    if (typeof r === 'object' && r.name) {
                        return r.name;
                    }
                    return String(r);
                });
            } else if (typeof firstRole === 'string') {
                roles = matchedGhostUser.roles as string[];
            }
        }

        // Return merged user - use Ghost ID/slug/name/email but prefer source data for profile fields
        return {
            url: sourceUser.url,
            data: {
                id: matchedGhostUser.id,
                slug: matchedGhostUser.slug,
                name: matchedGhostUser.name,
                email: matchedGhostUser.email,
                bio,
                profile_image: sourceUser.data.profile_image || matchedGhostUser.profile_image,
                website: sourceUser.data.website || matchedGhostUser.website,
                roles
            }
        };
    });
}
