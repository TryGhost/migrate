import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import * as cheerio from 'cheerio';
import process, {cleanExcerpt, slugFromURL, increaseImageSize, getAllAttributes} from '../lib/process.js';

const require = createRequire(import.meta.url);
const response = require('./fixtures/response.json');

describe('Utils', function () {
    it('cleanExcerpt', function () {
        const excerpt = cleanExcerpt('<div class="lorem" style="color: #f00;"><p><span style="font-weight: 400;">Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" style="color: blue;" rel="noreferrer" target="_blank">Dolor</a></span></div>');
        assert.equal(excerpt, 'Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" rel="noreferrer" target="_blank">Dolor</a>');
    });

    it('slugFromURL', function () {
        const slug = slugFromURL('http://example.blogspot.com/2017/06/ipsum.html');
        assert.equal(slug, 'ipsum');
    });

    it('increaseImageSize', function () {
        const image1 = increaseImageSize('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600/photo.jpg');
        const image2 = increaseImageSize('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600-h/photo.jpg');

        assert.equal(image1, 'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg');
        assert.equal(image2, 'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg');
    });

    it('getAllAttributes', function () {
        const $html = cheerio.load('<dib><img src="https://example.com" title="Image title" alt="Image alt" /></div>');
        const el = $html('img');
        const attrs = getAllAttributes(el[0]);

        assert.equal(attrs[0].name, 'src');
        assert.equal(attrs[0].value, 'https://example.com');
        assert.equal(attrs[1].name, 'title');
        assert.equal(attrs[1].value, 'Image title');
        assert.equal(attrs[2].name, 'alt');
        assert.equal(attrs[2].value, 'Image alt');
    });
});

describe('Process JSON', function () {
    it('Can process API response into compatible objects', async function () {
        const processed = await process.processPosts(response, {});
        const firstPost = processed[0];

        assert.equal(processed.length, 3);

        for (const key of ['url', 'data']) {
            assert.ok(key in firstPost);
        }
        for (const key of ['slug', 'title', 'status', 'published_at', 'created_at', 'updated_at', 'type', 'author', 'tags', 'html']) {
            assert.ok(key in firstPost.data);
        }
    });

    it('Can create tags', async function () {
        const post = await process.processPost(response[0], {});
        const tags = post.data.tags;

        assert.equal(tags.length, 5);

        for (const key of ['url', 'data']) {
            assert.ok(key in tags[0]);
        }
        for (const key of ['slug', 'name']) {
            assert.ok(key in tags[0].data);
        }

        assert.equal(tags[0].url, 'migrator-added-tag-books');
        assert.equal(tags[0].data.slug, 'books');
        assert.equal(tags[0].data.name, 'books');

        assert.equal(tags[1].url, 'migrator-added-tag-this-that');
        assert.equal(tags[1].data.slug, 'this-that');
        assert.equal(tags[1].data.name, 'This & That');

        assert.equal(tags[2].url, 'migrator-added-tag-good-bad');
        assert.equal(tags[2].data.slug, 'good-bad');
        assert.equal(tags[2].data.name, 'Good & Bad');

        assert.equal(tags[3].url, 'migrator-added-tag-site-id12345678');
        assert.equal(tags[3].data.slug, 'hash-blogger-site-12345678');
        assert.equal(tags[3].data.name, '#blogger-site-12345678');

        assert.equal(tags[4].url, 'migrator-added-tag');
        assert.equal(tags[4].data.slug, 'hash-blogger');
        assert.equal(tags[4].data.name, '#blogger');
    });

    it('Can create author', async function () {
        const post = await process.processPost(response[0], {});

        const author = post.data.author;

        for (const key of ['url', 'data']) {
            assert.ok(key in author);
        }
        for (const key of ['slug', 'email', 'name']) {
            assert.ok(key in author.data);
        }

        assert.equal(author.url, 'migrator-added-author-important-author-co');
        assert.equal(author.data.slug, 'important-author-co');
        assert.equal(author.data.email, 'important-author-co@example.com');
        assert.equal(author.data.name, 'Important Author & Co.');
    });
});

describe('Process HTML', function () {
    it('Can increase image sizes', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s1600-h/photo.jpg">'});

        assert.equal(processed.html, '<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s2000/photo.jpg">');
    });

    it('Can change divs to paragraphs', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<div style="color: #232d32; font-family: Lato, sans-serif; font-size: 16px; line-height: 1.5; white-space: pre-line;">\nLorem ipsum dolor sit amet, consectetur adipiscing elit</div>'});

        assert.equal(processed.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p>');
    });

    it('Remove empty divs with no attributes', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<div></div><div>  </div><div class="hello"></div><div class="hello">   </div>'});

        assert.equal(processed.html, '<div class="hello"></div>\n<div class="hello">   </div>');
    });

    it('Can remove anchors that link to direct child image', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<a href="https://3.bp.blogspot.com/my-image.jpg"><img src="https://3.bp.blogspot.com/my-image.jpg"></a>'});

        assert.equal(processed.html, '<img src="https://3.bp.blogspot.com/my-image.jpg">');
    });

    it('Can remove the first element if a <hr>', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<hr><p>My text</p>'});

        assert.equal(processed.html, '<p>My text</p>');
    });

    it('Can remove the first elements if multiple <hr>', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<hr><hr><hr><p>My text</p>'});

        assert.equal(processed.html, '<p>My text</p>');
    });

    it('Can convert to unordered list', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: `<div>My text</div><li>Lorem</li><li>Ipsum</li><li>Dolor</li><div><br /></div><div>My other text</div><div><br /></div>`});

        assert.equal(processed.html, '<p>My text</p>\n<ul><li>Lorem</li><li>Ipsum</li><li>Dolor</li></ul>\n\n\n\n<p>My other text</p>');
    });

    it('Can unwrap linked image tables', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1280/image.png" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'});

        assert.equal(processed.html, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>');
    });

    it('Can unwrap unlinked image tables', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto; text-align: center;"><tbody><tr><td style="text-align: center;"><img border="0" data-original-height="572" data-original-width="1000" height="227" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" style="margin-left: auto; margin-right: auto;" width="400" /></td></tr><tr><td class="tr-caption" style="text-align: center;"><div style="text-align: center;">Image caption</div></td></tr></tbody></table>'});

        assert.equal(processed.html, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>');
    });

    it('Can unwrap image tables & maintain links', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://ghost.org" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'});

        assert.equal(processed.html, '<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://ghost.org"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"></a><figcaption>Image caption</figcaption></figure>');
    });

    it('Can use first image as featured image (type 1)', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {firstImageAsFeatured: true}, html: `<p style="text-align: center;">&nbsp;</p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="720" data-original-width="1280" height="301" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="481" /></a></div><br /><p></p><h3 style="text-align: left;"><b>My headline</b></h3>`});

        assert.equal(processed.feature_image, 'https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png');
        assert.equal(processed.html, '<h3>My headline</h3>');
    });

    it('Can use first image as featured image (type 2)', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {firstImageAsFeatured: true}, html: `<p style="text-align: center;"><br /></p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="900" data-original-width="1200" height="382" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="509" /></a></div><p></p><h2 style="text-align: left;">Headline</h2>`});

        assert.equal(processed.feature_image, 'https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png');
        assert.equal(processed.html, '<h2>Headline</h2>');
    });
});
