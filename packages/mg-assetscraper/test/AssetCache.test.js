// Switch these lines once there are useful utils
const testUtils = require('./utils');

const AssetCache = require('../lib/AssetCache');

describe('AssetCache', function () {
    it('Starts with an empty cache', function () {
        const assetCache = new AssetCache();

        assetCache._cache.should.be.an.Array().with.lengthOf(0);
    });

    it('Can load in a cache file', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetCache = new AssetCache();

        assetCache.load(cachedJSON);

        assetCache._cache.should.be.an.Array().with.lengthOf(5);
    });

    it('Can add item to cache', function () {
        const assetCache = new AssetCache();

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(1);
    });

    it('Can skip adding item to cache if it already exists', function () {
        const assetCache = new AssetCache();

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(1);

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(1);
    });

    it('Can read a specific item', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetCache = new AssetCache();

        assetCache.load(cachedJSON);

        let found = assetCache.find({remote: '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png'});

        found.should.be.an.Object();
        found.remote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
    });

    it('Can update a specific item', function () {
        const assetCache = new AssetCache();

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(2);

        assetCache.update({
            remote: '/content/images/2022/09/another-photo.jpg',
            newRemote: 'https://example.com/content/images/2022/09/another-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(2);
        assetCache._cache[1].newRemote.should.eql('https://example.com/content/images/2022/09/another-photo.jpg');
    });

    it('Can delete a specific item', function () {
        const assetCache = new AssetCache();

        assetCache.add({
            remote: '/content/images/2022/09/my-photo.jpg'
        });

        assetCache.add({
            remote: '/content/images/2022/09/another-photo.jpg'
        });

        assetCache._cache.should.be.an.Array().with.lengthOf(2);

        assetCache.delete({remote: '/content/images/2022/09/my-photo.jpg'});

        assetCache._cache.should.be.an.Array().with.lengthOf(1);
    });
});
