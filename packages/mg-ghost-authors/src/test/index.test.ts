import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import * as ghostAuthors from '../index.js';

describe('mg-ghost-authors exports', function () {
    it('exports fetchGhostUsers function', function () {
        assert.equal(typeof ghostAuthors.fetchGhostUsers, 'function');
    });

    it('exports mergeUsersWithGhost function', function () {
        assert.equal(typeof ghostAuthors.mergeUsersWithGhost, 'function');
    });

    it('exports ghostAuthOptions array', function () {
        assert.equal(Array.isArray(ghostAuthors.ghostAuthOptions), true);
        assert.equal(ghostAuthors.ghostAuthOptions.length, 2);

        const apiUrlOption = ghostAuthors.ghostAuthOptions.find(o => o.flags === '--ghostApiUrl');
        assert.ok(apiUrlOption !== undefined);
        assert.equal(apiUrlOption?.type, 'string');
        assert.equal(apiUrlOption?.defaultValue, null);

        const adminKeyOption = ghostAuthors.ghostAuthOptions.find(o => o.flags === '--ghostAdminKey');
        assert.ok(adminKeyOption !== undefined);
        assert.equal(adminKeyOption?.type, 'string');
        assert.equal(adminKeyOption?.defaultValue, null);
    });
});
