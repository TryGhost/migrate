/* eslint no-undef: 0 */
const path = require('path');
const fs = require('fs').promises;
const AssetScraper = require('../lib/AssetScraper');
const makeTaskRunner = require('./utils/task-runner.js');

const cachedJSON = require('./fixtures/file-response-cache.json');

// We're not testing the ability to write files here, so always return true
class mockFileCacheClass {
    writeTmpFileSync() {
        return false;
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

    test('Will remove falsy values', function () {
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
        expect(assetScraper._foundAssets).toBeArray();
        expect(assetScraper._foundAssets).toBeArrayOfSize(0);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        expect(assetScraper._foundAssets).toBeArrayOfSize(2);
        expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png');
        expect(data[1].newRemote).toEqual('/my-relative-image/path/image.jpg');
    });

    test('Will filter out blocked domains', function () {
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

        expect(data[1].skip).toBeTruthy();
        expect(data[2].skip).toBeTruthy();
    });

    test('Will accept an single blocked domain string', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain('donotscrapethis.com');

        expect(assetScraper._blockedDomains).toIncludeAnyMembers(['donotscrapethis.com']);
    });

    test('Will accept an array of blocked domains', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain([
            'donotscrapethis.com',
            'https://orthis.com'
        ]);

        expect(assetScraper._blockedDomains).toIncludeAnyMembers(['donotscrapethis.com']);
        expect(assetScraper._blockedDomains).toIncludeAnyMembers(['https://orthis.com']);
    });

    test('Will filter out additional blocked domains', function () {
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

        expect(data[1].skip).toBeTruthy();
    });

    test('Will normalize schemaless URLs', function () {
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

        expect(data).toBeArrayOfSize(2);
        expect(data[0].newRemote).toEqual('https://www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        expect(data[1].newRemote).toEqual('https://old-service.com/user.png');
    });

    test('Will transform relative links to absolute', function () {
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

        expect(data).toBeArrayOfSize(5);
        expect(data[0].remote).toEqual('__GHOST_URL__/content/images/2022/07/photo.jpg');
        expect(data[0].newRemote).toEqual('https://example.com/content/images/2022/07/photo.jpg');
        expect(data[1].remote).toEqual('/content/images/2022/07/another-photo.jpg');
        expect(data[1].newRemote).toEqual('https://example.com/content/images/2022/07/another-photo.jpg');
        expect(data[2].remote).toEqual('//www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        expect(data[2].newRemote).toEqual('https://www.gravatar.com/avatar/123456782c308a29afbcffde2535a362?s=250&d=mm&r=x');
        expect(data[3].remote).toEqual('//old-service.com/user.png');
        expect(data[3].newRemote).toEqual('https://old-service.com/user.png');
        expect(data[4].remote).toEqual('http://another-example.com/path/to/image.jpg');
        expect(data[4].newRemote).toEqual('http://another-example.com/path/to/image.jpg');
    });

    test('Will remove duplicate assets', function () {
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

        expect(data).toBeArrayOfSize(3);
        expect(data[0].remote).toEqual('https://example.com/my/image.jpg');
        expect(data[0].newRemote).toEqual('https://example.com/my/image.jpg');
        expect(data[1].remote).toEqual('https://example.com/my/another.jpg');
        expect(data[1].newRemote).toEqual('https://example.com/my/another.jpg');
        expect(data[2].remote).toEqual('https://example.com/my/photo.jpg');
        expect(data[2].newRemote).toEqual('https://example.com/my/photo.jpg');
    });

    test('Will allow extending the blocked domains list', function () {
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

        expect(data).toBeArrayOfSize(4);
        expect(data[1].skip).toBeTruthy();
        expect(data[2].skip).toBeTruthy();
    });

    test('Will replace asset references with new URLs', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        let mobiledocObject = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"image\",{\"src\":\"__GHOST_URL__/content/images/2022/09/image-1.jpg\",\"width\":1052,\"height\":804,\"caption\":\"A sunset photo\"}],[\"image\",{\"src\":\"https://images.unsplash.com/photo.jpg\",\"width\":5472,\"height\":3648,\"caption\":\"Photo by <a href=\\\"https://unsplash.com/@jonathanborba?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Jonathan Borba</a> / <a href=\\\"https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Unsplash</a>\",\"alt\":\"\"}],[\"html\",{\"html\":\"<div class=\\\"photo\\\"><img src=\\\"__GHOST_URL__/content/images/2022/09/image-2.jpg\\\" /></div>\"}],[\"markdown\",{\"markdown\":\"![Last sunset](__GHOST_URL__/content/images/2022/09/image-3.jpg)\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[[0,[],0,\"Test content\"]]],[10,1],[10,2],[1,\"p\",[[0,[],0,\"More test content\"]]],[10,3],[1,\"p\",[]]],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

        assetScraper._initialValue = mobiledocObject;
        assetScraper.findInMobiledoc(mobiledocObject);

        assetScraper.AssetCache.load([
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
                remote: '__GHOST_URL__/content/images/2022/09/image-3.jpg',
                newRemote: '__GHOST_URL__/content/images/2022/09/image-3.jpg',
                data: {
                    type: 'image'
                },
                head: {
                    contentType: 'image/png'
                },
                newLocal: '/content/images/2022/09/image-3.jpg'
            }
        ]);

        let downloadTasks = assetScraper.updateReferences();
        let doIt = makeTaskRunner(downloadTasks, {renderer: 'silent', concurrent: false, topLevel: false});

        await doIt.run();

        let updated = assetScraper.finalObjectValue();
        let updatedJSON = JSON.parse(updated);

        expect(updatedJSON.cards[0][1].src).toEqual('/content/images/2022/09/image-1.jpg');
        expect(updatedJSON.cards[2][1].html).toInclude('src="/content/images/2022/09/image-2.jpg"');
        expect(updatedJSON.cards[3][1].markdown).toInclude('(/content/images/2022/09/image-3.jpg)');
    });

    test('Will read image file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageBuffer = await fs.readFile(path.join(__dirname, 'fixtures/test.jpeg'));
        const imageData = await assetScraper.getAssetDataFromBuffer(imageBuffer);

        expect(imageData.ext).toEqual('jpg');
        expect(imageData.mime).toEqual('image/jpeg');
    });

    test('Will read video file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const videoBuffer = await fs.readFile(path.join(__dirname, 'fixtures/video.mp4'));
        const videoData = await assetScraper.getAssetDataFromBuffer(videoBuffer);

        expect(videoData.ext).toEqual('mp4');
        expect(videoData.mime).toEqual('video/mp4');
    });

    test('Will convert a relative URL to absolute, with the given domain', async function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            baseDomain: 'https://example.com'
        });

        const fixedURL = assetScraper.relativeToAbsolute('/images/photo.jpg');

        expect(fixedURL).toEqual('https://example.com/images/photo.jpg');
    });

    test('Will allow supported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageAllowed = assetScraper.isAllowedMime('image/jpeg');
        const mediaAllowed = assetScraper.isAllowedMime('video/mp4');
        const fileAllowed = assetScraper.isAllowedMime('application/pdf');

        expect(imageAllowed).toBeTruthy();
        expect(mediaAllowed).toBeTruthy();
        expect(fileAllowed).toBeTruthy();
    });

    test('Will not allow unsupported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const isAllowed = assetScraper.isAllowedMime('application/x-shockwave-flash');

        expect(isAllowed).toBeFalsy();
    });

    test('Will correctly determine save location for images', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageLocation = assetScraper.determineSaveLocation('image/jpeg');
        const mediaLocation = assetScraper.determineSaveLocation('video/mp4');
        const fileLocation = assetScraper.determineSaveLocation('application/pdf');

        expect(imageLocation).toEqual('images');
        expect(mediaLocation).toEqual('media');
        expect(fileLocation).toEqual('files');
    });

    test('Will correctly return false for unsupported mime type', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const flashLocation = assetScraper.determineSaveLocation('application/x-shockwave-flash');
        const nullLocation = assetScraper.determineSaveLocation(null);

        expect(flashLocation).toBeFalsy();
        expect(nullLocation).toBeFalsy();
    });

    test('Will change extension', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        let test1 = assetScraper.changeExtension('my-file.jpeg', 'jpg');
        let test2 = assetScraper.changeExtension('/my-file.jpeg', 'jpg');
        let test3 = assetScraper.changeExtension('/my-file', 'jpg');
        let test4 = assetScraper.changeExtension('my-file', 'jpg');
        let test5 = assetScraper.changeExtension('my-file.jpg', 'jpg');

        expect(test1).toEqual('my-file.jpg');
        expect(test2).toEqual('/my-file.jpg');
        expect(test3).toEqual('/my-file.jpg');
        expect(test4).toEqual('my-file.jpg');
        expect(test5).toEqual('my-file.jpg');
    });

    test('Will skip images if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowImages: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        expect(imageAsset).toBeFalsy();
        expect(mediaAsset).toBeTruthy();
        expect(fileAsset).toBeTruthy();
    });

    test('Will skip media if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowMedia: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        expect(imageAsset).toBeTruthy();
        expect(mediaAsset).toBeFalsy();
        expect(fileAsset).toBeTruthy();
    });

    test('Will skip files if not enabled', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            allowFiles: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        expect(imageAsset).toBeTruthy();
        expect(mediaAsset).toBeTruthy();
        expect(fileAsset).toBeFalsy();
    });

    test('Will skip downloading all assets if no sizeLimit is defined', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        expect(sizeAllowed1).toBeTruthy();
        expect(sizeAllowed2).toBeTruthy();
        expect(sizeAllowed3).toBeTruthy();

        expect(assetScraper.oversizedAssets()).toBeArrayOfSize(0);
    });

    test('Will skip downloading large assets if a filesize is defined', function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: (1048576 * 2) // 2 MB
        });

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        expect(sizeAllowed1).toBeFalsy();
        expect(sizeAllowed2).toBeFalsy();
        expect(sizeAllowed3).toBeTruthy();

        expect(assetScraper.oversizedAssets()).toBeArrayOfSize(2);
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
        test('Will find assets in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><img src="https://example.com/my/image.jpg" />`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(1);
            expect(data[0].newRemote).toEqual('https://example.com/my/image.jpg');
        });

        test('Will find assets links in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><a href="https://example.com/my/landscape.jpg">Landscape</a>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(1);
            expect(data[0].newRemote).toEqual('https://example.com/my/landscape.jpg');
        });

        test('Will find background images in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p style="background-image: url('https://example.com/my/landscape.jpg');">Hello</p><p style="background: url(https://example.com/my/small-landscape.jpg);"></p><p style="background: url('https://example.com/my/another-landscape.jpg');"></p>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('https://example.com/my/landscape.jpg');
            expect(data[1].newRemote).toEqual('https://example.com/my/small-landscape.jpg');
            expect(data[2].newRemote).toEqual('https://example.com/my/another-landscape.jpg');
        });

        test('Will find images in a HTML picture element', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><picture>
                    <source srcset="https://example.com/image-768.jpg, /image-768-1.5x.jpg 1.5x">
                    <source srcset="https://example.com/image-480.jpg?quality=80, /image-480-2x.jpg 2x">
                    <img src="/image-320.jpg">
                </picture>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(5);
            expect(data[0].newRemote).toEqual('/image-320.jpg');
            expect(data[1].newRemote).toEqual('https://example.com/image-768.jpg');
            expect(data[2].newRemote).toEqual('/image-768-1.5x.jpg');
            expect(data[3].newRemote).toEqual('https://example.com/image-480.jpg');
            expect(data[4].newRemote).toEqual('/image-480-2x.jpg');
        });

        test('Will find attributes on video elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video poster="/images/poster.jpg" src="/flowers.mp4"></video>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(2);
            expect(data[0].newRemote).toEqual('/images/poster.jpg');
            expect(data[1].newRemote).toEqual('/flowers.mp4');
        });

        test('Will find attributes on video source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video controls poster="/images/poster.jpg">
            <source src="/flowers.webm">
            <source src="/flowers.mp4">
            </video>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('/images/poster.jpg');
            expect(data[1].newRemote).toEqual('/flowers.webm');
            expect(data[2].newRemote).toEqual('/flowers.mp4');
        });

        test('Will find attributes on audio elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio src="/podcast.mp3"></audio>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(1);
            expect(data[0].newRemote).toEqual('/podcast.mp3');
        });

        test('Will find attributes on audio source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio controls>
            <source src="/podcast.mp3">
            <source src="/podcast.ogg">
            </audio>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(2);
            expect(data[0].newRemote).toEqual('/podcast.mp3');
            expect(data[1].newRemote).toEqual('/podcast.ogg');
        });
    }); // End HTML

    describe('Markdown', function () {
        test('Will find assets in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r![alt text](/Isolated.png "Title")\rHello [My document](https://example.com/my-document.pdf)`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot.png');
            expect(data[1].newRemote).toEqual('/Isolated.png');
            expect(data[2].newRemote).toEqual('https://example.com/my-document.pdf');
        });

        test('Will find HTML images in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r<img src="https://example.com/my/image.jpg" /><a href="https://example.com/my-document.pdf">My document</a>`);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot.png');
            expect(data[1].newRemote).toEqual('https://example.com/my/image.jpg');
            expect(data[2].newRemote).toEqual('https://example.com/my-document.pdf');
        });
    }); // End Markdown

    describe('Mobiledoc objects', function () {
        test('Will find images in a Mobiledoc string', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledocObject = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"image\",{\"src\":\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png\",\"width\":1052,\"height\":804,\"caption\":\"A sunset photo\"}],[\"image\",{\"src\":\"https://images.unsplash.com/photo.jpg\",\"width\":5472,\"height\":3648,\"caption\":\"Photo by <a href=\\\"https://unsplash.com/@jonathanborba?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Jonathan Borba</a> / <a href=\\\"https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Unsplash</a>\",\"alt\":\"\"}],[\"html\",{\"html\":\"<div class=\\\"photo\\\"><img src=\\\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png\\\" /></div>\"}],[\"markdown\",{\"markdown\":\"![Last sunset](__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png)\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[[0,[],0,\"Test content\"]]],[10,1],[10,2],[1,\"p\",[[0,[],0,\"More test content\"]]],[10,3],[1,\"p\",[]]],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledocObject);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(4);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png');
            expect(data[1].newRemote).toEqual('https://images.unsplash.com/photo.jpg');
            expect(data[1].skip).toBeTruthy();
            expect(data[2].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
            expect(data[3].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png');
        });

        test('Will find images in a Mobiledoc object', async function () {
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

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/photo-1.jpg');
            expect(data[1].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/photo-2.jpg');
            expect(data[2].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/photo-3.jpg');
        });
    }); // End Mobiledoc objects

    describe('Mobiledoc strings', function () {
        test('Will find audio attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"audio\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/example.mp3\",\"title\":\"File example MP3 2MG\",\"duration\":52.819592,\"mimeType\":\"audio/mpeg\",\"thumbnailSrc\":\"__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(2);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/media/2022/09/example.mp3');
            expect(data[1].newRemote).toEqual('__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810');
        });

        test('Will find product attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[[\"soft-return\",\"\",{}]],\"cards\":[[\"product\",{\"productButtonEnabled\":true,\"productRatingEnabled\":true,\"productStarRating\":5,\"productImageSrc\":\"__GHOST_URL__/content/images/2022/07/product.png\",\"productTitle\":\"My title\",\"productDescription\":\"<p>The desc</p>\",\"productButton\":\"Btn text\",\"productUrl\":\"#url\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(1);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/images/2022/07/product.png');
        });

        test('Will find video attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"video\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/video.mp4\",\"fileName\":\"video.mp4\",\"width\":640,\"height\":360,\"duration\":13.347,\"mimeType\":\"video/mp4\",\"thumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg\",\"thumbnailWidth\":640,\"thumbnailHeight\":360,\"customThumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            expect(data).toBeArrayOfSize(3);
            expect(data[0].newRemote).toEqual('__GHOST_URL__/content/media/2022/09/video.mp4');
            expect(data[1].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg');
            expect(data[2].newRemote).toEqual('__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg');
        });
    }); // End Mobiledoc strings

    describe('JSON Objects', function () {
        test('Will find images in object by keys', async function () {
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

            expect(data).toBeArrayOfSize(6);
            expect(data[0].newRemote).toEqual('https://mysite.com/images/feature.png');
            expect(data[1].newRemote).toEqual('https://mysite.com/images/twitter.png');
            expect(data[2].newRemote).toEqual('https://mysite.com/images/another-feature.png');
            expect(data[3].newRemote).toEqual('__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-3.jpg');
            expect(data[4].newRemote).toEqual('__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-2.jpg');
            expect(data[5].newRemote).toEqual('__GHOST_URL__/content/images/2022/03/snippet-image.jpeg');
        });
    });
});
