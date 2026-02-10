import {describe, it, expect} from '@jest/globals';
import * as ghostAuthors from '../index.js';

describe('mg-ghost-authors exports', function () {
    it('exports fetchGhostUsers function', function () {
        expect(typeof ghostAuthors.fetchGhostUsers).toBe('function');
    });

    it('exports mergeUsersWithGhost function', function () {
        expect(typeof ghostAuthors.mergeUsersWithGhost).toBe('function');
    });

    it('exports ghostAuthOptions array', function () {
        expect(Array.isArray(ghostAuthors.ghostAuthOptions)).toBe(true);
        expect(ghostAuthors.ghostAuthOptions.length).toBe(2);
        
        const apiUrlOption = ghostAuthors.ghostAuthOptions.find(o => o.flags === '--ghostApiUrl');
        expect(apiUrlOption).toBeDefined();
        expect(apiUrlOption?.type).toBe('string');
        expect(apiUrlOption?.defaultValue).toBe(null);

        const adminKeyOption = ghostAuthors.ghostAuthOptions.find(o => o.flags === '--ghostAdminKey');
        expect(adminKeyOption).toBeDefined();
        expect(adminKeyOption?.type).toBe('string');
        expect(adminKeyOption?.defaultValue).toBe(null);
    });
});
