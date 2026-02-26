import assert from 'node:assert/strict';
import {describe, it, beforeEach, afterEach} from 'node:test';
import {URL} from 'node:url';
import {join} from 'node:path';
import {promises as fs} from 'node:fs';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import AssetScraper from '../lib/AssetScraper.js';

const __dirname = new URL('.', import.meta.url).pathname;

import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const cachedJSON = require('./fixtures/file-response-cache.json');

// We're not testing the ability to write files here, so always return true
class mockFileCacheClass {
    writeTmpFileSync() {
        return false;
    }

    get tmpDir() {
        return join(__dirname, './fixtures');
    }
}

describe('AssetScraper', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = new mockFileCacheClass();
    });

    afterEach(function () {
        mockFileCache = null;
    });

    it('Will remove falsy values', function () {
        const values = [
            {
                remote: '__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png'
            },
            {
                remote: ''
            },
            {
                remote: false
            },
            {
                remote: null
            },
            {
                remote: undefined
            },
            {
                remote: ' '
            },
            {
                remote: '/my-relative-image/path/image.jpg'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        // Ensure values are empty first
        assert.ok(Array.isArray(assetScraper._foundAssets));
        assert.equal(assetScraper._foundAssets.length, 0);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(assetScraper._foundAssets.length, 2);
        assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png');
        assert.equal(data[1].newRemote, '/my-relative-image/path/image.jpg');
    });

    it('Will trim values', function () {
        const values = [
            {
                remote: 'https://ghost.org'
            },
            {
                remote: '  https://ghost.org'
            },
            {
                remote: 'https://ghost.org  '
            },
            {
                remote: '  https://ghost.org  '
            },
            {
                remote: '"https://ghost.org'
            },
            {
                remote: 'https://ghost.org\'"`'
            },
            {
                remote: '\'"`https://ghost.org'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data[0].newRemote, 'https://ghost.org/');
        assert.equal(data[1].newRemote, 'https://ghost.org/');
        assert.equal(data[2].newRemote, 'https://ghost.org/');
        assert.equal(data[3].newRemote, 'https://ghost.org/');
        assert.equal(data[4].newRemote, 'https://ghost.org/');
        assert.equal(data[5].newRemote, 'https://ghost.org/');
        assert.equal(data[6].newRemote, 'https://ghost.org/');
    });

    it('Will removed unwanted query parameters', function () {
        const values = [
            {
                remote: 'https://forum.ghost.org/?ref_url=ghost'
            },
            {
                remote: 'https://forum.ghost.org/?s=node&ref_url=ghost'
            },
            {
                remote: 'https://forum.ghost.org/?ref_url=ghost&s=node'
            },
            {
                remote: 'https://ghost.org/docs/#:~:text=Learn%20how%20to%20build%20and%20develop%20beautiful%2C%20independent%20publications'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data[0].remote, 'https://forum.ghost.org/?ref_url=ghost');
        assert.equal(data[0].newRemote, 'https://forum.ghost.org/');
        assert.equal(data[1].remote, 'https://forum.ghost.org/?s=node&ref_url=ghost');
        assert.equal(data[1].newRemote, 'https://forum.ghost.org/?s=node');
        assert.equal(data[2].remote, 'https://forum.ghost.org/?ref_url=ghost&s=node');
        assert.equal(data[2].newRemote, 'https://forum.ghost.org/?s=node');
        assert.equal(data[3].remote, 'https://ghost.org/docs/#:~:text=Learn%20how%20to%20build%20and%20develop%20beautiful%2C%20independent%20publications');
        assert.equal(data[3].newRemote, 'https://ghost.org/docs/');
    });

    it('Will filter out blocked domains', function () {
        const values = [
            {
                remote: '__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png'
            },
            {
                remote: 'https://images.unsplash.com/photo.jpg'
            },
            {
                remote: '//www.gravatar.com/avatar/73bc36ee2c308a29afbcffde2535a362?s=250&d=mm&r=x'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.ok(data[1].skip);
        assert.ok(data[2].skip);
    });

    it('Will accept an single blocked domain string', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain('donotscrapethis.com');

        assert.ok(assetScraper._blockedDomains.includes('donotscrapethis.com'));
    });

    it('Will accept an array of blocked domains', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain([
            'donotscrapethis.com',
            'https://orthis.com'
        ]);

        assert.ok(assetScraper._blockedDomains.includes('donotscrapethis.com'));
        assert.ok(assetScraper._blockedDomains.includes('https://orthis.com'));
    });

    it('Will filter out additional blocked domains', function () {
        const values = [
            {
                remote: '__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png'
            },
            {
                remote: 'https://donotscrapethis.com/photo.jpg'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain('donotscrapethis.com');

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.ok(data[1].skip);
    });

    it('Will normalize schemaless URLs', function () {
        const values = [
            {
                remote: '//www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x'
            },
            {
                remote: '//old-service.com/user.png'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data.length, 2);
        assert.equal(data[0].newRemote, 'https://www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        assert.equal(data[1].newRemote, 'https://old-service.com/user.png');
    });

    it('Will transform relative links to absolute', function () {
        const values = [
            {
                remote: '__GHOST_URL__/content/images/2022/07/photo.jpg'
            },
            {
                remote: '/content/images/2022/07/another-photo.jpg'
            },
            {
                remote: '//www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x'
            },
            {
                remote: '//old-service.com/user.png'
            },
            {
                remote: 'http://another-example.com/path/to/image.jpg'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache, {
            baseDomain: 'https://example.com'
        });

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data.length, 5);
        assert.equal(data[0].remote, '__GHOST_URL__/content/images/2022/07/photo.jpg');
        assert.equal(data[0].newRemote, 'https://example.com/content/images/2022/07/photo.jpg');
        assert.equal(data[1].remote, '/content/images/2022/07/another-photo.jpg');
        assert.equal(data[1].newRemote, 'https://example.com/content/images/2022/07/another-photo.jpg');
        assert.equal(data[2].remote, '//www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        assert.equal(data[2].newRemote, 'https://www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        assert.equal(data[3].remote, '//old-service.com/user.png');
        assert.equal(data[3].newRemote, 'https://old-service.com/user.png');
        assert.equal(data[4].remote, 'http://another-example.com/path/to/image.jpg');
        assert.equal(data[4].newRemote, 'http://another-example.com/path/to/image.jpg');
    });

    it('Will remove duplicate assets', function () {
        const values = [
            {
                remote: 'https://example.com/my/image.jpg'
            },
            {
                remote: 'https://example.com/my/another.jpg'
            },
            {
                remote: 'https://example.com/my/photo.jpg'
            },
            {
                remote: 'https://example.com/my/image.jpg'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data.length, 3);
        assert.equal(data[0].remote, 'https://example.com/my/image.jpg');
        assert.equal(data[0].newRemote, 'https://example.com/my/image.jpg');
        assert.equal(data[1].remote, 'https://example.com/my/another.jpg');
        assert.equal(data[1].newRemote, 'https://example.com/my/another.jpg');
        assert.equal(data[2].remote, 'https://example.com/my/photo.jpg');
        assert.equal(data[2].newRemote, 'https://example.com/my/photo.jpg');
    });

    it('Will allow extending the blocked domains list', function () {
        const values = [
            {
                remote: 'http://another-example.com/path/to/image.jpg'
            },
            {
                remote: 'http://lorem.com/path/to/image.jpg'
            },
            {
                remote: 'http://ipsum.lorem.com/path/to/image.jpg'
            },
            {
                remote: 'http://lorem.ipsum.com/path/to/image.jpg'
            }
        ];

        const assetScraper = new AssetScraper(mockFileCache, {
            baseDomain: 'https://example.com'
        });

        assetScraper.addBlockedDomain('lorem.com');
        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        assert.equal(data.length, 4);
        assert.ok(data[1].skip);
        assert.ok(data[2].skip);
    });

    it('Will replace asset references with new URLs', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        let mobiledocObject = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"image\",{\"src\":\"__GHOST_URL__/content/images/2022/09/image-1.jpg\",\"width\":1052,\"height\":804,\"caption\":\"A sunset photo\"}],[\"image\",{\"src\":\"https://images.unsplash.com/photo.jpg\",\"width\":5472,\"height\":3648,\"caption\":\"Photo by <a href=\\\"https://unsplash.com/@jonathanborba?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Jonathan Borba</a> / <a href=\\\"https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Unsplash</a>\",\"alt\":\"\"}],[\"html\",{\"html\":\"<div class=\\\"photo\\\"><img src=\\\"__GHOST_URL__/content/images/2022/09/image-2.jpg\\\" /></div>\"}],[\"markdown\",{\"markdown\":\"![Last sunset](https://example.com/wp-content/uploads/2022/09/image-3.jpg?fit=900%2C599&ssl=1)![Last sunset](https://i0.wp.com/example.com/wp-content/uploads/2021/12/sunset.jpg?resize=750%2C500)\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[[0,[],0,\"Test content\"]]],[10,1],[10,2],[1,\"p\",[[0,[],0,\"More test content\"]]],[10,3],[1,\"p\",[]]],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

        assetScraper._initialValue = mobiledocObject;
        assetScraper.findInMobiledoc(mobiledocObject);

        let assets = [
            {
                remote: '__GHOST_URL__/content/images/2022/09/image-1.jpg',
                newRemote: '__GHOST_URL__/content/images/2022/09/image-1.jpg',
                data: {
                    type: 'image'
                },
                head: {
                    contentType: 'image/png'
                },
                newLocal: '/content/images/2022/09/image-1.jpg'
            },
            {
                remote: '__GHOST_URL__/content/images/2022/09/image-2.jpg',
                newRemote: '__GHOST_URL__/content/images/2022/09/image-2.jpg',
                data: {
                    type: 'image'
                },
                head: {
                    contentType: 'image/png'
                },
                newLocal: '/content/images/2022/09/image-2.jpg'
            },
            {
                remote: 'https://example.com/wp-content/uploads/2022/09/image-3.jpg?fit=900%2C599&ssl=1',
                newRemote: 'https://example.com/wp-content/uploads/2022/09/image-3.jpg?fit=900%2C599&ssl=1',
                data: {
                    type: 'image'
                },
                head: {
                    contentType: 'image/png'
                },
                newLocal: '/content/images/2022/09/image-3.jpg'
            },
            {
                remote: 'https://i0.wp.com/example.com/wp-content/uploads/2021/12/sunset.jpg?resize=750%2C500',
                newRemote: 'https://i0.wp.com/example.com/wp-content/uploads/2021/12/sunset.jpg?resize=750%2C500',
                data: {
                    type: 'image'
                },
                head: {
                    contentType: 'image/jpg'
                },
                newLocal: '/content/images/example.com/wp-content/uploads/2021/12/sunset.jpg'
            }
        ];

        assetScraper._foundAssets = assets;
        assetScraper.AssetCache.load(assets);

        let downloadTasks = assetScraper.updateReferences();
        let doIt = makeTaskRunner(downloadTasks, {renderer: 'silent', concurrent: false, topLevel: false});

        await doIt.run();

        let updated = assetScraper.finalObjectValue();
        let updatedJSON = JSON.parse(updated);

        assert.equal(updatedJSON.cards[0][1].src, '/content/images/2022/09/image-1.jpg');
        assert.ok(updatedJSON.cards[2][1].html.includes('src="/content/images/2022/09/image-2.jpg"'));
        assert.ok(updatedJSON.cards[3][1].markdown.includes('(/content/images/2022/09/image-3.jpg)'));
        assert.ok(updatedJSON.cards[3][1].markdown.includes('(/content/images/example.com/wp-content/uploads/2021/12/sunset.jpg)'));
    });

    it('Will read image file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageBuffer = await fs.readFile(join(__dirname, 'fixtures/test.jpeg'));
        const imageData = await assetScraper.getAssetDataFromBuffer(imageBuffer);

        assert.equal(imageData.ext, 'jpg');
        assert.equal(imageData.mime, 'image/jpeg');
    });

    it('Will read video file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const videoBuffer = await fs.readFile(join(__dirname, 'fixtures/video.mp4'));
        const videoData = await assetScraper.getAssetDataFromBuffer(videoBuffer);

        assert.equal(videoData.ext, 'mp4');
        assert.equal(videoData.mime, 'video/mp4');
    });

    it('Will convert a relative URL to absolute, with the given domain', async function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            baseDomain: 'https://example.com'
        });

        const fixedURL = assetScraper.relativeToAbsolute('/images/photo.jpg');

        assert.equal(fixedURL, 'https://example.com/images/photo.jpg');
    });

    it('Will allow supported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageAllowed = assetScraper.isAllowedMime('image/jpeg');
        const mediaAllowed = assetScraper.isAllowedMime('video/mp4');
        const fileAllowed = assetScraper.isAllowedMime('application/pdf');

        assert.ok(imageAllowed);
        assert.ok(mediaAllowed);
        assert.ok(fileAllowed);
    });

    it('Will not allow unsupported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const isAllowed = assetScraper.isAllowedMime('application/x-shockwave-flash');

        assert.ok(!isAllowed);
    });

    it('Will correctly determine save location for images', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageLocation = assetScraper.determineSaveLocation('image/jpeg');
        const mediaLocation = assetScraper.determineSaveLocation('video/mp4');
        const fileLocation = assetScraper.determineSaveLocation('application/pdf');

        assert.equal(imageLocation, 'images');
        assert.equal(mediaLocation, 'media');
        assert.equal(fileLocation, 'files');
    });

    it('Will correctly return false for unsupported mime type', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const flashLocation = assetScraper.determineSaveLocation('application/x-shockwave-flash');
        const nullLocation = assetScraper.determineSaveLocation(null);

        assert.ok(!flashLocation);
        assert.ok(!nullLocation);
    });

    it('Will change extension', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        let test1 = assetScraper.changeExtension('my-file.jpeg', 'jpg');
        let test2 = assetScraper.changeExtension('/my-file.jpeg', 'jpg');
        let test3 = assetScraper.changeExtension('/my-file', 'jpg');
        let test4 = assetScraper.changeExtension('my-file', 'jpg');
        let test5 = assetScraper.changeExtension('my-file.jpg', 'jpg');

        assert.equal(test1, 'my-file.jpg');
        assert.equal(test2, '/my-file.jpg');
        assert.equal(test3, '/my-file.jpg');
        assert.equal(test4, 'my-file.jpg');
        assert.equal(test5, 'my-file.jpg');
    });

    it('Will skip images if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowImages: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        assert.ok(!imageAsset);
        assert.ok(mediaAsset);
        assert.ok(fileAsset);
    });

    it('Will skip media if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowMedia: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        assert.ok(imageAsset);
        assert.ok(!mediaAsset);
        assert.ok(fileAsset);
    });

    it('Will skip files if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowFiles: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        assert.ok(imageAsset);
        assert.ok(mediaAsset);
        assert.ok(!fileAsset);
    });

    it('Will skip downloading all assets if no sizeLimit is defined', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        assert.ok(sizeAllowed1);
        assert.ok(sizeAllowed2);
        assert.ok(sizeAllowed3);

        assert.equal(assetScraper.warnings.length, 0);
    });

    it('Will skip downloading large assets if a filesize is defined', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: 2 // 2 MB,
        });

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        assert.ok(!sizeAllowed1);
        assert.ok(!sizeAllowed2);
        assert.ok(sizeAllowed3);
    });

    it('Will convert sizeLimit unit from 0.5MB to bytes', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: 0.5 // 0.5 MB
        });

        assert.equal(assetScraper.defaultOptions.sizeLimit, 500000);
    });

    it('Will convert sizeLimit unit from 1MB to bytes', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: 1 // 1 MB
        });

        assert.equal(assetScraper.defaultOptions.sizeLimit, 1000000);
    });

    it('Will convert sizeLimit unit from 250MB to bytes', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: 250 // 250 MB
        });

        assert.equal(assetScraper.defaultOptions.sizeLimit, 250000000);
    });
});

