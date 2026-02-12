import {describe, it, expect} from '@jest/globals';
import {mergeUsersWithGhost} from '../lib/merge-users.js';
import type {MigratedUser} from '../lib/merge-users.js';
import type {GhostUser} from '../lib/fetch-users.js';

describe('mergeUsersWithGhost', function () {
    it('returns source users unchanged when no Ghost users provided', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, []);
        expect(result).toEqual(sourceUsers);
    });

    it('returns source users unchanged when no email matches', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'jane-doe',
                name: 'Jane Doe',
                email: 'jane@example.com'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);
        expect(result).toEqual(sourceUsers);
    });

    it('merges user when email matches (case-insensitive)', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'JOHN@EXAMPLE.COM',
                    bio: 'Source bio'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                bio: 'Ghost bio'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result.length).toBe(1);
        expect(result[0].data.id).toBe('ghost-123');
        expect(result[0].data.slug).toBe('john-d'); // Uses Ghost slug
        expect(result[0].data.name).toBe('John D.'); // Uses Ghost name
        expect(result[0].data.email).toBe('john@example.com'); // Uses Ghost email
        expect(result[0].data.bio).toBe('Source bio'); // Prefers source bio by default
    });

    it('uses Ghost bio when source has none', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                bio: '<p>Ghost bio with <strong>HTML</strong></p>'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result[0].data.bio).toBe('Ghost bio with HTML');
    });

    it('prefers Ghost bio when option is set', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com',
                    bio: 'Source bio'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                bio: 'Ghost bio'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers, {preferGhostBio: true});

        expect(result[0].data.bio).toBe('Ghost bio');
    });

    it('extracts roles from Ghost user objects', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                roles: [{name: 'Editor'}, {name: 'Author'}]
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result[0].data.roles).toEqual(['Editor', 'Author']);
    });

    it('handles roles as string array', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                roles: ['Editor', 'Author'] as unknown as Array<{name: string}>
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result[0].data.roles).toEqual(['Editor', 'Author']);
    });

    it('defaults to Contributor role when no roles present', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com'
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result[0].data.roles).toEqual(['Contributor']);
    });

    it('prefers source profile_image and website, falls back to Ghost', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe',
                    email: 'john@example.com',
                    profile_image: 'https://source.com/john.jpg'
                    // No website
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com',
                profile_image: 'https://ghost.com/john.jpg',
                website: 'https://johndoe.com'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result[0].data.profile_image).toBe('https://source.com/john.jpg'); // Source preferred
        expect(result[0].data.website).toBe('https://johndoe.com'); // Falls back to Ghost
    });

    it('handles multiple users with partial matches', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john',
                data: {slug: 'john', name: 'John', email: 'john@example.com'}
            },
            {
                url: '/author/jane',
                data: {slug: 'jane', name: 'Jane', email: 'jane@example.com'}
            },
            {
                url: '/author/bob',
                data: {slug: 'bob', name: 'Bob', email: 'bob@example.com'}
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-1',
                slug: 'john-existing',
                name: 'John Existing',
                email: 'john@example.com'
            }
            // Jane and Bob not in Ghost
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        expect(result.length).toBe(3);
        // John is matched
        expect(result[0].data.id).toBe('ghost-1');
        expect(result[0].data.slug).toBe('john-existing');
        // Jane is unchanged
        expect(result[1].data.id).toBeUndefined();
        expect(result[1].data.slug).toBe('jane');
        // Bob is unchanged
        expect(result[2].data.id).toBeUndefined();
        expect(result[2].data.slug).toBe('bob');
    });

    it('skips matching when source user has no email', function () {
        const sourceUsers: MigratedUser[] = [
            {
                url: '/author/john-doe',
                data: {
                    slug: 'john-doe',
                    name: 'John Doe'
                    // No email
                }
            }
        ];

        const ghostUsers: GhostUser[] = [
            {
                id: 'ghost-123',
                slug: 'john-d',
                name: 'John D.',
                email: 'john@example.com'
            }
        ];

        const result = mergeUsersWithGhost(sourceUsers, ghostUsers);

        // Should not match since source has no email
        expect(result[0].data.id).toBeUndefined();
        expect(result[0].data.slug).toBe('john-doe');
    });
});
