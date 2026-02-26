import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';
import {URL} from 'node:url';
import {join} from 'node:path';
import AssetCache from '../lib/AssetCache.js';

const __dirname = new URL('.', import.meta.url).pathname;

// We're not testing the ability to write files here, so always return true
class mockFileCacheClass {
    writeTmpFileSync() {
        return false;
    }

    get tmpDir() {
        return join(__dirname, './fixtures');
    }
}

describe('AssetCache', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = new mockFileCacheClass();
    });

    afterEach(function () {
        mockFileCache = null;
    });

    it('Starts with an empty cache', function () {
        const assetCache = new AssetCache(mockFileCache);

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 0);
    });

    it('Can load in a cache file', async function () {
        const assetCache = new AssetCache(mockFileCache);

        await assetCache.load(join(__dirname, './fixtures/assets/'));

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 5);
    });

    it('Can add item to cache', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 1);
    });

    it('Can skip adding item to cache if it already exists', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 1);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 1);
    });

    it('Can read a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        await assetCache.load(join(__dirname, './fixtures/assets/'));

        let found = assetCache.find({remote: '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png'});

        assert.ok(typeof found === 'object' && found !== null);
        assert.equal(found.remote, '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
    });

    it('Can update a specific item by adding it again', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 2);

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg',
            newRemote: 'https://example.com/content/images/2022/09/another-photo.jpg'
        });

        assert.equal(assetCache._cache.length, 2);
        assert.equal(assetCache._cache[0].remote, '/content/images/2022/09/my-photo.jpg');
        assert.equal(assetCache._cache[1].remote, '/content/images/2022/09/another-photo.jpg');
        assert.equal(assetCache._cache[1].newRemote, 'https://example.com/content/images/2022/09/another-photo.jpg');
    });

    it('Can update a specific item without overwriting all fields', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg',
            newLocal: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 1);
        assert.equal(assetCache._cache[0].remote, '/content/images/2022/09/my-photo.jpg');
        assert.equal(assetCache._cache[0].newLocal, '/content/images/2022/09/my-photo.jpg');
    });

    it('Can update a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        assert.ok(Array.isArray(assetCache._cache));
        assert.equal(assetCache._cache.length, 2);

        assetCache.update({
            remote: '/content/images/2022/09/another-photo.jpg',
            newRemote: 'https://example.com/content/images/2022/09/another-photo.jpg'
        });

        assert.equal(assetCache._cache.length, 2);
        assert.equal(assetCache._cache[1].newRemote, 'https://example.com/content/images/2022/09/another-photo.jpg');
    });

    it('Can delete a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        assert.equal(assetCache._cache.length, 2);

        assetCache.delete({remote: '/content/images/2022/09/my-photo.jpg'});

        assert.equal(assetCache._cache.length, 1);
    });

    it('Get the filename + relative path for asset cache JSON file', async function () {
        const assetCache = new AssetCache(mockFileCache);

        let path1 = assetCache._assetFileCacheName('https://ghost.org');
        assert.equal(path1, 'assets/https-ghost-org');
    });
});