describe('Find assets in content', function () {
    let mockFileCache;

    beforeEach(function () {
        mockFileCache = new mockFileCacheClass();
    });

    afterEach(function () {
        mockFileCache = null;
    });

    describe('HTML', function () {
        it('Will find assets in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><img src="https://example.com/my/image.jpg" />`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 1);
            assert.equal(data[0].newRemote, 'https://example.com/my/image.jpg');
        });

        it('Will find assets in an <img> `srcset`', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><img loading="lazy" decoding="async" width="300" height="300" src="https://example.com/wp-content/uploads/coffee-300x300.jpg" alt="Making the Cut" class="wp-image-3829" srcset="https://example.com/wp-content/uploads/coffee-300x300.jpg 300w, https://example.com/wp-content/uploads/coffee-1024x1024.jpg 1024w, https://example.com/wp-content/uploads/coffee-150x150.jpg 150w, https://example.com/wp-content/uploads/coffee-768x768.jpg 768w, https://example.com/wp-content/uploads/coffee-1536x1536.jpg 1536w, https://example.com/wp-content/uploads/coffee-1218x1218.jpg 1218w, https://example.com/wp-content/uploads/coffee-870x870.jpg 870w, https://example.com/wp-content/uploads/coffee-480x480.jpg 480w, https://example.com/wp-content/uploads/coffee-100x100.jpg 100w, https://example.com/wp-content/uploads/coffee.jpg 1600w" sizes="(max-width: 300px) 100vw, 300px" />`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 10);

            assert.equal(data[0].newRemote, 'https://example.com/wp-content/uploads/coffee-300x300.jpg');
            assert.equal(data[1].newRemote, 'https://example.com/wp-content/uploads/coffee-1024x1024.jpg');
            assert.equal(data[2].newRemote, 'https://example.com/wp-content/uploads/coffee-150x150.jpg');
            assert.equal(data[3].newRemote, 'https://example.com/wp-content/uploads/coffee-768x768.jpg');
            assert.equal(data[4].newRemote, 'https://example.com/wp-content/uploads/coffee-1536x1536.jpg');
            assert.equal(data[5].newRemote, 'https://example.com/wp-content/uploads/coffee-1218x1218.jpg');
            assert.equal(data[6].newRemote, 'https://example.com/wp-content/uploads/coffee-870x870.jpg');
            assert.equal(data[7].newRemote, 'https://example.com/wp-content/uploads/coffee-480x480.jpg');
            assert.equal(data[8].newRemote, 'https://example.com/wp-content/uploads/coffee-100x100.jpg');
            assert.equal(data[9].newRemote, 'https://example.com/wp-content/uploads/coffee.jpg');
        });

        it('Will find assets with `data-src` in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><figure><noscript><img src="https://example.com/my-image.jpg" alt=""/></noscript><img class="lazyload" src='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%20210%20140%22%3E%3C/svg%3E' data-src="https://example.com/my-image.jpg" alt="" /></figure>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 1);
            assert.equal(data[0].newRemote, 'https://example.com/my-image.jpg');
        });

        it('Will find assets links in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><a href="https://example.com/my/landscape.jpg">Landscape</a>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 1);
            assert.equal(data[0].newRemote, 'https://example.com/my/landscape.jpg');
        });

        it('Will find background images in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p style="background-image: url('https://example.com/my/landscape.jpg');">Hello</p><p style="background: url(https://example.com/my/small-landscape.jpg);"></p><p style="background: url('https://example.com/my/another-landscape.jpg');"></p>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, 'https://example.com/my/landscape.jpg');
            assert.equal(data[1].newRemote, 'https://example.com/my/small-landscape.jpg');
            assert.equal(data[2].newRemote, 'https://example.com/my/another-landscape.jpg');
        });

        it('Will find images in a HTML picture element', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><picture>
                    <source srcset="https://example.com/image-768.jpg, /image-768-1.5x.jpg 1.5x">
                    <source srcset="https://example.com/image-480.jpg?quality=80, /image-480-2x.jpg 2x">
                    <img src="/image-320.jpg">
                </picture>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 5);
            assert.equal(data[0].newRemote, '/image-320.jpg');
            assert.equal(data[1].newRemote, 'https://example.com/image-768.jpg');
            assert.equal(data[2].newRemote, '/image-768-1.5x.jpg');
            assert.equal(data[3].newRemote, 'https://example.com/image-480.jpg?quality=80');
            assert.equal(data[4].newRemote, '/image-480-2x.jpg');
        });

        it('Will find attributes on video elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video poster="/images/poster.jpg" src="/flowers.mp4"></video>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 2);
            assert.equal(data[0].newRemote, '/images/poster.jpg');
            assert.equal(data[1].newRemote, '/flowers.mp4');
        });

        it('Will find attributes on video source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video controls poster="/images/poster.jpg">
            <source src="/flowers.webm">
            <source src="/flowers.mp4">
            </video>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, '/images/poster.jpg');
            assert.equal(data[1].newRemote, '/flowers.webm');
            assert.equal(data[2].newRemote, '/flowers.mp4');
        });

        it('Will find attributes on audio elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio src="/podcast.mp3"></audio>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 1);
            assert.equal(data[0].newRemote, '/podcast.mp3');
        });

        it('Will find attributes on audio source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio controls>
            <source src="/podcast.mp3">
            <source src="/podcast.ogg">
            </audio>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 2);
            assert.equal(data[0].newRemote, '/podcast.mp3');
            assert.equal(data[1].newRemote, '/podcast.ogg');
        });
    }); // End HTML

    describe('Markdown', function () {
        it('Will find assets in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r![alt text](/Isolated.png "Title")\rHello [My document](https://example.com/my-document.pdf)`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/09/screenshot.png');
            assert.equal(data[1].newRemote, '/Isolated.png');
            assert.equal(data[2].newRemote, 'https://example.com/my-document.pdf');
        });

        it('Will find HTML images in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r<img src="https://example.com/my/image.jpg" /><a href="https://example.com/my-document.pdf">My document</a>`);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/09/screenshot.png');
            assert.equal(data[1].newRemote, 'https://example.com/my/image.jpg');
            assert.equal(data[2].newRemote, 'https://example.com/my-document.pdf');
        });
    }); // End Markdown

    describe('Mobiledoc objects', function () {
        it('Will find images in a Mobiledoc string', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledocObject = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"image\",{\"src\":\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png\",\"width\":1052,\"height\":804,\"caption\":\"A sunset photo\"}],[\"image\",{\"src\":\"https://images.unsplash.com/photo.jpg\",\"width\":5472,\"height\":3648,\"caption\":\"Photo by <a href=\\\"https://unsplash.com/@jonathanborba?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Jonathan Borba</a> / <a href=\\\"https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Unsplash</a>\",\"alt\":\"\"}],[\"html\",{\"html\":\"<div class=\\\"photo\\\"><img src=\\\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png\\\" /></div>\"}],[\"markdown\",{\"markdown\":\"![Last sunset](__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png)\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[[0,[],0,\"Test content\"]]],[10,1],[10,2],[1,\"p\",[[0,[],0,\"More test content\"]]],[10,3],[1,\"p\",[]]],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledocObject);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 4);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png');
            assert.equal(data[1].newRemote, 'https://images.unsplash.com/photo.jpg');
            assert.ok(data[1].skip);
            assert.equal(data[2].newRemote, '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
            assert.equal(data[3].newRemote, '__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png');
        });

        it('Will find images in a Mobiledoc object', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledocObject = {
                cards: [
                    [
                        'image',
                        {
                            src: '__GHOST_URL__/content/images/2022/09/photo-1.jpg'
                        }
                    ],
                    [
                        'html',
                        {
                            html: '<div class="photo"><img src="__GHOST_URL__/content/images/2022/09/photo-2.jpg" /></div>'
                        }
                    ],
                    [
                        'markdown',
                        {
                            markdown: '![Last sunset](__GHOST_URL__/content/images/2022/09/photo-3.jpg)'
                        }
                    ]
                ]
            };

            assetScraper.findInMobiledoc(mobiledocObject);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/09/photo-1.jpg');
            assert.equal(data[1].newRemote, '__GHOST_URL__/content/images/2022/09/photo-2.jpg');
            assert.equal(data[2].newRemote, '__GHOST_URL__/content/images/2022/09/photo-3.jpg');
        });
    }); // End Mobiledoc objects

    describe('Mobiledoc strings', function () {
        it('Will find audio attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"audio\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/example.mp3\",\"title\":\"File example MP3 2MG\",\"duration\":52.819592,\"mimeType\":\"audio/mpeg\",\"thumbnailSrc\":\"__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 2);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/media/2022/09/example.mp3');
            assert.equal(data[1].newRemote, '__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810');
        });

        it('Will find product attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[[\"soft-return\",\"\",{}]],\"cards\":[[\"product\",{\"productButtonEnabled\":true,\"productRatingEnabled\":true,\"productStarRating\":5,\"productImageSrc\":\"__GHOST_URL__/content/images/2022/07/product.png\",\"productTitle\":\"My title\",\"productDescription\":\"<p>The desc</p>\",\"productButton\":\"Btn text\",\"productUrl\":\"#url\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 1);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/images/2022/07/product.png');
        });

        it('Will find video attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"video\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/video.mp4\",\"fileName\":\"video.mp4\",\"width\":640,\"height\":360,\"duration\":13.347,\"mimeType\":\"video/mp4\",\"thumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg\",\"thumbnailWidth\":640,\"thumbnailHeight\":360,\"customThumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 3);
            assert.equal(data[0].newRemote, '__GHOST_URL__/content/media/2022/09/video.mp4');
            assert.equal(data[1].newRemote, '__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg');
            assert.equal(data[2].newRemote, '__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg');
        });
    }); // End Mobiledoc strings

    describe('JSON Objects', function () {
        it('Will find images in object by keys', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let jsonObject = {
                posts: [
                    {
                        feature_image: 'https://mysite.com/images/feature.png'
                    }
                ],
                posts_meta: [
                    {
                        twitter_image: 'https://mysite.com/images/twitter.png',
                        feature_image: 'https://mysite.com/images/another-feature.png'
                    }
                ],
                settings: [
                    {
                        key: 'meta_title',
                        value: null
                    },
                    {
                        key: 'og_image',
                        value: '__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-3.jpg'
                    },
                    {
                        key: 'twitter_image',
                        value: '__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-2.jpg'
                    }
                ],
                snippets: [
                    {
                        mobiledoc: '{"version":"0.3.2","atoms":[],"cards":[["image",{"src":"__GHOST_URL__/content/images/2022/03/snippet-image.jpeg","width":367,"height":790}]],"markups":[],"sections":[[10,0]]}'
                    }
                ]
            };

            assetScraper.findInObject(jsonObject);

            const data = assetScraper._foundAssets;

            assert.equal(data.length, 6);
            assert.equal(data[0].newRemote, 'https://mysite.com/images/feature.png');
            assert.equal(data[1].newRemote, 'https://mysite.com/images/twitter.png');
            assert.equal(data[2].newRemote, 'https://mysite.com/images/another-feature.png');
            assert.equal(data[3].newRemote, '__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-3.jpg');
            assert.equal(data[4].newRemote, '__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-2.jpg');
            assert.equal(data[5].newRemote, '__GHOST_URL__/content/images/2022/03/snippet-image.jpeg');
        });
    });
});
