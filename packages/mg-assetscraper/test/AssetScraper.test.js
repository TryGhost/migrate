// Switch these lines once there are useful utils
const testUtils = require('./utils');

const path = require('path');
const fs = require('fs').promises;
const AssetScraper = require('../lib/AssetScraper');
const makeTaskRunner = require('../../migrate/lib/task-runner.js');

describe('AssetScraper', function () {
    let mockFileCache;

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
        assetScraper._foundAssets.should.be.an.Array().with.lengthOf(0);

        assetScraper.addRawValues(values);

        const data = assetScraper._foundAssets;

        data.should.be.an.Array().with.lengthOf(2);
        data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png');
        data[1].newRemote.should.eql('/my-relative-image/path/image.jpg');
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

        data.should.be.an.Array().with.lengthOf(1);
        data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png');
    });

    it('Will accept an single blocked domain string', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain('donotscrapethis.com');

        assetScraper._blockedDomains.should.containEql('donotscrapethis.com');
    });

    it('Will accept an array of blocked domains', function () {
        const assetScraper = new AssetScraper(mockFileCache);
        assetScraper.addBlockedDomain([
            'donotscrapethis.com',
            'https://orthis.com'
        ]);

        assetScraper._blockedDomains.should.containEql('donotscrapethis.com');
        assetScraper._blockedDomains.should.containEql('https://orthis.com');
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

        data.should.be.an.Array().with.lengthOf(1);
        data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/07/screenshot-14-04-15-28-07-2022-1.png');
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

        data.should.be.an.Array().with.lengthOf(1);
        data[0].newRemote.should.eql('https://old-service.com/user.png');
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

        data.should.be.an.Array().with.lengthOf(4);
        data[0].remote.should.eql('__GHOST_URL__/content/images/2022/07/photo.jpg');
        data[0].newRemote.should.eql('https://example.com/content/images/2022/07/photo.jpg');
        data[1].remote.should.eql('/content/images/2022/07/another-photo.jpg');
        data[1].newRemote.should.eql('https://example.com/content/images/2022/07/another-photo.jpg');
        data[2].remote.should.eql('//old-service.com/user.png');
        data[2].newRemote.should.eql('https://old-service.com/user.png');
        data[3].remote.should.eql('http://another-example.com/path/to/image.jpg');
        data[3].newRemote.should.eql('http://another-example.com/path/to/image.jpg');
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

        data.should.be.an.Array().with.lengthOf(3);
        data[0].remote.should.eql('https://example.com/my/image.jpg');
        data[0].newRemote.should.eql('https://example.com/my/image.jpg');
        data[1].remote.should.eql('https://example.com/my/another.jpg');
        data[1].newRemote.should.eql('https://example.com/my/another.jpg');
        data[2].remote.should.eql('https://example.com/my/photo.jpg');
        data[2].newRemote.should.eql('https://example.com/my/photo.jpg');
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

        data.should.be.an.Array().with.lengthOf(2);
        data[0].remote.should.eql('http://another-example.com/path/to/image.jpg');
        data[0].newRemote.should.eql('http://another-example.com/path/to/image.jpg');
        data[1].remote.should.eql('http://lorem.ipsum.com/path/to/image.jpg');
        data[1].newRemote.should.eql('http://lorem.ipsum.com/path/to/image.jpg');
    });

    it('Will replace asset references with new URLs', async function () {
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

        updatedJSON.cards[0][1].src.should.eql('/content/images/2022/09/image-1.jpg');
        updatedJSON.cards[2][1].html.should.containEql('src="/content/images/2022/09/image-2.jpg"');
        updatedJSON.cards[3][1].markdown.should.containEql('(/content/images/2022/09/image-3.jpg)');
    });

    it('Will read image file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageBuffer = await fs.readFile(path.join(__dirname, 'fixtures/test.jpeg'));
        const imageData = await assetScraper.getAssetDataFromBuffer(imageBuffer);

        imageData.ext.should.eql('jpg');
        imageData.mime.should.eql('image/jpeg');
    });

    it('Will read video file type data from a buffer', async function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const videoBuffer = await fs.readFile(path.join(__dirname, 'fixtures/video.mp4'));
        const videoData = await assetScraper.getAssetDataFromBuffer(videoBuffer);

        videoData.ext.should.eql('mp4');
        videoData.mime.should.eql('video/mp4');
    });

    it('Will convert a relative URL to absolute, with the given domain', async function () {
        const assetScraper = new AssetScraper(mockFileCache, {
            baseDomain: 'https://example.com'
        });

        const fixedURL = assetScraper.relativeToAbsolute('/images/photo.jpg');

        fixedURL.should.eql('https://example.com/images/photo.jpg');
    });

    it('Will allow supported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageAllowed = assetScraper.isAllowedMime('image/jpeg');
        const mediaAllowed = assetScraper.isAllowedMime('video/mp4');
        const fileAllowed = assetScraper.isAllowedMime('application/pdf');

        (imageAllowed).should.be.true();
        (mediaAllowed).should.be.true();
        (fileAllowed).should.be.true();
    });

    it('Will not allow unsupported mime types', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const isAllowed = assetScraper.isAllowedMime('application/x-shockwave-flash');

        (isAllowed).should.be.false();
    });

    it('Will correctly determine save location for images', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const imageLocation = assetScraper.determineSaveLocation('image/jpeg');
        const mediaLocation = assetScraper.determineSaveLocation('video/mp4');
        const fileLocation = assetScraper.determineSaveLocation('application/pdf');

        imageLocation.should.eql('images');
        mediaLocation.should.eql('media');
        fileLocation.should.eql('files');
    });

    it('Will correctly return false for unsupported mime type', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        const flashLocation = assetScraper.determineSaveLocation('application/x-shockwave-flash');
        const nullLocation = assetScraper.determineSaveLocation(null);

        (flashLocation).should.be.false();
        (nullLocation).should.be.false();
    });

    it('Will change extension', function () {
        const assetScraper = new AssetScraper(mockFileCache);

        let test1 = assetScraper.changeExtension('my-file.jpeg', 'jpg');
        let test2 = assetScraper.changeExtension('/my-file.jpeg', 'jpg');
        let test3 = assetScraper.changeExtension('/my-file', 'jpg');
        let test4 = assetScraper.changeExtension('my-file', 'jpg');
        let test5 = assetScraper.changeExtension('my-file.jpg', 'jpg');

        test1.should.eql('my-file.jpg');
        test2.should.eql('/my-file.jpg');
        test3.should.eql('/my-file.jpg');
        test4.should.eql('my-file.jpg');
        test5.should.eql('my-file.jpg');
    });

    it('Will skip images if not enabled', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetScraper = new AssetScraper(mockFileCache, {
            allowImages: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        (imageAsset).should.be.false();
        (mediaAsset).should.be.true();
        (fileAsset).should.be.true();
    });

    it('Will skip media if not enabled', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetScraper = new AssetScraper(mockFileCache, {
            allowMedia: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        (imageAsset).should.be.true();
        (mediaAsset).should.be.false();
        (fileAsset).should.be.true();
    });

    it('Will skip files if not enabled', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetScraper = new AssetScraper(mockFileCache, {
            allowFiles: false
        });

        const imageAsset = assetScraper.isAllowedMime(cachedJSON[0].head.contentType);
        const mediaAsset = assetScraper.isAllowedMime(cachedJSON[3].head.contentType);
        const fileAsset = assetScraper.isAllowedMime(cachedJSON[4].head.contentType);

        (imageAsset).should.be.true();
        (mediaAsset).should.be.true();
        (fileAsset).should.be.false();
    });

    it('Will skip downloading all assets if no sizeLimit is defined', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetScraper = new AssetScraper(mockFileCache);

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        (sizeAllowed1).should.be.true();
        (sizeAllowed2).should.be.true();
        (sizeAllowed3).should.be.true();
    });

    it('Will skip downloading large assets if a filesize is defined', function () {
        let cachedJSON = testUtils.fixtures.readSync('file-response-cache.json');

        const assetScraper = new AssetScraper(mockFileCache, {
            sizeLimit: (1048576 * 2) // 2 MB
        });

        const sizeAllowed1 = assetScraper.isWithinSizeLimit(cachedJSON[0]);
        const sizeAllowed2 = assetScraper.isWithinSizeLimit(cachedJSON[1]);
        const sizeAllowed3 = assetScraper.isWithinSizeLimit(cachedJSON[2]);

        (sizeAllowed1).should.be.false();
        (sizeAllowed2).should.be.false();
        (sizeAllowed3).should.be.true();
    });
});

