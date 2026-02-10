/* eslint-disable @typescript-eslint/no-explicit-any */
import {describe, it, expect} from '@jest/globals';
import {fetchGhostUsers} from '../lib/fetch-users.js';
import type {FetchUsersOptions} from '../lib/fetch-users.js';

describe('fetchGhostUsers', function () {
    it('returns empty array when apiUrl is not provided', async function () {
        const options: FetchUsersOptions = {
            apiUrl: '',
            adminKey: 'valid:key'
        };

        const result = await fetchGhostUsers(options);
        expect(result).toEqual([]);
    });

    it('returns empty array when adminKey is not provided', async function () {
        const options: FetchUsersOptions = {
            apiUrl: 'https://example.ghost.io',
            adminKey: ''
        };

        const result = await fetchGhostUsers(options);
        expect(result).toEqual([]);
    });

    it('throws error for invalid admin key format', async function () {
        const options: FetchUsersOptions = {
            apiUrl: 'https://example.ghost.io',
            adminKey: 'invalid-key-without-colon'
        };

        await expect(fetchGhostUsers(options)).rejects.toThrow('Invalid Admin API key format');
    });

    it('throws error for admin key with empty parts', async function () {
        const options: FetchUsersOptions = {
            apiUrl: 'https://example.ghost.io',
            adminKey: ':secret'
        };

        await expect(fetchGhostUsers(options)).rejects.toThrow('Invalid Admin API key format');
    });

    it('throws error for admin key with empty id', async function () {
        const options: FetchUsersOptions = {
            apiUrl: 'https://example.ghost.io',
            adminKey: 'id:'
        };

        await expect(fetchGhostUsers(options)).rejects.toThrow('Invalid Admin API key format');
    });

    it('returns cached users when available', async function () {
        const cachedUsers = [
            {id: 'cached-1', slug: 'john', name: 'John', email: 'john@example.com'}
        ];

        const mockFileCache = {
            hasFile: () => true,
            readTmpJSONFile: async () => cachedUsers,
            writeTmpFile: async () => {}
        };

        const options: FetchUsersOptions = {
            apiUrl: 'https://example.ghost.io',
            adminKey: 'valid:key',
            fileCache: mockFileCache as any
        };

        const result = await fetchGhostUsers(options);

        expect(result).toEqual(cachedUsers);
    });

    it('returns empty array when API call fails', async function () {
        // This test relies on the fact that an invalid URL/key combination
        // will fail and return an empty array (graceful failure)
        const options: FetchUsersOptions = {
            apiUrl: 'https://invalid-url-that-does-not-exist.ghost.io',
            adminKey: 'abc123def456abc123def456abc123de:1234567890abcdef1234567890abcdef'
        };

        const result = await fetchGhostUsers(options);

        // Should return empty array on failure, not throw
        expect(result).toEqual([]);
    });
});
