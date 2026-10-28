import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {cleanExcerpt, slugFromURL, increaseImageSize, processHTMLContent} from '../lib/process.js';

describe('Utils', function () {
    it('cleanExcerpt', function () {
        const excerpt = cleanExcerpt(
            '<div class="lorem" style="color: #f00;"><p><span style="font-weight: 400;">Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" style="color: blue;" rel="noreferrer" target="_blank">Dolor</a></span></div>'
        );
        assert.equal(
            excerpt,
            'Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" rel="noreferrer" target="_blank">Dolor</a>'
        );
    });

    it('slugFromURL', function () {
        const slug = slugFromURL('http://example.blogspot.com/2017/06/ipsum.html');
        assert.equal(slug, 'ipsum');
    });

    it('increaseImageSize', function () {
        const image1 = increaseImageSize(
            'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600/photo.jpg'
        );
        const image2 = increaseImageSize(
            'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600-h/photo.jpg'
        );

        assert.equal(
            image1,
            'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg'
        );
        assert.equal(
            image2,
            'https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg'
        );
    });
});

describe('Process HTML', function () {
    it('Can increase image sizes', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s1600-h/photo.jpg">'
        });

        assert.equal(
            processed.html,
            '<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s2000/photo.jpg">'
        );
    });

    it('Can change divs to paragraphs', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<div style="color: #232d32; font-family: Lato, sans-serif; font-size: 16px; line-height: 1.5; white-space: pre-line;">\nLorem ipsum dolor sit amet, consectetur adipiscing elit</div>'
        });

        assert.equal(processed.html, '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p>');
    });

    it('Remove empty divs with no attributes', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<div></div><div>  </div><div class="hello"></div><div class="hello">   </div>'
        });

        assert.equal(processed.html, '<div class="hello"></div>\n<div class="hello">   </div>');
    });

    it('Can remove anchors that link to direct child image', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<a href="https://3.bp.blogspot.com/my-image.jpg"><img src="https://3.bp.blogspot.com/my-image.jpg"></a>'
        });

        assert.equal(processed.html, '<img src="https://3.bp.blogspot.com/my-image.jpg">');
    });

    it('Can remove the first element if a <hr>', async function () {
        const processed = await processHTMLContent({postData: {}, options: {}, html: '<hr><p>My text</p>'});

        assert.equal(processed.html, '<p>My text</p>');
    });

    it('Can remove the first elements if multiple <hr>', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<hr><hr><hr><p>My text</p>'
        });

        assert.equal(processed.html, '<p>My text</p>');
    });

    it('Can convert to unordered list', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: `<div>My text</div><li>Lorem</li><li>Ipsum</li><li>Dolor</li><div><br /></div><div>My other text</div><div><br /></div>`
        });

        assert.equal(
            processed.html,
            '<p>My text</p>\n<ul><li>Lorem</li><li>Ipsum</li><li>Dolor</li></ul>\n\n\n\n<p>My other text</p>'
        );
    });

    it('Can unwrap linked image tables', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1280/image.png" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'
        });

        assert.equal(
            processed.html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>'
        );
    });

    it('Can unwrap unlinked image tables', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto; text-align: center;"><tbody><tr><td style="text-align: center;"><img border="0" data-original-height="572" data-original-width="1000" height="227" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" style="margin-left: auto; margin-right: auto;" width="400" /></td></tr><tr><td class="tr-caption" style="text-align: center;"><div style="text-align: center;">Image caption</div></td></tr></tbody></table>'
        });

        assert.equal(
            processed.html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>'
        );
    });

    it('Can unwrap image tables & maintain links', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {},
            html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://ghost.org" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'
        });

        assert.equal(
            processed.html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://ghost.org"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"></a><figcaption>Image caption</figcaption></figure>'
        );
    });

    it('Can use first image as featured image (type 1)', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {firstImageAsFeatured: true},
            html: `<p style="text-align: center;">&nbsp;</p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="720" data-original-width="1280" height="301" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="481" /></a></div><br /><p></p><h3 style="text-align: left;"><b>My headline</b></h3>`
        });

        assert.equal(
            processed.feature_image,
            'https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png'
        );
        assert.equal(processed.html, '<h3>My headline</h3>');
    });

    it('Can use first image as featured image (type 2)', async function () {
        const processed = await processHTMLContent({
            postData: {},
            options: {firstImageAsFeatured: true},
            html: `<p style="text-align: center;"><br /></p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="900" data-original-width="1200" height="382" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="509" /></a></div><p></p><h2 style="text-align: left;">Headline</h2>`
        });

        assert.equal(
            processed.feature_image,
            'https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png'
        );
        assert.equal(processed.html, '<h2>Headline</h2>');
    });

    it('Leaves images without a source alone', async function () {
        const processed = await processHTMLContent({postData: {}, html: '<p>Text <img alt="x"></p>'});

        assert.equal(processed.html, 'Text <img alt="x">');
    });

    it('Leaves caption tables without an image alone', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<table class="tr-caption-container"><tbody><tr><td class="tr-caption">Only a caption</td></tr></tbody></table>'
        });

        assert.equal(
            processed.html,
            '<table class="tr-caption-container">\n<tbody>\n<tr>\n<td class="tr-caption">Only a caption</td>\n</tr>\n</tbody>\n</table>'
        );
    });

    it('Unwraps caption tables without a caption or a link target', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<table class="tr-caption-container"><tbody><tr><td><a name="x"><img src="https://1.bp.blogspot.com/a/s320/i.png"></a></td></tr></tbody></table>'
        });

        assert.equal(
            processed.html,
            '<figure class="kg-card kg-image-card"><img src="https://1.bp.blogspot.com/a/s2000/i.png" class="kg-image" alt loading="lazy"></figure>'
        );
    });

    it('Keeps image links to other pages and Koenig cards', async function () {
        const html =
            '<a href="https://x.com/i.jpg" class="kg-image"><img src="https://x.com/i.jpg"></a><a href="https://x.com/j.jpg"><img class="kg-image" src="https://x.com/j.jpg"></a><a href="https://ghost.org"><img src="https://x.com/k.jpg"></a>';
        const processed = await processHTMLContent({postData: {}, html});

        assert.equal(processed.html, `<p>${html}</p>`);
    });

    it('Converts bulleted pre-formatted divs to list items', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<div><span style="white-space: pre">\t</span>• One </div><div><span style="white-space: pre"> </span>Two</div><span style="white-space: pre">x</span><div> <b>a</b>•<span style="white-space: pre"> </span></div><div><b>b</b>• Three<span style="white-space: pre"> </span> <i>z</i></div>'
        });

        assert.equal(
            processed.html,
            '<ul><li>• One</li></ul>\n<div><span style="white-space: pre"> </span>Two</div>\n<p><span style="white-space: pre">x</span>\n</p><ul><li><b>a</b>•</li><li><b>b</b>• Three <i>z</i></li></ul>'
        );
    });

    it('Trims whitespace around list item text', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<div>  <span style="white-space: pre">\t</span>• One<b>x</b>  </div>'
        });

        assert.equal(processed.html, '<ul><li>• One<b>x</b></li></ul>');
    });

    it('Converts styled spans and centred divs to paragraphs and cleans headings', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<span style="background-color: #fff; color: #000; font-family: Arial; font-size: 11pt; white-space: pre-line;">Styled</span><div style="text-align: center;">Centred</div><h2 style="text-align: left;">Left</h2><h2 style="color: red;">Red</h2><h3><b>Bold</b> heading</h3>'
        });

        assert.equal(
            processed.html,
            '<p><p>Styled</p>\n</p><p>Centred</p>\n<h2>Left</h2>\n<h2 style="color: red;">Red</h2>\n<h3>Bold heading</h3>'
        );
    });

    it('Unwraps divs holding only an image', async function () {
        const processed = await processHTMLContent({postData: {}, html: '<div><img src="https://x.com/a.jpg"></div>'});

        assert.equal(processed.html, '<img src="https://x.com/a.jpg">');
    });

    it('Removes non-breaking space paragraphs and keeps styled ones', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<p class="x">&nbsp;</p><div>&nbsp;</div><p>&nbsp; </p><div class="a">&nbsp;</div>'
        });

        assert.equal(processed.html, '<p>&nbsp;</p>\n\n<div class="a">&nbsp;</div>');
    });

    it('Resizes YouTube embeds', async function () {
        const processed = await processHTMLContent({
            postData: {},
            html: '<iframe src="https://www.youtube.com/embed/abc" width="560" height="315"></iframe>'
        });

        assert.equal(
            processed.html,
            '<p><iframe src="https://www.youtube.com/embed/abc" width="160" height="90"></iframe></p>'
        );
    });

    describe('First image as featured image', function () {
        const featured = (html: string) =>
            processHTMLContent({postData: {}, html, options: {firstImageAsFeatured: true}});

        it('handles empty content', async function () {
            assert.deepEqual(await featured(''), {html: ''});
        });

        it('uses a leading image', async function () {
            assert.deepEqual(await featured('<img src="https://x.com/a.jpg"><p>Text</p>'), {
                html: '<p>Text</p>',
                feature_image: 'https://x.com/a.jpg'
            });
        });

        it('ignores images after text', async function () {
            assert.deepEqual(await featured('<p>Text first</p><img src="https://x.com/a.jpg">'), {
                html: '<p>Text first</p>\n<img src="https://x.com/a.jpg">'
            });
        });

        it('uses an unlinked image in an empty first element', async function () {
            for (const html of [
                '<div class="separator"><img src="https://x.com/a.jpg"></div><p>Text</p>',
                '<div class="separator"><a name="x"><img src="https://x.com/a.jpg"></a></div><p>Text</p>'
            ]) {
                assert.deepEqual(await featured(html), {html: '<p>Text</p>', feature_image: 'https://x.com/a.jpg'});
            }
        });

        it('uses an image linked to the same image at another size', async function () {
            assert.deepEqual(
                await featured(
                    '<div class="separator"><a href="https://x.com/a-s1600.jpg"><img src="https://x.com/a-s320.jpg"></a></div><p>Text</p>'
                ),
                {html: '<p>Text</p>', feature_image: 'https://x.com/a-s320.jpg'}
            );
        });

        it('keeps an image linked elsewhere', async function () {
            assert.deepEqual(
                await featured(
                    '<div class="separator"><a href="https://x.com/b.jpg"><img src="https://x.com/a.jpg"></a></div><p>Text</p>'
                ),
                {html: '<div><a href="https://x.com/b.jpg"><img src="https://x.com/a.jpg"></a></div>\n<p>Text</p>'}
            );
        });

        it('keeps a leading embed that has no image', async function () {
            assert.deepEqual(
                await featured('<p><iframe src="https://www.youtube.com/embed/abc"></iframe></p><p>Text</p>'),
                {
                    html: '<p><iframe height="90" width="160" src="https://www.youtube.com/embed/abc"></iframe></p>\n<p>Text</p>'
                }
            );
        });
    });
});
