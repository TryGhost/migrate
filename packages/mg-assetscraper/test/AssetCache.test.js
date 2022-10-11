/* eslint no-undef: 0 */
import {URL} from 'node:url';
import path from 'node:path';
import {AssetCache} from '../lib/AssetCache.js';

const __dirname = new URL('.', import.meta.url).pathname;

// We're not testing the ability to write files here, so always return true
class mockFileCacheClass {
    writeTmpFileSync() {
        return false;
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

    test('Starts with an empty cache', function () {
        const assetCache = new AssetCache(mockFileCache);

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(0);
    });

    test('Can load in a cache file', async function () {
        const assetCache = new AssetCache(mockFileCache);

        await assetCache.load(path.join(__dirname, './fixtures/assets/'));

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(5);
    });

    test('Can add item to cache', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(1);
    });

    it('Can skip adding item to cache if it already exists', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(1);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(1);
    });

    it('Can read a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        await assetCache.load(path.join(__dirname, './fixtures/assets/'));

        let found = assetCache.find({remote: '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png'});

        expect(found).toBeObject();
        expect(found.remote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
    });

    it('Can update a specific item by adding it again', function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(2);

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg',
            newRemote: 'https://example.com/content/images/2022/09/another-photo.jpg'
        });

        expect(assetCache._cache).toBeArrayOfSize(2);
        expect(assetCache._cache[0].remote).toEqual('/content/images/2022/09/my-photo.jpg');
        expect(assetCache._cache[1].remote).toEqual('/content/images/2022/09/another-photo.jpg');
        expect(assetCache._cache[1].newRemote).toEqual('https://example.com/content/images/2022/09/another-photo.jpg');
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

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(1);
        expect(assetCache._cache[0].remote).toEqual('/content/images/2022/09/my-photo.jpg');
        expect(assetCache._cache[0].newLocal).toEqual('/content/images/2022/09/my-photo.jpg');
    });

    it('Can update a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(2);

        assetCache.update({
            remote: '/content/images/2022/09/another-photo.jpg',
            newRemote: 'https://example.com/content/images/2022/09/another-photo.jpg'
        });

        expect(assetCache._cache).toBeArrayOfSize(2);
        expect(assetCache._cache[1].newRemote).toEqual('https://example.com/content/images/2022/09/another-photo.jpg');
    });

    it('Can delete a specific item', async function () {
        const assetCache = new AssetCache(mockFileCache);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        expect(assetCache._cache).toBeArrayOfSize(2);

        assetCache.delete({remote: '/content/images/2022/09/my-photo.jpg'});

        expect(assetCache._cache).toBeArrayOfSize(1);
    });

    it('Get the filename + relative path for asset cache JSON file', async function () {
        const assetCache = new AssetCache(mockFileCache);

        let path1 = assetCache._assetFileCacheName('https://ghost.org');
        expect(path1).toEqual('assets/https-ghost-org');
    });
});
