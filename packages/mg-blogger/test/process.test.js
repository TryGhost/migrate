import $ from 'cheerio';
import process, {cleanExcerpt, slugFromURL, increaseImageSize, getAllAttributes} from '../lib/process.js';
import response from './fixtures/response.json';

describe('Utils', function () {
    test('cleanExcerpt', function () {
        const excerpt = cleanExcerpt('<div class="lorem" style="color: #f00;"><p><span style="font-weight: 400;">Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" style="color: blue;" rel="noreferrer" target="_blank">Dolor</a></span></div>');
        expect(excerpt).toEqual('Lorem <b>Ipsum</b> <a href="https://example.com" title="Link to Dolor" rel="noreferrer" target="_blank">Dolor</a>');
    });

    test('slugFromURL', function () {
        const slug = slugFromURL('http://example.blogspot.com/2017/06/ipsum.html');
        expect(slug).toEqual('ipsum');
    });

    test('increaseImageSize', function () {
        const image1 = increaseImageSize('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600/photo.jpg');
        const image2 = increaseImageSize('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s1600-h/photo.jpg');

        expect(image1).toEqual('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg');
        expect(image2).toEqual('https://3.bp.blogspot.com/-dQmeqRna7MA/V56ZIKQmPJI/AAAAAAAAJeU/1234_abcd3YT3BmCduGnz2tE4xrlp_c1gCLcB/s2000/photo.jpg');
    });

    test('getAllAttributes', function () {
        const $html = $.load('<dib><img src="https://example.com" title="Image title" alt="Image alt" /></div>');
        const el = $html('img');
        const attrs = getAllAttributes(el[0]);

        expect(attrs[0].name).toEqual('src');
        expect(attrs[0].value).toEqual('https://example.com');
        expect(attrs[1].name).toEqual('title');
        expect(attrs[1].value).toEqual('Image title');
        expect(attrs[2].name).toEqual('alt');
        expect(attrs[2].value).toEqual('Image alt');
    });
});

describe('Process JSON', function () {
    test('Can process API response into compatible objects', async function () {
        const processed = await process.processPosts(response, {});
        const firstPost = processed[0];

        expect(processed).toBeArrayOfSize(3);

        expect(firstPost).toContainAllKeys(['url', 'data']);
        expect(firstPost.data).toContainAllKeys(['slug', 'title', 'status', 'published_at', 'created_at', 'updated_at', 'type', 'author', 'tags', 'html']);
    });

    test('Can create tags', async function () {
        const post = await process.processPost(response[0], {});
        const tags = post.data.tags;

        expect(tags).toBeArrayOfSize(5);

        expect(tags[0]).toContainAllKeys(['url', 'data']);
        expect(tags[0].data).toContainAllKeys(['slug', 'name']);

        expect(tags[0].url).toEqual('migrator-added-tag-books');
        expect(tags[0].data.slug).toEqual('books');
        expect(tags[0].data.name).toEqual('books');

        expect(tags[1].url).toEqual('migrator-added-tag-this-that');
        expect(tags[1].data.slug).toEqual('this-that');
        expect(tags[1].data.name).toEqual('This & That');

        expect(tags[2].url).toEqual('migrator-added-tag-good-bad');
        expect(tags[2].data.slug).toEqual('good-bad');
        expect(tags[2].data.name).toEqual('Good & Bad');

        expect(tags[3].url).toEqual('migrator-added-tag-site-id12345678');
        expect(tags[3].data.slug).toEqual('hash-blogger-site-12345678');
        expect(tags[3].data.name).toEqual('#blogger-site-12345678');

        expect(tags[4].url).toEqual('migrator-added-tag');
        expect(tags[4].data.slug).toEqual('hash-blogger');
        expect(tags[4].data.name).toEqual('#blogger');
    });

    test('Can create author', async function () {
        const post = await process.processPost(response[0], {});

        const author = post.data.author;

        expect(author).toContainAllKeys(['url', 'data']);
        expect(author.data).toContainAllKeys(['slug', 'email', 'name']);

        expect(author.url).toEqual('migrator-added-author-important-author-co');
        expect(author.data.slug).toEqual('important-author-co');
        expect(author.data.email).toEqual('important-author-co@example.com');
        expect(author.data.name).toEqual('Important Author & Co.');
    });
});

