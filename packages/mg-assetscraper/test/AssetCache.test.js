/* eslint no-undef: 0 */
const AssetCache = require('../lib/AssetCache');

const cachedJSON = require('./fixtures/file-response-cache.json');

describe('AssetCache', function () {
    test('Starts with an empty cache', function () {
        const assetCache = new AssetCache();

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(0);
    });

    test('Can load in a cache file', function () {
        const assetCache = new AssetCache();

        assetCache.load(cachedJSON);

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(5);
    });

    test('Can add item to cache', function () {
        const assetCache = new AssetCache();

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        expect(assetCache._cache).toBeArray();
        expect(assetCache._cache).toBeArrayOfSize(1);
    });

    test('Can skip adding item to cache if it already exists', function () {
        const assetCache = new AssetCache();

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

    test('Can read a specific item', function () {
        const assetCache = new AssetCache();

        assetCache.load(cachedJSON);

        let found = assetCache.find({remote: '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png'});

        expect(found).toBeObject();
        expect(found.remote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
    });

    test('Can update a specific item', function () {
        const assetCache = new AssetCache();

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

    test('Can delete a specific item', function () {
        const assetCache = new AssetCache();

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
});