describe('Find assets in content', function () {
    let mockFileCache;

    describe('HTML', function () {
        it('Will find assets in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><img src="https://example.com/my/image.jpg" />`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(1);
            data[0].newRemote.should.eql('https://example.com/my/image.jpg');
        });

        it('Will find assets links in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><a href="https://example.com/my/landscape.jpg">Landscape</a>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(1);
            data[0].newRemote.should.eql('https://example.com/my/landscape.jpg');
        });

        it('Will find background images in HTML', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p style="background-image: url('https://example.com/my/landscape.jpg');">Hello</p><p style="background: url(https://example.com/my/small-landscape.jpg);"></p><p style="background: url('https://example.com/my/another-landscape.jpg');"></p>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('https://example.com/my/landscape.jpg');
            data[1].newRemote.should.eql('https://example.com/my/small-landscape.jpg');
            data[2].newRemote.should.eql('https://example.com/my/another-landscape.jpg');
        });

        it('Will find images in a HTML picture element', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<p>Hello</p><picture>
                    <source srcset="https://example.com/image-768.jpg, /image-768-1.5x.jpg 1.5x">
                    <source srcset="https://example.com/image-480.jpg?quality=80, /image-480-2x.jpg 2x">
                    <img src="/image-320.jpg">
                </picture>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(5);
            data[0].newRemote.should.eql('/image-320.jpg');
            data[1].newRemote.should.eql('https://example.com/image-768.jpg');
            data[2].newRemote.should.eql('/image-768-1.5x.jpg');
            data[3].newRemote.should.eql('https://example.com/image-480.jpg');
            data[4].newRemote.should.eql('/image-480-2x.jpg');
        });

        it('Will find attributes on video elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video poster="/images/poster.jpg" src="/flowers.mp4"></video>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(2);
            data[0].newRemote.should.eql('/images/poster.jpg');
            data[1].newRemote.should.eql('/flowers.mp4');
        });

        it('Will find attributes on video source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<video controls poster="/images/poster.jpg">
            <source src="/flowers.webm">
            <source src="/flowers.mp4">
            </video>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('/images/poster.jpg');
            data[1].newRemote.should.eql('/flowers.webm');
            data[2].newRemote.should.eql('/flowers.mp4');
        });

        it('Will find attributes on audio elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio src="/podcast.mp3"></audio>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(1);
            data[0].newRemote.should.eql('/podcast.mp3');
        });

        it('Will find attributes on audio source elements', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInHTML(`<audio controls>
            <source src="/podcast.mp3">
            <source src="/podcast.ogg">
            </audio>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(2);
            data[0].newRemote.should.eql('/podcast.mp3');
            data[1].newRemote.should.eql('/podcast.ogg');
        });
    }); // End HTML

    describe('Markdown', function () {
        it('Will find assets in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r![alt text](/Isolated.png "Title")\rHello [My document](https://example.com/my-document.pdf)`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot.png');
            data[1].newRemote.should.eql('/Isolated.png');
            data[2].newRemote.should.eql('https://example.com/my-document.pdf');
        });

        it('Will find HTML images in Markdown', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            assetScraper.findInMarkdown(`![Screenshot](__GHOST_URL__/content/images/2022/09/screenshot.png)\r<img src="https://example.com/my/image.jpg" /><a href="https://example.com/my-document.pdf">My document</a>`);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot.png');
            data[1].newRemote.should.eql('https://example.com/my/image.jpg');
            data[2].newRemote.should.eql('https://example.com/my-document.pdf');
        });
    }); // End Markdown

    describe('Mobiledoc objects', function () {
        it('Will find images in a Mobiledoc string', async function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledocObject = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"image\",{\"src\":\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png\",\"width\":1052,\"height\":804,\"caption\":\"A sunset photo\"}],[\"image\",{\"src\":\"https://images.unsplash.com/photo.jpg\",\"width\":5472,\"height\":3648,\"caption\":\"Photo by <a href=\\\"https://unsplash.com/@jonathanborba?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Jonathan Borba</a> / <a href=\\\"https://unsplash.com/?utm_source=ghost&utm_medium=referral&utm_campaign=api-credit\\\">Unsplash</a>\",\"alt\":\"\"}],[\"html\",{\"html\":\"<div class=\\\"photo\\\"><img src=\\\"__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png\\\" /></div>\"}],[\"markdown\",{\"markdown\":\"![Last sunset](__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png)\"}]],\"markups\":[],\"sections\":[[10,0],[1,\"p\",[[0,[],0,\"Test content\"]]],[10,1],[10,2],[1,\"p\",[[0,[],0,\"More test content\"]]],[10,3],[1,\"p\",[]]],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledocObject);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2022.png');
            data[1].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2023.png');
            data[2].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/screenshot-40-54-21-02-09-2024.png');
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

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/photo-1.jpg');
            data[1].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/photo-2.jpg');
            data[2].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/photo-3.jpg');
        });
    }); // End Mobiledoc objects

    describe('Mobiledoc strings', function () {
        it('Will find audio attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"audio\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/example.mp3\",\"title\":\"File example MP3 2MG\",\"duration\":52.819592,\"mimeType\":\"audio/mpeg\",\"thumbnailSrc\":\"__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(2);
            data[0].newRemote.should.eql('__GHOST_URL__/content/media/2022/09/example.mp3');
            data[1].newRemote.should.eql('__GHOST_URL__/content/media/2022/09/example_thumb.jpg?v=1664015621810');
        });

        it('Will find product attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[[\"soft-return\",\"\",{}]],\"cards\":[[\"product\",{\"productButtonEnabled\":true,\"productRatingEnabled\":true,\"productStarRating\":5,\"productImageSrc\":\"__GHOST_URL__/content/images/2022/07/product.png\",\"productTitle\":\"My title\",\"productDescription\":\"<p>The desc</p>\",\"productButton\":\"Btn text\",\"productUrl\":\"#url\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            // console.log(data);

            data.should.be.an.Array().with.lengthOf(1);
            data[0].newRemote.should.eql('__GHOST_URL__/content/images/2022/07/product.png');
        });

        it('Will find video attributes in a Mobiledoc string', function () {
            const assetScraper = new AssetScraper(mockFileCache);

            let mobiledoc = "{\"version\":\"0.3.1\",\"atoms\":[],\"cards\":[[\"video\",{\"loop\":false,\"src\":\"__GHOST_URL__/content/media/2022/09/video.mp4\",\"fileName\":\"video.mp4\",\"width\":640,\"height\":360,\"duration\":13.347,\"mimeType\":\"video/mp4\",\"thumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg\",\"thumbnailWidth\":640,\"thumbnailHeight\":360,\"customThumbnailSrc\":\"__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg\"}]],\"markups\":[],\"sections\":[],\"ghostVersion\":\"4.0\"}"; //eslint-disable-line quotes

            assetScraper.findInMobiledoc(mobiledoc);

            const data = assetScraper._foundAssets;

            data.should.be.an.Array().with.lengthOf(3);
            data[0].newRemote.should.eql('__GHOST_URL__/content/media/2022/09/video.mp4');
            data[1].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/video-thumbnail.jpg');
            data[2].newRemote.should.eql('__GHOST_URL__/content/images/2022/09/custom-thumbnail.jpeg');
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

            data.should.be.an.Array().with.lengthOf(6);
            data[0].newRemote.should.eql('https://mysite.com/images/feature.png');
            data[1].newRemote.should.eql('https://mysite.com/images/twitter.png');
            data[2].newRemote.should.eql('https://mysite.com/images/another-feature.png');
            data[3].newRemote.should.eql('__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-3.jpg');
            data[4].newRemote.should.eql('__GHOST_URL__/content/images/2021/11/cosySec-3-1024x558-2.jpg');
            data[5].newRemote.should.eql('__GHOST_URL__/content/images/2022/03/snippet-image.jpeg');
        });
    });
});
