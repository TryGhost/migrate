import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cacheNameFromPath} from '../lib/utils.js';

describe('Utils', function () {
    it('Can convert path to cache name', function () {
        let cacheName = cacheNameFromPath('/this/is/a/long/file/path/for/1234-current_migration_file.zip');
        assert.equal(cacheName, '1234-current-migration-file');
    });
});
