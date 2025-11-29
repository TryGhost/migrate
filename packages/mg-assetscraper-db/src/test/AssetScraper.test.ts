import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import fs, {chownSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import nock from 'nock';
import {makeTaskRunner} from '@tryghost/listr-smart-renderer';
import fsUtils from '@tryghost/mg-fs-utils';
import AssetScraper from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

describe('Asset Scraper', () => {
    let fileCache: any;
    let jpgImageBuffer: Buffer;

    // Test helpers
    async function createScraper(options: any = {}, ctx: any = {}) {
        const defaultOptions = {domains: ['https://example.com']};
        const scraper = new AssetScraper(fileCache, {...defaultOptions, ...options}, ctx);
        await scraper.init();
        return scraper;
    }

    function mockImage(path = '/image.jpg', buffer?: Buffer) {
        return nock('https://example.com').get(path).reply(200, buffer || jpgImageBuffer);
    }
    let avifImageBuffer: Buffer;
    let heicImageBuffer: Buffer;
    let mp4VideoBuffer: Buffer;
    let mp3AudioBuffer: Buffer;

    beforeAll(async () => {
        jpgImageBuffer = await readFile(join(fixturesPath, '/image.jpg'));
        avifImageBuffer = await readFile(join(fixturesPath, '/image.avif'));
        heicImageBuffer = await readFile(join(fixturesPath, '/image.heic'));
        mp4VideoBuffer = await readFile(join(fixturesPath, '/video.mp4'));
        mp3AudioBuffer = await readFile(join(fixturesPath, '/audio.mp3'));
    });

    beforeEach(async () => {
        fileCache = new fsUtils.FileCache('assetscraper-tests');
    });

    afterEach(async () => {
        await fileCache.emptyCurrentCacheDir();
    });

    it('Runs tasks for a whole file', async () => {
        const requestMock = nock('https://example.com')
            .get('/image.jpg')
            .reply(200, jpgImageBuffer);

        const options = {
            domains: [
                'https://example.com'
            ]
        };
        const ctx: any = {
            posts: [
                {
                    id: 123,
                    lexical: '{"root":{"children":[{"type":"image","version":1,"src":"https://example.com/image.jpg","width":1480,"height":486,"title":"","alt":"","caption":"","cardWidth":"regular","href":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
                }
            ],
            posts_meta: [
                {
                    id: 123,
                    og_image: 'https://example.com/image.jpg',
                    twitter_image: 'https://example.com/image.jpg'
                }
            ],
            tags: [
                {
                    id: 123,
                    feature_image: 'https://example.com/image.jpg',
                    og_image: 'https://example.com/image.jpg',
                    twitter_image: 'https://example.com/image.jpg',
                    codeinjection_head: '<style>.block {background: url(https://example.com/image.jpg);}</style>',
                    codeinjection_foot: '<style>.block {background: url(https://example.com/image.jpg);}</style>'
                }
            ],
            users: [
                {
                    id: 123,
                    profile_image: 'https://example.com/image.jpg',
                    cover_image: 'https://example.com/image.jpg'
                }
            ],
            settings: [
                {
                    key: 'og_image',
                    value: 'https://example.com/image.jpg'
                },
                {
                    key: 'twitter_image',
                    value: 'https://example.com/image.jpg'
                },
                {
                    key: 'codeinjection_head',
                    value: '<style>.block {background: url(https://example.com/image.jpg);}</style>'
                },
                {
                    key: 'codeinjection_foot',
                    value: '<style>.block {background: url(https://example.com/image.jpg);}</style>'
                }
            ]
        };

        const assetScraper = new AssetScraper(fileCache, options, ctx);
        await assetScraper.init();
        const tasks = assetScraper.getTasks();

        const taskRunner = makeTaskRunner(tasks, {renderer: 'silent', concurrent: false, topLevel: true});
        await taskRunner.run();

        assert.ok(requestMock.isDone());
        assert.deepEqual(ctx, {
            posts: [
                {
                    id: 123,
                    lexical: '{"root":{"children":[{"type":"image","version":1,"src":"__GHOST_URL__/content/images/example-com/image.jpg","width":1480,"height":486,"title":"","alt":"","caption":"","cardWidth":"regular","href":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
                }
            ],
            posts_meta: [
                {
                    id: 123,
                    og_image: '__GHOST_URL__/content/images/example-com/image.jpg',
                    twitter_image: '__GHOST_URL__/content/images/example-com/image.jpg'
                }
            ],
            tags: [
                {
                    id: 123,
                    feature_image: '__GHOST_URL__/content/images/example-com/image.jpg',
                    og_image: '__GHOST_URL__/content/images/example-com/image.jpg',
                    twitter_image: '__GHOST_URL__/content/images/example-com/image.jpg',
                    codeinjection_head: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>',
                    codeinjection_foot: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>'
                }
            ],
            users: [
                {
                    id: 123,
                    profile_image: '__GHOST_URL__/content/images/example-com/image.jpg',
                    cover_image: '__GHOST_URL__/content/images/example-com/image.jpg'
                }
            ],
            settings: [
                {
                    key: 'og_image',
                    value: '__GHOST_URL__/content/images/example-com/image.jpg'
                },
                {
                    key: 'twitter_image',
                    value: '__GHOST_URL__/content/images/example-com/image.jpg'
                },
                {
                    key: 'codeinjection_head',
                    value: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>'
                },
                {
                    key: 'codeinjection_foot',
                    value: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>'
                }
            ]
        });
    });

    it('Finds in Lexical', async () => {
        const requestMock = mockImage();
        const postObj = {
            id: 123,
            lexical: '{"root":{"children":[{"type":"image","version":1,"src":"https://example.com/image.jpg","width":322,"height":272,"title":"","alt":"","caption":"","cardWidth":"regular","href":""},{"type":"image","version":1,"src":"https://example.com/image.jpg","width":322,"height":272,"title":"","alt":"","caption":"","cardWidth":"regular","href":""},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
        };

        const assetScraper = await createScraper({domains: ['https://example.com', 'https://video-service.com']});
        await assetScraper.inlinePostTagUserObject(postObj);

        assert.equal(postObj.lexical, '{"root":{"children":[{"type":"image","version":1,"src":"__GHOST_URL__/content/images/example-com/image.jpg","width":322,"height":272,"title":"","alt":"","caption":"","cardWidth":"regular","href":""},{"type":"image","version":1,"src":"__GHOST_URL__/content/images/example-com/image.jpg","width":322,"height":272,"title":"","alt":"","caption":"","cardWidth":"regular","href":""},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}');
        assert.ok(requestMock.isDone());
    });

    it('Finds in a Lexical HTML card', async () => {
        const requestMock = mockImage();
        const postObj = {
            id: 123,
            lexical: '{"root":{"children":[{"type":"html","version":1,"html":"<a href="https://example.com/image.jpg">Image</a><img src="https://example.com/image.jpg" /><img data-src="https://example.com/image.jpg" /><picture><source srcset="https://example.com/image.jpg, https://example.com/image.jpg 1.5x"><source srcset="https://example.com/image.jpg, https://example.com/image.jpg 2x"><img src="https://example.com/image.jpg"></picture><video poster="https://example.com/image.jpg" src="https://example.com/image.jpg"></video><video"><source src="https://example.com/image.jpg"><source src="https://example.com/image.jpg"></video><audio src="https://example.com/image.jpg"></audio><audio><source src="https://example.com/image.jpg"><source src="https://example.com/image.jpg"></audio><p style="background: url(https://example.com/image.jpg);"></p><p style="background: url(\'https://example.com/image.jpg\');"></p><p style="background-image: url(https://example.com/image.jpg);"></p><p style="background-image: url(\'https://example.com/image.jpg\');"></p>","visibility":{"showOnEmail":true,"showOnWeb":true,"segment":""}},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(postObj);

        assert.ok(requestMock.isDone());
        assert.equal(postObj.lexical, `{"root":{"children":[{"type":"html","version":1,"html":"<a href="__GHOST_URL__/content/images/example-com/image.jpg">Image</a><img src="__GHOST_URL__/content/images/example-com/image.jpg" /><img data-src="__GHOST_URL__/content/images/example-com/image.jpg" /><picture><source srcset="__GHOST_URL__/content/images/example-com/image.jpg, __GHOST_URL__/content/images/example-com/image.jpg 1.5x"><source srcset="__GHOST_URL__/content/images/example-com/image.jpg, __GHOST_URL__/content/images/example-com/image.jpg 2x"><img src="__GHOST_URL__/content/images/example-com/image.jpg"></picture><video poster="__GHOST_URL__/content/images/example-com/image.jpg" src="__GHOST_URL__/content/images/example-com/image.jpg"></video><video"><source src="__GHOST_URL__/content/images/example-com/image.jpg"><source src="__GHOST_URL__/content/images/example-com/image.jpg"></video><audio src="__GHOST_URL__/content/images/example-com/image.jpg"></audio><audio><source src="__GHOST_URL__/content/images/example-com/image.jpg"><source src="__GHOST_URL__/content/images/example-com/image.jpg"></audio><p style="background: url(__GHOST_URL__/content/images/example-com/image.jpg);"></p><p style="background: url('__GHOST_URL__/content/images/example-com/image.jpg');"></p><p style="background-image: url(__GHOST_URL__/content/images/example-com/image.jpg);"></p><p style="background-image: url('__GHOST_URL__/content/images/example-com/image.jpg');"></p>","visibility":{"showOnEmail":true,"showOnWeb":true,"segment":""}},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}`);
    });

    it('Finds in a Lexical Markdown card', async () => {
        const requestMock = mockImage();
        const postObj = {
            id: 123,
            lexical: '{"root":{"children":[{"type":"markdown","version":1,"markdown":"[Image](https://example.com/image.jpg)\n![](https://example.com/image.jpg)\n<a href="https://example.com/image.jpg">Image</a>\n<img src="https://example.com/image.jpg" />"},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(postObj);

        assert.ok(requestMock.isDone());
        assert.equal(postObj.lexical, '{"root":{"children":[{"type":"markdown","version":1,"markdown":"[Image](__GHOST_URL__/content/images/example-com/image.jpg)\n![](__GHOST_URL__/content/images/example-com/image.jpg)\n<a href="__GHOST_URL__/content/images/example-com/image.jpg">Image</a>\n<img src="__GHOST_URL__/content/images/example-com/image.jpg" />"},{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1}],"direction":null,"format":"","indent":0,"type":"root","version":1}}');
    });

    it('Does other post object', async () => {
        const requestMock = nock('https://example.com')
            .get('/image.jpg').reply(200, jpgImageBuffer)
            .get('/other.jpg').reply(200, jpgImageBuffer);

        const postObj = {
            feature_image: 'https://example.com/image.jpg',
            codeinjection_head: '<style>.block {background: url(https://example.com/other.jpg);}</style>'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(postObj);

        assert.ok(requestMock.isDone());
        assert.equal(postObj.feature_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(postObj.codeinjection_head, '<style>.block {background: url(__GHOST_URL__/content/images/example-com/other.jpg);}</style>');
    });

    it('Does post meta', async () => {
        const requestMock = mockImage();
        const postObj = {
            id: 123,
            og_image: 'https://example.com/image.jpg',
            twitter_image: 'https://example.com/image.jpg'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(postObj);

        assert.ok(requestMock.isDone());
        assert.equal(postObj.og_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(postObj.twitter_image, '__GHOST_URL__/content/images/example-com/image.jpg');
    });

    it('Does users', async () => {
        const requestMock = mockImage();
        const usersObj = {
            id: 123,
            profile_image: 'https://example.com/image.jpg',
            cover_image: 'https://example.com/image.jpg'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(usersObj);

        assert.ok(requestMock.isDone());
        assert.equal(usersObj.profile_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(usersObj.cover_image, '__GHOST_URL__/content/images/example-com/image.jpg');
    });

    it('Does tags', async () => {
        const requestMock = mockImage();
        const tagsObj = {
            id: 123,
            feature_image: 'https://example.com/image.jpg',
            og_image: 'https://example.com/image.jpg',
            twitter_image: 'https://example.com/image.jpg',
            codeinjection_head: '<style>.block {background: url(https://example.com/image.jpg);}</style>',
            codeinjection_foot: '<style>.block {background: url(https://example.com/image.jpg);}</style>'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(tagsObj);

        assert.ok(requestMock.isDone());
        assert.equal(tagsObj.feature_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(tagsObj.og_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(tagsObj.twitter_image, '__GHOST_URL__/content/images/example-com/image.jpg');
        assert.equal(tagsObj.codeinjection_head, '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>');
        assert.equal(tagsObj.codeinjection_foot, '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>');
    });

    it('Does settings', async () => {
        const requestMock = mockImage();
        const settingsObj = [
            {key: 'codeinjection_head', value: '<style>.block {background: url(https://example.com/image.jpg);}</style>'},
            {key: 'codeinjection_foot', value: '<style>.block {background: url(https://example.com/image.jpg);}</style>'},
            {key: 'og_image', value: 'https://example.com/image.jpg'},
            {key: 'twitter_image', value: 'https://example.com/image.jpg'}
        ];

        const assetScraper = await createScraper();
        await assetScraper.doSettingsObject(settingsObj);

        assert.ok(requestMock.isDone());
        assert.deepEqual(settingsObj, [
            {key: 'codeinjection_head', value: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>'},
            {key: 'codeinjection_foot', value: '<style>.block {background: url(__GHOST_URL__/content/images/example-com/image.jpg);}</style>'},
            {key: 'og_image', value: '__GHOST_URL__/content/images/example-com/image.jpg'},
            {key: 'twitter_image', value: '__GHOST_URL__/content/images/example-com/image.jpg'}
        ]);
    });

    it('Does newsletter settings', async () => {
        const requestMock = mockImage('/header.jpg');
        const newslettersObj = [{header_image: 'https://example.com/header.jpg'}];

        const assetScraper = await createScraper();
        await assetScraper.doNewslettersObject(newslettersObj);

        assert.ok(requestMock.isDone());
        assert.equal(newslettersObj[0].header_image, '__GHOST_URL__/content/images/example-com/header.jpg');
    });

    it('Does custom theme settings', async () => {
        const requestMock = mockImage('/logo.jpg');
        const settingsObj = [{
            id: '123456783969a0004d9d3722',
            theme: 'dawn',
            key: 'white_logo_for_dark_mode',
            type: 'image',
            value: '__GHOST_URL__/logo.jpg'
        }];

        const assetScraper = await createScraper({baseUrl: 'https://example.com'});
        await assetScraper.doCustomThemeSettingsObject(settingsObj);

        assert.ok(requestMock.isDone());
        assert.equal(settingsObj[0].value, '__GHOST_URL__/content/images/example-com/logo.jpg');
    });

    it('Does snippets', async () => {
        const requestMock = mockImage();
        const snippetObj = {
            id: '6238521c2b4615001234abcd',
            name: 'My Image Snippet',
            mobiledoc: '{"version":"0.3.2","atoms":[],"cards":[["image",{"src":"https://example.com/image.jpg","width":367,"height":790}]],"markups":[],"sections":[[10,0]]}',
            created_at: '2022-03-21T10:23:24.000Z',
            updated_at: '2023-06-07T10:37:07.000Z',
            lexical: '{"namespace":"KoenigEditor","nodes":[{"type":"image","src":"https://example.com/image.jpg","width":367,"height":790}],"syncedAt":"2023-06-07T10:37:07.233Z"}'
        };

        const assetScraper = await createScraper();
        await assetScraper.inlinePostTagUserObject(snippetObj);

        assert.ok(requestMock.isDone());
        assert.equal(snippetObj.lexical, '{"namespace":"KoenigEditor","nodes":[{"type":"image","src":"__GHOST_URL__/content/images/example-com/image.jpg","width":367,"height":790}],"syncedAt":"2023-06-07T10:37:07.233Z"}');
    });

    describe('File name handling', () => {
        it('Handles extension change by supplying a new extension', async () => {
            const assetScraper = await createScraper({});

            let result = await assetScraper.resolveFileName('https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F3daf5acd-abcd-1234-efgh-56784b5435ef_3024x4032.heic', 'images', '.webp');

            assert.equal(result.filename, 'substackcdn-com/image/fetch/f_auto-q_auto-good-fl_progressive-steep/https-/substack-post-media-s3-amazonaws-com/public/images/3daf5acd-abcd-1234-efgh-56784b5435ef_3024x4032.webp');
            assert.equal(result.outputPath, '/content/images/substackcdn-com/image/fetch/f_auto-q_auto-good-fl_progressive-steep/https-/substack-post-media-s3-amazonaws-com/public/images/3daf5acd-abcd-1234-efgh-56784b5435ef_3024x4032.webp');
        });

        it('Handles extension change with query params', async () => {
            const assetScraper = await createScraper({});

            let result = await assetScraper.resolveFileName('https://example.com/path/to/photo.jpg?w=100&h=100', 'images', '.webp');

            assert.equal(result.filename, 'example-com/path/to/photo-w-100-h-100.webp');
            assert.equal(result.outputPath, '/content/images/example-com/path/to/photo-w-100-h-100.webp');
        });

        it('Moves query params before extension', async () => {
            const assetScraper = await createScraper({});

            let result = await assetScraper.resolveFileName('https://example.com/path/to/photo.jpg?w=100&h=100', 'images');

            assert.equal(result.filename, 'example-com/path/to/photo-w-100-h-100.jpg');
            assert.equal(result.outputPath, '/content/images/example-com/path/to/photo-w-100-h-100.jpg');
        });

        it('Moves query params and hash before extension', async () => {
            const assetScraper = await createScraper({});

            let result = await assetScraper.resolveFileName('https://i0.wp.com/abcd1234.example.com/wp/2022/06/1234_photo-01.jpg?ssl=1&w=200#anchor', 'images');

            assert.equal(result.filename, 'i0-wp-com/abcd1234-example-com/wp/2022/06/1234_photo-01-ssl-1-w-200-anchor.jpg');
            assert.equal(result.outputPath, '/content/images/i0-wp-com/abcd1234-example-com/wp/2022/06/1234_photo-01-ssl-1-w-200-anchor.jpg');
        });

        it('Converts ? into slash', async () => {
            const assetScraper = await createScraper({});

            const result = await assetScraper.resolveFileName('https://example.com/wp-content/uploads/2022/08/fdda1c2647f448219b8abb28a3892df6.jpg?imageView2/1/w/1080/h/720/format/jpg', 'images');

            assert.equal(result.filename, 'example-com/wp-content/uploads/2022/08/fdda1c2647f448219b8abb28a3892df6/imageView2/1/w/1080/h/720/format-imageview2-1-w-1080-h-720-format.jpg');
        });

        it('Moves hash before extension', async () => {
            const assetScraper = await createScraper({});

            let result = await assetScraper.resolveFileName('https://example.com/path/to/photo.jpg#lorem=ipsum', 'images');

            assert.equal(result.filename, 'example-com/path/to/photo-lorem-ipsum.jpg');
        });

        it('Will transform relative to absolute', async () => {
            const assetScraper = await createScraper({baseUrl: 'https://example.com'});

            const result = await assetScraper.normalizeUrl('/content/images/photo.jpg');

            assert.equal(result, 'https://example.com/content/images/photo.jpg');
        });

        it('Will transform protocolless to absolute', async () => {
            const assetScraper = await createScraper({baseUrl: 'https://example.com'});

            const result = await assetScraper.normalizeUrl('//example.com/content/images/photo.jpg');

            assert.equal(result, 'https://example.com/content/images/photo.jpg');
        });

        it('Will transform __GHOST_URL__ to absolute', async () => {
            const assetScraper = await createScraper({baseUrl: 'https://example.com'});

            const result = await assetScraper.normalizeUrl('__GHOST_URL__/content/images/photo.jpg');

            assert.equal(result, 'https://example.com/content/images/photo.jpg');
        });

        it('Will transform __GHOST_URL__ to absolute with a sub domain', async () => {
            const assetScraper = await createScraper({baseUrl: 'https://sub.example.com'});

            const result = await assetScraper.normalizeUrl('__GHOST_URL__/content/images/photo.jpg');

            assert.equal(result, 'https://sub.example.com/content/images/photo.jpg');
        });

        it('Will transform __GHOST_URL__ to absolute with a subdirectory', async () => {
            const assetScraper = await createScraper({baseUrl: 'https://example.com/dir/'});

            const result = await assetScraper.normalizeUrl('__GHOST_URL__/content/images/photo.jpg');

            assert.equal(result, 'https://example.com/dir/content/images/photo.jpg');
        });

        it('Accepts URls with encoded characters', async () => {
            const assetScraper = await createScraper({});

            const result = await assetScraper.resolveFileName('https://example.com/path/to/你好.jpg', 'images');

            assert.equal(result.filename, 'example-com/path/to/ni_hao.jpg');
        });

        it.todo('test replaceSrc else');
    });

    describe('Local file system', () => {
        it.todo('test storeMediaLocally to return null if no media or mime');
        it.todo('test storeMediaLocally to set `folder` if matches files mime');
        it.todo('test storeMediaLocally to return null if no folder set');
    });

    describe('Fetching methods', () => {
        it('getRemoteMedia', async () => {
            const requestMock = nock('https://example.com')
                .get('/image.jpg')
                .replyWithError('a bad thing happened');

            const assetScraper = await createScraper({});

            await assert.rejects(
                async () => {
                    await assetScraper.getRemoteMedia('https://example.com/image.jpg');
                },
                {
                    name: 'InternalServerError',
                    message: 'Failed to get remote media'
                }
            );
            assert.ok(requestMock.isDone());
        });

        it('extractFileDataFromResponse', async () => {
            const requestMock = mockImage();
            const assetScraper = await createScraper({});

            const response = await assetScraper.getRemoteMedia('https://example.com/image.jpg');
            const responseData: any = await assetScraper.extractFileDataFromResponse('https://example.com/image.jpg', response);

            assert.ok(requestMock.isDone());
            assert.equal(responseData.fileBuffer.constructor.name, 'Buffer');
            assert.equal(responseData.fileName, 'image.jpg');
            assert.equal(responseData.fileMime, 'image/jpeg');
            assert.equal(responseData.extension, '.jpg');
        });

        it('extractFileDataFromResponse avif to webp', async () => {
            const requestMock = nock('https://example.com')
                .get('/assets/2025/03/photo.avif')
                .reply(200, avifImageBuffer);

            const assetScraper = await createScraper({});

            const response = await assetScraper.getRemoteMedia('https://example.com/assets/2025/03/photo.avif');
            const responseData: any = await assetScraper.extractFileDataFromResponse('https://example.com/assets/2025/03/photo.avif', response);

            assert.ok(requestMock.isDone());
            assert.equal(responseData.fileBuffer.constructor.name, 'Buffer');
            assert.equal(responseData.fileName, 'photo.webp');
            assert.equal(responseData.fileMime, 'image/webp');
            assert.equal(responseData.extension, '.webp');
        });

        it('extractFileDataFromResponse heic to jpg', async () => {
            const requestMock = nock('https://example.com')
                .get('/assets/2025/03/photo.heic')
                .reply(200, heicImageBuffer);

            const assetScraper = await createScraper({});

            const response = await assetScraper.getRemoteMedia('https://example.com/assets/2025/03/photo.heic');
            const responseData: any = await assetScraper.extractFileDataFromResponse('https://example.com/assets/2025/03/photo.heic', response);

            assert.ok(requestMock.isDone());
            assert.equal(responseData.fileBuffer.constructor.name, 'Buffer');
            assert.equal(responseData.fileName, 'photo.jpg');
            assert.equal(responseData.fileMime, 'image/jpeg');
            assert.equal(responseData.extension, '.jpg');
        });

        it.todo('Will follow redirects');
        it.todo('test extractFileDataFromResponse to get data from the header is buffer fails');
        it.todo('test extractFileDataFromResponse to return null if no extension or mime');
        it.todo('test downloadExtractSave if no response');
        it.todo('test downloadExtractSave if no file path');
    });

    describe('Finds in Post HTML', () => {
        it('a href', async () => {
            const requestMock = mockImage();
            const postObj = {html: '<a href="https://example.com/image.jpg">Image</a>'};

            const assetScraper = await createScraper({domains: ['https://example.com', 'https://video-service.com']});
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<a href="__GHOST_URL__/content/images/example-com/image.jpg">Image</a>');
            assert.ok(requestMock.isDone());
        });

        it('img src', async () => {
            const requestMock = mockImage();
            const postObj = {html: '<img src="https://example.com/image.jpg" />'};

            const assetScraper = await createScraper({domains: ['https://example.com', 'https://video-service.com']});
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<img src="__GHOST_URL__/content/images/example-com/image.jpg" />');
            assert.ok(requestMock.isDone());
        });

        it('img data-src', async () => {
            const requestMock = mockImage();
            const postObj = {html: '<img data-src="https://example.com/image.jpg" />'};

            const assetScraper = await createScraper({domains: ['https://example.com', 'https://video-service.com']});
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<img data-src="__GHOST_URL__/content/images/example-com/image.jpg" />');
            assert.ok(requestMock.isDone());
        });

        it('picture source data-src', async () => {
            const requestMock = nock('https://example.com')
                .get('/image-768.jpg').reply(200, jpgImageBuffer)
                .get('/image-768-1.5x.jpg').reply(200, jpgImageBuffer)
                .get('/image-480.jpg').reply(200, jpgImageBuffer)
                .get('/image-480-2x.jpg').reply(200, jpgImageBuffer)
                .get('/image-320.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<picture><source srcset="https://example.com/image-768.jpg, https://example.com/image-768-1.5x.jpg 1.5x"><source srcset="https://example.com/image-480.jpg, https://example.com/image-480-2x.jpg 2x"><img src="https://example.com/image-320.jpg"></picture>'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<picture><source srcset="__GHOST_URL__/content/images/example-com/image-768.jpg, __GHOST_URL__/content/images/example-com/image-768-1-5x.jpg 1.5x"><source srcset="__GHOST_URL__/content/images/example-com/image-480.jpg, __GHOST_URL__/content/images/example-com/image-480-2x.jpg 2x"><img src="__GHOST_URL__/content/images/example-com/image-320.jpg"></picture>');
            assert.ok(requestMock.isDone());
        });

        it('video src & poster', async () => {
            const requestMock = nock('https://example.com')
                .get('/path/to/poster.jpg').reply(200, jpgImageBuffer)
                .get('/flowers.mp4').reply(200, mp4VideoBuffer);

            const postObj = {
                html: '<video poster="https://example.com/path/to/poster.jpg" src="https://example.com/flowers.mp4"></video>'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<video poster="__GHOST_URL__/content/images/example-com/path/to/poster.jpg" src="__GHOST_URL__/content/media/example-com/flowers.mp4"></video>');
            assert.ok(requestMock.isDone());
        });

        it('video source', async () => {
            const requestMock = nock('https://example.com')
                .get('/one.mp4').reply(200, mp4VideoBuffer)
                .get('/two.mp4').reply(200, mp4VideoBuffer);

            const postObj = {
                html: '<video"><source src="https://example.com/one.mp4"><source src="https://example.com/two.mp4"></video>'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<video"><source src="__GHOST_URL__/content/media/example-com/one.mp4"><source src="__GHOST_URL__/content/media/example-com/two.mp4"></video>');
            assert.ok(requestMock.isDone());
        });

        it('audio src', async () => {
            const requestMock = nock('https://example.com')
                .get('/podcast.mp3').reply(200, mp3AudioBuffer);

            const postObj = {html: '<audio src="https://example.com/podcast.mp3"></audio>'};

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<audio src="__GHOST_URL__/content/media/example-com/podcast.mp3"></audio>');
            assert.ok(requestMock.isDone());
        });

        it('audio source', async () => {
            const requestMock = nock('https://example.com')
                .get('/one.mp3').reply(200, mp3AudioBuffer)
                .get('/two.mp3').reply(200, mp3AudioBuffer);

            const postObj = {
                html: '<audio><source src="https://example.com/one.mp3"><source src="https://example.com/two.mp3"></audio>'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<audio><source src="__GHOST_URL__/content/media/example-com/one.mp3"><source src="__GHOST_URL__/content/media/example-com/two.mp3"></audio>');
            assert.ok(requestMock.isDone());
        });

        it('background', async () => {
            const requestMock = nock('https://example.com')
                .get('/image.jpg').reply(200, jpgImageBuffer)
                .get('/other.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<p style="background: url(https://example.com/image.jpg);"></p><p style="background: url(\'https://example.com/other.jpg\');"></p>'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, '<p style="background: url(__GHOST_URL__/content/images/example-com/image.jpg);"></p><p style="background: url(\'__GHOST_URL__/content/images/example-com/other.jpg\');"></p>');
            assert.ok(requestMock.isDone());
        });

        it('background-image', async () => {
            const requestMock = nock('https://example.com')
                .get('/image.jpg').reply(200, jpgImageBuffer)
                .get('/other.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: `<p style="background-image: url(https://example.com/image.jpg);"></p><p style="background-image: url('https://example.com/other.jpg');"></p>`
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, `<p style="background-image: url(__GHOST_URL__/content/images/example-com/image.jpg);"></p><p style="background-image: url('__GHOST_URL__/content/images/example-com/other.jpg');"></p>`);
            assert.ok(requestMock.isDone());
        });

        it('Does links in content', async () => {
            const requestMock = mockImage();
            const postObj = {
                html: `<a href="https://example.com/image.jpg">https://example.com/image.jpg</a>`
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.html, `<a href="__GHOST_URL__/content/images/example-com/image.jpg">__GHOST_URL__/content/images/example-com/image.jpg</a>`);
            assert.ok(requestMock.isDone());
        });
    });

    describe('Base64 image processing', () => {
        // Small 1x1 pixel PNG base64 image
        const base64PngImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
        // Small 1x1 pixel JPEG base64 image
        const base64JpgImage = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFwAAEQEBAAAAAAAAAAAAAAAAAAECA//EABUBAQEAAAAAAAAAAAAAAAAAAAAC/9oACAEBAAA/AI==';

        describe('findBase64ImagesInString', () => {
            it('finds single base64 image', async () => {
                const assetScraper = await createScraper({});

                const content = `<img src="${base64PngImage}" />`;
                const matches = await assetScraper.findBase64ImagesInString(content);

                assert.equal(matches.length, 1);
                assert.equal(matches[0], base64PngImage);
            });

            it('finds multiple base64 images', async () => {
                const assetScraper = await createScraper({});

                const content = `<img src="${base64PngImage}" /> <img src="${base64JpgImage}" />`;
                const matches = await assetScraper.findBase64ImagesInString(content);

                assert.equal(matches.length, 2);
                assert.equal(matches[0], base64PngImage);
                assert.equal(matches[1], base64JpgImage);
            });

            it('finds base64 images in various HTML contexts', async () => {
                const assetScraper = await createScraper({});
                const content = `
                    <img src="${base64PngImage}" />
                    <div style="background-image: url(${base64JpgImage});">
                    <a href="${base64PngImage}">Link</a>
                `;
                const matches = await assetScraper.findBase64ImagesInString(content);

                assert.equal(matches.length, 3);
            });

            it('finds base64 images in Lexical content', async () => {
                const assetScraper = await createScraper({});
                const lexicalContent = JSON.stringify({
                    root: {children: [{type: 'image', src: base64PngImage}]}
                });
                const matches = await assetScraper.findBase64ImagesInString(lexicalContent);

                assert.equal(matches.length, 1);
                assert.equal(matches[0], base64PngImage);
            });

            it('does not match non-base64 URLs', async () => {
                const assetScraper = await createScraper({});
                const content = '<img src="https://example.com/image.jpg" />';
                const matches = await assetScraper.findBase64ImagesInString(content);

                assert.equal(matches.length, 0);
            });
        });

        describe('extractFileDataFromBase64', () => {
            it('extracts PNG data from base64 data URI', async () => {
                const assetScraper = await createScraper({});
                const fileData = await assetScraper.extractFileDataFromBase64(base64PngImage);

                assert.ok(fileData);
                assert.ok(fileData.fileBuffer);
                assert.ok(fileData.fileName.includes('base64-'));
                assert.ok(fileData.fileName.endsWith('.png'));
                assert.equal(fileData.fileMime, 'image/png');
                assert.equal(fileData.extension, '.png');
            });

            it('extracts JPEG data from base64 data URI', async () => {
                const assetScraper = await createScraper({});
                const fileData = await assetScraper.extractFileDataFromBase64(base64JpgImage);

                assert.ok(fileData);
                assert.ok(fileData.fileBuffer);
                assert.ok(fileData.fileName.includes('base64-'));
                assert.ok(fileData.fileName.endsWith('.jpg'));
                assert.equal(fileData.fileMime, 'image/jpeg');
                assert.equal(fileData.extension, '.jpg');
            });

            it('returns null for invalid base64 data', async () => {
                const assetScraper = await createScraper({});
                const fileData = await assetScraper.extractFileDataFromBase64('not-a-data-uri');

                assert.equal(fileData, null);
            });

            it('returns null for non-image data URIs', async () => {
                const assetScraper = await createScraper({});
                const fileData = await assetScraper.extractFileDataFromBase64('data:text/plain;base64,SGVsbG8gV29ybGQh');

                assert.equal(fileData, null);
            });

            it('generates consistent filenames for same base64 data', async () => {
                const assetScraper = await createScraper({});
                const fileData1 = await assetScraper.extractFileDataFromBase64(base64PngImage);
                const fileData2 = await assetScraper.extractFileDataFromBase64(base64PngImage);

                assert.ok(fileData1);
                assert.ok(fileData2);
                assert.equal(fileData1.fileName, fileData2.fileName);
            });
        });

        describe('downloadExtractSaveBase64', () => {
            it('processes and saves base64 image', async () => {
                const assetScraper = await createScraper({});
                const content = `<img src="${base64PngImage}" />`;
                const result = await assetScraper.downloadExtractSaveBase64(base64PngImage, content);

                assert.ok(result.path.includes('/content/images/'));
                assert.ok(result.path.endsWith('.png'));
                assert.notEqual(result.content.indexOf(result.path), -1);
                assert.equal(result.content.indexOf(base64PngImage), -1);
            });

            it('uses cache for duplicate base64 images', async () => {
                const assetScraper = await createScraper({});
                const content1 = `<img src="${base64PngImage}" />`;
                const result1 = await assetScraper.downloadExtractSaveBase64(base64PngImage, content1);

                const content2 = `<img src="${base64PngImage}" />`;
                const result2 = await assetScraper.downloadExtractSaveBase64(base64PngImage, content2);

                assert.equal(result1.path, result2.path);
            });

            it('handles invalid base64 data gracefully', async () => {
                const assetScraper = await createScraper({});
                const invalidBase64 = 'data:image/png;invaliddata';
                const content = `<img src="${invalidBase64}" />`;
                const result = await assetScraper.downloadExtractSaveBase64(invalidBase64, content);

                assert.equal(result.path, invalidBase64); // Should return original data URI
                assert.equal(result.content, content); // Content should be unchanged
            });
        });

        describe('inlineContent with base64 images', () => {
            it('processes base64 images when processBase64Images is true', async () => {
                const assetScraper = await createScraper({processBase64Images: true});
                const content = `<img src="${base64PngImage}" />`;
                const result = await assetScraper.inlineContent(content);

                assert.notEqual(result.indexOf('__GHOST_URL__/content/images/'), -1);
                assert.equal(result.indexOf(base64PngImage), -1);
            });

            it('ignores base64 images when processBase64Images is false', async () => {
                const assetScraper = await createScraper({processBase64Images: false});
                const content = `<img src="${base64PngImage}" />`;
                const result = await assetScraper.inlineContent(content);

                assert.equal(result, content);
            });

            it('processes multiple base64 images in content', async () => {
                const assetScraper = await createScraper({processBase64Images: true});
                const content = `
                    <img src="${base64PngImage}" />
                    <img src="${base64JpgImage}" />
                `;
                const result = await assetScraper.inlineContent(content);

                assert.equal(result.match(/data:image/g), null);
                assert.equal(result.match(/__GHOST_URL__\/content\/images\//g)?.length, 2);
            });

            it('processes base64 images alongside regular URLs', async () => {
                const requestMock = mockImage('/regular.jpg');
                const assetScraper = await createScraper({processBase64Images: true});
                const content = `
                    <img src="${base64PngImage}" />
                    <img src="https://example.com/regular.jpg" />
                `;
                const result = await assetScraper.inlineContent(content);

                assert.ok(requestMock.isDone());
                assert.equal(result.match(/data:image/g), null); // No base64 images should remain
                assert.equal(result.match(/__GHOST_URL__\/content\/images\//g)?.length, 2); // Should have 2 local image paths
            });
        });
    });

    describe('findMatchesInString', () => {
        it('Handle complex URLs', async () => {
            const assetScraper = await createScraper();
            const matches = await assetScraper.findMatchesInString('<img src="https://example.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F62224b9e-abcd-1234-5678-abc1234efgh_4032x3024.heic" />');

            assert.equal(matches.length, 1);
            assert.equal(matches[0], 'https://example.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F62224b9e-abcd-1234-5678-abc1234efgh_4032x3024.heic');
        });

        it('Handle more complex URLs', async () => {
            const assetScraper = await createScraper();
            const matches = await assetScraper.findMatchesInString('<img src="https://example.com/image/fetch/h_600,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-1234-5678-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fe4f4ffa1-abcd-efgh-1234-7bb7221fd38f_750x424.jpeg" />');

            assert.equal(matches.length, 1);
            assert.equal(matches[0], 'https://example.com/image/fetch/h_600,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-1234-5678-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fe4f4ffa1-abcd-efgh-1234-7bb7221fd38f_750x424.jpeg');
        });

        it('Handle quotes around URLs', async () => {
            const assetScraper = await createScraper();
            const matches = await assetScraper.findMatchesInString('background: url(&quot;https://example.com/path/to/image-300x160.jpg&quot;);');

            assert.equal(matches.length, 1);
            assert.equal(matches[0], 'https://example.com/path/to/image-300x160.jpg');
        });

        it('Handle srcset', async () => {
            const assetScraper = await createScraper();
            const matches = await assetScraper.findMatchesInString('<img srcset="https://example.com/path/to/landscape-320w.jpg, https://example.com/path/to/landscape-480w.jpg 1.5x, https://example.com/path/to/landscape-640w.jpg 2x" src="https://example.com/path/to/landscape-640w.jpg" />');

            assert.equal(matches.length, 4);
            assert.equal(matches[0], 'https://example.com/path/to/landscape-320w.jpg');
            assert.equal(matches[1], 'https://example.com/path/to/landscape-480w.jpg');
            assert.equal(matches[2], 'https://example.com/path/to/landscape-640w.jpg');
            assert.equal(matches[3], 'https://example.com/path/to/landscape-640w.jpg');
        });
    });

    describe('Error handling', () => {
        it('continues processing when single image fails with multiple images', async () => {
            const requestMock = nock('https://example.com')
                .get('/working-image.jpg').reply(200, jpgImageBuffer)
                .get('/failing-image.jpg').replyWithError('Network error: Connection timeout')
                .get('/another-working.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://example.com/working-image.jpg" /><img src="https://example.com/failing-image.jpg" /><img src="https://example.com/another-working.jpg" />'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/example-com/working-image.jpg'));
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/example-com/another-working.jpg'));
            assert.ok(postObj.html.includes('https://example.com/failing-image.jpg'));
            assert.equal(assetScraper.failedDownloads.length, 1);
            assert.equal(assetScraper.failedDownloads[0].url, 'https://example.com/failing-image.jpg');
            assert.ok(assetScraper.failedDownloads[0].error.includes('Failed to get remote media'));
            assert.ok(requestMock.isDone());
        });

        it('handles all images failing gracefully', async () => {
            const requestMock = nock('https://example.com')
                .get('/image1.jpg').replyWithError('Network error')
                .get('/image2.jpg').replyWithError('Network error')
                .get('/image3.jpg').replyWithError('Network error');

            const postObj = {
                html: '<img src="https://example.com/image1.jpg" /><img src="https://example.com/image2.jpg" /><img src="https://example.com/image3.jpg" />'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(postObj.html.includes('https://example.com/image1.jpg'));
            assert.ok(postObj.html.includes('https://example.com/image2.jpg'));
            assert.ok(postObj.html.includes('https://example.com/image3.jpg'));
            assert.equal(assetScraper.failedDownloads.length, 3);
            assert.ok(requestMock.isDone());
        });

        it('handles mixed success and failure in Lexical content', async () => {
            const requestMock = nock('https://example.com')
                .get('/success.jpg').reply(200, jpgImageBuffer)
                .get('/failure.jpg').reply(500, 'Internal Server Error');

            const postObj = {
                id: 123,
                lexical: '{"root":{"children":[{"type":"image","src":"https://example.com/success.jpg"},{"type":"image","src":"https://example.com/failure.jpg"}]}}'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(postObj.lexical.includes('__GHOST_URL__/content/images/example-com/success.jpg'));
            assert.ok(postObj.lexical.includes('https://example.com/failure.jpg'));
            assert.equal(assetScraper.failedDownloads.length, 1);
            assert.equal(assetScraper.failedDownloads[0].url, 'https://example.com/failure.jpg');
            assert.ok(requestMock.isDone());
        });

        it('handles feature image failure without affecting other properties', async () => {
            const requestMock = nock('https://example.com')
                .get('/feature.jpg').replyWithError('Connection refused')
                .get('/content-image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                feature_image: 'https://example.com/feature.jpg',
                html: '<img src="https://example.com/content-image.jpg" />'
            };

            const assetScraper = await createScraper();
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.equal(postObj.feature_image, 'https://example.com/feature.jpg');
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/example-com/content-image.jpg'));
            assert.equal(assetScraper.failedDownloads.length, 1);
            assert.equal(assetScraper.failedDownloads[0].url, 'https://example.com/feature.jpg');
            assert.ok(requestMock.isDone());
        });

        it('uses cache for previously failed downloads', async () => {
            const requestMock = nock('https://example.com')
                .get('/cached-fail.jpg').replyWithError('First failure');

            const assetScraper = await createScraper();

            const postObj1 = {html: '<img src="https://example.com/cached-fail.jpg" />'};
            await assetScraper.inlinePostTagUserObject(postObj1);

            const postObj2 = {html: '<img src="https://example.com/cached-fail.jpg" />'};
            await assetScraper.inlinePostTagUserObject(postObj2);

            assert.equal(postObj1.html, '<img src="https://example.com/cached-fail.jpg" />');
            assert.equal(postObj2.html, '<img src="https://example.com/cached-fail.jpg" />');
            assert.equal(assetScraper.failedDownloads.length, 1);
            assert.ok(requestMock.isDone());
        });
    });

    describe('allowAllDomains mode', () => {
        it('scrapes URLs from any domain when allowAllDomains is true', async () => {
            const requestMock = nock('https://random-domain.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://random-domain.com/image.jpg" />'
            };

            const assetScraper = await createScraper({allowAllDomains: true, domains: []});
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/random-domain-com/image.jpg'));
        });

        it('scrapes URLs from multiple different domains', async () => {
            const requestMock = nock('https://domain-one.com')
                .get('/image1.jpg').reply(200, jpgImageBuffer);
            const requestMock2 = nock('https://domain-two.org')
                .get('/image2.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://domain-one.com/image1.jpg" /><img src="https://domain-two.org/image2.jpg" />'
            };

            const assetScraper = await createScraper({allowAllDomains: true, domains: []});
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(requestMock2.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/domain-one-com/image1.jpg'));
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/domain-two-org/image2.jpg'));
        });

        it('blocks URLs from blockedDomains', async () => {
            const requestMock = nock('https://allowed-domain.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://allowed-domain.com/image.jpg" /><img src="https://blocked-domain.com/blocked.jpg" />'
            };

            const assetScraper = await createScraper({
                allowAllDomains: true,
                blockedDomains: ['https://blocked-domain.com']
            });
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/allowed-domain-com/image.jpg'));
            assert.ok(postObj.html.includes('https://blocked-domain.com/blocked.jpg')); // Blocked URL should remain unchanged
        });

        it('blocks multiple domains from blockedDomains', async () => {
            const requestMock = nock('https://good-domain.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://good-domain.com/image.jpg" /><img src="https://blocked-one.com/a.jpg" /><img src="https://blocked-two.com/b.jpg" />'
            };

            const assetScraper = await createScraper({
                allowAllDomains: true,
                blockedDomains: ['https://blocked-one.com', 'https://blocked-two.com']
            });
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/good-domain-com/image.jpg'));
            assert.ok(postObj.html.includes('https://blocked-one.com/a.jpg')); // Blocked
            assert.ok(postObj.html.includes('https://blocked-two.com/b.jpg')); // Blocked
        });

        it('uses exact domain matching (subdomains are not blocked)', async () => {
            const requestMock = nock('https://sub.blocked-domain.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://sub.blocked-domain.com/image.jpg" />'
            };

            const assetScraper = await createScraper({
                allowAllDomains: true,
                blockedDomains: ['https://blocked-domain.com'] // Only exact match blocked
            });
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            // Subdomain should NOT be blocked
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/sub-blocked-domain-com/image.jpg'));
        });

        it('ignores domains option when allowAllDomains is true', async () => {
            const requestMock = nock('https://other-domain.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://other-domain.com/image.jpg" />'
            };

            // domains is set but should be ignored when allowAllDomains is true
            const assetScraper = await createScraper({
                allowAllDomains: true,
                domains: ['https://example.com']
            });
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/other-domain-com/image.jpg'));
        });

        it('defaults to false for allowAllDomains (backwards compatibility)', async () => {
            // When allowAllDomains is not specified, it should default to false
            // meaning only URLs from the domains list are scraped
            const postObj = {
                html: '<img src="https://random-domain.com/image.jpg" />'
            };

            const assetScraper = await createScraper({domains: ['https://example.com']});
            await assetScraper.inlinePostTagUserObject(postObj);

            // URL should remain unchanged since random-domain.com is not in domains list
            assert.ok(postObj.html.includes('https://random-domain.com/image.jpg'));
        });

        it('handles blockedDomains with paths (extracts hostname only)', async () => {
            const requestMock = nock('https://allowed.com')
                .get('/image.jpg').reply(200, jpgImageBuffer);

            const postObj = {
                html: '<img src="https://allowed.com/image.jpg" /><img src="https://blocked.com/some/path/image.jpg" />'
            };

            // Blocklist URL has a path, but we should extract hostname for comparison
            const assetScraper = await createScraper({
                allowAllDomains: true,
                blockedDomains: ['https://blocked.com/different/path']
            });
            await assetScraper.inlinePostTagUserObject(postObj);

            assert.ok(requestMock.isDone());
            assert.ok(postObj.html.includes('__GHOST_URL__/content/images/allowed-com/image.jpg'));
            assert.ok(postObj.html.includes('https://blocked.com/some/path/image.jpg')); // Blocked by hostname
        });

        it('works with findMatchesInString directly', async () => {
            const assetScraper = await createScraper({
                allowAllDomains: true,
                blockedDomains: ['https://blocked.com']
            });

            const matches = await assetScraper.findMatchesInString(
                '<img src="https://allowed.com/a.jpg" /><img src="https://blocked.com/b.jpg" /><img src="https://another.org/c.jpg" />'
            );

            assert.equal(matches.length, 2);
            assert.ok(matches.includes('https://allowed.com/a.jpg'));
            assert.ok(matches.includes('https://another.org/c.jpg'));
            assert.ok(!matches.includes('https://blocked.com/b.jpg'));
        });
    });

    /**
     * [ ] Finds all images in listed object names (settings, post HTML, Lexical - don't support Mobiledoc)
     * [ ] Can add allowed domains=
     * [ ] Will skip if the file size is too big
     * [ ] Will follow redirects
     * [ ] Will skip blocked file types (e.g. .html)
     */
});
