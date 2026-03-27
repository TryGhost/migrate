import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {getYouTubeID, isURL, processHTML, removeDuplicateFeatureImage} from '../lib/process.js';

describe('beehiiv API processor', () => {
    describe('isURL', () => {
        it('returns true for valid HTTP URL', () => {
            assert.equal(isURL('https://example.com'), true);
        });

        it('returns true for valid HTTP URL with path', () => {
            assert.equal(isURL('https://example.com/path/to/resource'), true);
        });

        it('returns false for undefined', () => {
            assert.equal(isURL(undefined), false);
        });

        it('returns false for invalid URL string', () => {
            assert.equal(isURL('not-a-url'), false);
        });

        it('returns false for empty string', () => {
            assert.equal(isURL(''), false);
        });
    });

    describe('getYouTubeID', () => {
        it('extracts ID from standard youtube.com URL', () => {
            const result = getYouTubeID('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
            assert.equal(result, 'dQw4w9WgXcQ');
        });

        it('extracts ID from youtu.be short URL', () => {
            const result = getYouTubeID('https://youtu.be/dQw4w9WgXcQ');
            assert.equal(result, 'dQw4w9WgXcQ');
        });

        it('extracts ID from embed URL', () => {
            const result = getYouTubeID('https://www.youtube.com/embed/dQw4w9WgXcQ');
            assert.equal(result, 'dQw4w9WgXcQ');
        });

        it('extracts ID from /v/ URL', () => {
            const result = getYouTubeID('https://www.youtube.com/v/dQw4w9WgXcQ');
            assert.equal(result, 'dQw4w9WgXcQ');
        });

        it('extracts ID with additional parameters', () => {
            const result = getYouTubeID('https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be');
            assert.equal(result, 'dQw4w9WgXcQ');
        });

        it('returns original string when no ID pattern found', () => {
            const result = getYouTubeID('https://example.com/video');
            assert.equal(result, 'https://example.com/video');
        });
    });

    describe('processHTML', () => {
        it('handles post with undefined html by using empty string', () => {
            // When post.data.html is undefined, it falls back to empty string via ??
            const result = processHTML({post: {url: 'test', data: {}} as any});
            // Should return empty string without throwing
            assert.equal(result, '');
        });

        it('handles html without content-blocks element', () => {
            // When there's no #content-blocks element, contentBlocksHtml falls back to ''
            const html = '<div><p>No content blocks here</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '');
        });

        it('replaces beehiiv subscriber_id variable with a space', () => {
            const html = '<div id="content-blocks"><p>Hello {{subscriber_id}}</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Hello  </p>');
        });

        it('replaces beehiiv rp_refer_url variable with #', () => {
            const html = '<div id="content-blocks"><a href="{{rp_refer_url}}">Link</a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<a href="#">Link</a>');
        });

        it('replaces beehiiv rp_refer_url_no_params variable with #', () => {
            const html = '<div id="content-blocks"><a href="{{rp_refer_url_no_params}}">Link</a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<a href="#">Link</a>');
        });

        it('converts empty divs with border-top to HR', () => {
            const html = '<div id="content-blocks"><div style="border-top: 1px solid black"></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<hr>');
        });

        it('does not convert divs with content to HR', () => {
            const html = '<div id="content-blocks"><div style="border-top: 1px solid black">content</div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, 'content');
        });

        it('converts nested padding-left divs to blockquote with paragraph content', () => {
            const html = `<div id="content-blocks"><div style="padding-left:19px;"><div style="padding-left:40px;"><div> ❝ </div><div><p>Quote text here.</p></div><div><small>Author Name</small></div></div></div></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<blockquote><p>Quote text here.</p><cite>Author Name</cite></blockquote>');
        });

        it('converts nested padding-left divs to blockquote without citation when small is empty', () => {
            const html = `<div id="content-blocks"><div style="padding-left:19px;"><div style="padding-left:40px;"><div> ❝ </div><div><p>Quote text here.</p></div><div><small></small></div></div></div></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<blockquote><p>Quote text here.</p></blockquote>');
        });

        it('does not convert nested padding-left divs without paragraphs', () => {
            const html = '<div id="content-blocks"><div style="padding-left: 20px"><div style="padding-left: 10px">plain text</div></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<div>plain text</div>');
        });

        it('converts subscribe button wrapper to Portal signup button', () => {
            const html = '<div id="content-blocks"><div style="padding-bottom:12px;padding-left:15px;padding-right:15px;padding-top:12px;text-align:center;width:100%;word-break:break-word;"><a target="_blank" rel="noopener nofollow noreferrer" href="https://example.beehiiv.com/subscribe"><button style="background-color:#030712;" type="button"> Subscribe </button></a></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<div class="kg-card kg-button-card kg-align-center"><a href="/#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>');
        });

        it('converts subscribe button without wrapper div to Portal signup', () => {
            const html = '<div id="content-blocks"><a href="https://example.beehiiv.com/subscribe"><button>Subscribe</button></a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<div class="kg-card kg-button-card kg-align-center"><a href="/#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>');
        });

        it('converts buttons inside anchors to Ghost buttons', () => {
            const html = '<div id="content-blocks"><a href="https://example.com"><button>Click me</button></a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<div class="kg-card kg-button-card kg-align-center"><a href="https://example.com" class="kg-btn kg-btn-accent">Click me</a></div>');
        });

        it('converts generic embeds to bookmark cards', () => {
            const html = '<div id="content-blocks"><div class="generic-embed--root"><a href="https://example.com">Link</a><div class="generic-embed--title"><p>Title</p></div><div class="generic-embed--description"><p>Description</p></div><div class="generic-embed--image"><img src="https://example.com/image.jpg" /></div></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.com"><div class="kg-bookmark-content"><div class="kg-bookmark-title">Title</div><div class="kg-bookmark-description">Description</div><div class="kg-bookmark-metadata"></div></div><div class="kg-bookmark-thumbnail"><img src="https://example.com/image.jpg" alt></div></a></figure>');
        });

        it('handles generic embeds with missing sub-elements without crashing', () => {
            const html = '<div id="content-blocks"><div class="generic-embed--root"></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '');
        });

        it('unwraps audio iframes from tables', () => {
            const html = '<div id="content-blocks"><table><tr><td><iframe src="https://audio.beehiiv.com/audio123"></iframe></td></tr></table></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<iframe src="https://audio.beehiiv.com/audio123"></iframe>');
        });

        it('converts YouTube iframes to embed cards', () => {
            const html = '<div id="content-blocks"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-embed-card"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen width="160" height="90"></iframe></figure>');
        });

        it('converts youtu.be iframes to embed cards', () => {
            const html = '<div id="content-blocks"><iframe src="https://youtu.be/FdeioVndUhs"></iframe></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-embed-card"><iframe src="https://www.youtube.com/embed/FdeioVndUhs?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen width="160" height="90"></iframe></figure>');
        });

        it('converts image with caption to Ghost image card', () => {
            const html = '<div id="content-blocks"><div style="padding-left:15px;padding-right:15px;"><div style="padding-bottom:20px;padding-top:20px;"><img alt="" src="https://media.beehiiv.com/image.jpg" /><div style="text-align:center;"><small style="font-style:italic;"><p>Caption text here</p></small></div></div></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://media.beehiiv.com/image.jpg" class="kg-image" alt loading="lazy"><figcaption>Caption text here</figcaption></figure>');
        });

        it('converts image without caption to Ghost image card', () => {
            const html = '<div id="content-blocks"><div style="padding-left:15px;"><div style="padding-bottom:20px;"><img alt="Test" src="https://media.beehiiv.com/photo.jpg" /></div></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-image-card"><img src="https://media.beehiiv.com/photo.jpg" class="kg-image" alt="Test" loading="lazy"></figure>');
        });

        it('converts image in single div wrapper to Ghost image card', () => {
            const html = '<div id="content-blocks"><div><img alt="" src="https://media.beehiiv.com/single.jpg" /></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<figure class="kg-card kg-image-card"><img src="https://media.beehiiv.com/single.jpg" class="kg-image" alt loading="lazy"></figure>');
        });

        it('converts image inside non-div wrapper and places card after parent', () => {
            const html = '<div id="content-blocks"><p>Text <img alt="" src="https://example.com/img.jpg" /> more text</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Text  more text</p><figure class="kg-card kg-image-card"><img src="https://example.com/img.jpg" class="kg-image" alt loading="lazy"></figure>');
        });

        it('converts sponsored content tables to Ghost HTML cards with text in p tags', () => {
            const html = `<div id="content-blocks"><div style="padding: 8px 5px 8px 5px;"><table bgcolor="#1A4D3A" border="0" cellpadding="0" cellspacing="0" width="100%" style="margin:25px 0; border-radius:20px;"><tbody><tr><td align="center" style="padding: 50px 30px;"><div style="color:#1A4D3A; font-size:12px; font-weight:bold; background:#FFFFFF; padding:5px 12px; border-radius:15px; display:inline-block; margin-bottom:20px;"> Sponsored Content </div><br><br><h2 style="color:#FEFEFE;"> Ad Heading </h2><br><br><div style="text-align: center;"><a href="https://example.com"><img src="https://example.com/ad.jpg" alt="Ad image" style="width: 400px;"></a></div><br><br><div style="font-size:20px; line-height:1.6; text-align: left; color: #FEFEFE;"> Some ad text </div><a href="https://example.com" style="display:inline-block; background:#F9FFF6; color:#1A4D3A;">Learn more</a></td></tr></tbody></table></div></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.startsWith('<!--kg-card-begin: html--><div class="mg-sponsored">'));
            assert.ok(result.includes('<p> Sponsored Content </p>'), 'text from divs is wrapped in p tags');
            assert.ok(result.includes('<p> Some ad text </p>'), 'ad text from divs is wrapped in p tags');
            assert.ok(result.includes('Ad Heading'));
            assert.ok(result.includes('<img src="https://example.com/ad.jpg"'), 'image stays as raw img');
            assert.ok(!result.includes('kg-image-card'), 'image should not be converted to Ghost image card');
            assert.ok(result.includes('Learn more'));
            assert.ok(result.endsWith('<!--kg-card-end: html-->'));
        });

        it('converts sponsored content tables without wrapper div', () => {
            const html = `<div id="content-blocks"><table><tbody><tr><td><div> Sponsored Content </div><p>Ad text</p></td></tr></tbody></table></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.startsWith('<!--kg-card-begin: html--><div class="mg-sponsored">'));
            assert.ok(result.includes('<p> Sponsored Content </p>'));
            assert.ok(result.includes('Ad text'));
        });

        it('removes empty divs and preserves image divs in sponsored content', () => {
            const html = `<div id="content-blocks"><table><tbody><tr><td><div> Sponsored Content </div><div></div><div style="text-align:center"><a href="https://example.com"><img src="https://example.com/ad.jpg" alt="Ad"></a></div></td></tr></tbody></table></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('<img src="https://example.com/ad.jpg"'), 'image preserved in div');
            assert.ok(result.includes('<p> Sponsored Content </p>'), 'text div converted to p');
        });

        it('handles sponsored content table without td element', () => {
            const html = `<div id="content-blocks"><table><tbody><tr><th> Sponsored Content </th></tr></tbody></table></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.startsWith('<!--kg-card-begin: html--><div class="mg-sponsored">'));
            assert.ok(result.includes('Sponsored Content'));
        });

        it('removes empty paragraphs', () => {
            const html = '<div id="content-blocks"><p></p><p>   </p><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Content</p>');
        });

        it('removes style tags', () => {
            const html = '<div id="content-blocks"><style>.foo { color: red; }</style><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Content</p>');
        });

        it('removes mobile ad elements', () => {
            const html = '<div id="content-blocks"><div id="pad-mobile">Ad content</div><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Content</p>');
        });

        it('removes b and strong tags from headings', () => {
            const html = '<div id="content-blocks"><h2><strong>Bold Heading</strong></h2></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<h2>Bold Heading</h2>');
        });

        it('removes style attributes', () => {
            const html = '<div id="content-blocks"><p style="color: red;">Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.equal(result, '<p>Content</p>');
        });
    });

    describe('removeDuplicateFeatureImage', () => {
        it('removes first image when it matches feature image via asset path', () => {
            const html = '<img src="https://example.com/uploads/asset/file/123/image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '');
        });

        it('removes first image when normalized src matches feature image', () => {
            const html = '<img src="https://example.com/fit=scale-down,format=auto,onerror=redirect,quality=80/image.jpg" />';
            const featureSrc = 'https://example.com/quality=100/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '');
        });

        it('keeps image when it does not match feature image', () => {
            const html = '<img src="https://example.com/different-image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '<img src="https://example.com/different-image.jpg">');
        });

        it('handles image wrapped in another element', () => {
            const html = '<figure><img src="https://example.com/uploads/asset/file/123/image.jpg" /></figure>';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '<figure></figure>');
        });

        it('handles html without images', () => {
            const html = '<p>No images here</p>';
            const featureSrc = 'https://cdn.example.com/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '<p>No images here</p>');
        });

        it('keeps image when neither URL contains /uploads/asset/', () => {
            const html = '<img src="https://example.com/image.jpg" />';
            const featureSrc = '';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '<img src="https://example.com/image.jpg">');
        });

        it('keeps image when URLs have different asset paths', () => {
            const html = '<img src="https://example.com/uploads/asset/file/123/image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/456/different.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.equal(result, '<img src="https://example.com/uploads/asset/file/123/image.jpg">');
        });
    });
});