describe('Process HTML', function () {
    test('Can increase image sizes', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s1600-h/photo.jpg">'});

        expect(processed.html).toEqual('<img src="http://1.bp.blogspot.com/_-abcdNGLDs4/abcdNoxb7NI/AAAAAAAAAaU/PA-oWpq0Iug/s2000/photo.jpg">');
    });

    test('Can change divs to paragraphs', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<div style="color: #232d32; font-family: Lato, sans-serif; font-size: 16px; line-height: 1.5; white-space: pre-line;">\nLorem ipsum dolor sit amet, consectetur adipiscing elit</div>'});

        expect(processed.html).toEqual('<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit</p>');
    });

    test('Remove empty divs with no attributes', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<div></div><div>  </div><div class="hello"></div><div class="hello">   </div>'});

        expect(processed.html).toEqual('<div class="hello"></div>\n<div class="hello">   </div>');
    });

    test('Can remove anchors that link to direct child image', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<a href="https://3.bp.blogspot.com/my-image.jpg"><img src="https://3.bp.blogspot.com/my-image.jpg"></a>'});

        expect(processed.html).toEqual('<img src="https://3.bp.blogspot.com/my-image.jpg">');
    });

    test('Can remove the first element if a <hr>', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<hr><p>My text</p>'});

        expect(processed.html).toEqual('<p>My text</p>');
    });

    test('Can remove the first elements if multiple <hr>', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<hr><hr><hr><p>My text</p>'});

        expect(processed.html).toEqual('<p>My text</p>');
    });

    test('Can convert to unordered list', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: `<div>My text</div><li>Lorem</li><li>Ipsum</li><li>Dolor</li><div><br /></div><div>My other text</div><div><br /></div>`});

        expect(processed.html).toEqual('<p>My text</p>\n<ul><li>Lorem</li><li>Ipsum</li><li>Dolor</li></ul>\n\n\n\n<p>My other text</p>');
    });

    test('Can unwrap linked image tables', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1280/image.png" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'});

        expect(processed.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>');
    });

    test('Can unwrap unlinked image tables', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto; text-align: center;"><tbody><tr><td style="text-align: center;"><img border="0" data-original-height="572" data-original-width="1000" height="227" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" style="margin-left: auto; margin-right: auto;" width="400" /></td></tr><tr><td class="tr-caption" style="text-align: center;"><div style="text-align: center;">Image caption</div></td></tr></tbody></table>'});

        expect(processed.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"><figcaption>Image caption</figcaption></figure>');
    });

    test('Can unwrap image tables & maintain links', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {}, html: '<table align="center" cellpadding="0" cellspacing="0" class="tr-caption-container" style="margin-left: auto; margin-right: auto;"><tbody><tr><td style="text-align: center;"><a href="https://ghost.org" imageanchor="1" style="margin-left: auto; margin-right: auto;"><img border="0" data-original-height="640" data-original-width="1280" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="320" /></a></td></tr><tr><td class="tr-caption" style="text-align: center;">Image caption</td></tr></tbody></table>'});

        expect(processed.html).toEqual('<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://ghost.org"><img src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png" class="kg-image" alt loading="lazy"></a><figcaption>Image caption</figcaption></figure>');
    });

    test('Can use first image as featured image (type 1)', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {firstImageAsFeatured: true}, html: `<p style="text-align: center;">&nbsp;</p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="720" data-original-width="1280" height="301" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="481" /></a></div><br /><p></p><h3 style="text-align: left;"><b>My headline</b></h3>`});

        expect(processed.feature_image).toEqual('https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png');
        expect(processed.html).toEqual('<h3>My headline</h3>');
    });

    test('Can use first image as featured image (type 2)', async function () {
        const processed = await process.processHTMLContent({postData: {}, options: {firstImageAsFeatured: true}, html: `<p style="text-align: center;"><br /></p><div class="separator" style="clear: both; text-align: center;"><a href="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s1000/image.png" style="margin-left: 1em; margin-right: 1em;"><img border="0" data-original-height="900" data-original-width="1200" height="382" src="https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s320/image.png" width="509" /></a></div><p></p><h2 style="text-align: left;">Headline</h2>`});

        expect(processed.feature_image).toEqual('https://1.bp.blogspot.com/-12345678Um0/abcdo6O6gMI/qwertyAABuk/1234abcdZ5w7EHoyg9jIAupZIXYLQj42gCLcBGAsYHQ/s2000/image.png');
        expect(processed.html).toEqual('<h2>Headline</h2>');
    });
});
