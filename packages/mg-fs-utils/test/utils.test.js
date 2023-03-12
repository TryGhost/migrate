import {cacheNameFromPath} from '../lib/utils.js';

describe('Utils', function () {
    it('Can convert path to cache name', function () {
        let cacheName = cacheNameFromPath('/this/is/a/long/file/path/for/1234-current_migration_file.zip');
        expect(cacheName).toEqual('1234-current-migration-file');
    });
});
