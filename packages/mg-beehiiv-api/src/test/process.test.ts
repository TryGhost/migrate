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

        it('replaces beehiiv subscriber_id variable with #', () => {
            const html = '<div id="content-blocks"><p>Hello {{subscriber_id}}</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('#'));
            assert.ok(!result.includes('{{subscriber_id}}'));
        });

        it('replaces beehiiv rp_refer_url variable with #', () => {
            const html = '<div id="content-blocks"><a href="{{rp_refer_url}}">Link</a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('#'));
            assert.ok(!result.includes('{{rp_refer_url}}'));
        });

        it('replaces beehiiv rp_refer_url_no_params variable with #', () => {
            const html = '<div id="content-blocks"><a href="{{rp_refer_url_no_params}}">Link</a></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('#'));
            assert.ok(!result.includes('{{rp_refer_url_no_params}}'));
        });

        it('converts empty divs with border-top to HR', () => {
            const html = '<div id="content-blocks"><div style="border-top: 1px solid black"></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('<hr'));
        });

        it('does not convert divs with content to HR', () => {
            const html = '<div id="content-blocks"><div style="border-top: 1px solid black">content</div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(!result.includes('<hr'));
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
            assert.ok(!result.includes('<blockquote>'));
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
            assert.ok(result.includes('kg-btn kg-btn-accent'));
            assert.ok(result.includes('Click me'));
        });

        it('converts generic embeds to bookmark cards', () => {
            const html = `<div id="content-blocks">
                <div class="generic-embed--root">
                    <a href="https://example.com">Link</a>
                    <div class="generic-embed--title"><p>Title</p></div>
                    <div class="generic-embed--description"><p>Description</p></div>
                    <div class="generic-embed--image"><img src="https://example.com/image.jpg" /></div>
                </div>
            </div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-bookmark-card'));
        });

        it('unwraps audio iframes from tables', () => {
            const html = `<div id="content-blocks">
                <table>
                    <tr>
                        <td>
                            <iframe src="https://audio.beehiiv.com/audio123"></iframe>
                        </td>
                    </tr>
                </table>
            </div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('iframe'));
            assert.ok(result.includes('audio.beehiiv.com'));
        });

        it('converts YouTube iframes to embed cards', () => {
            const html = '<div id="content-blocks"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-embed-card'));
            assert.ok(result.includes('dQw4w9WgXcQ'));
        });

        it('converts youtu.be iframes to embed cards', () => {
            const html = '<div id="content-blocks"><iframe src="https://youtu.be/FdeioVndUhs"></iframe></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-embed-card'));
            assert.ok(result.includes('FdeioVndUhs'));
        });

        it('converts image with caption to Ghost image card', () => {
            const html = `<div id="content-blocks"><div style="padding-left:15px;padding-right:15px;"><div style="padding-bottom:20px;padding-top:20px;"><img alt="" src="https://media.beehiiv.com/image.jpg" /><div style="text-align:center;"><small style="font-style:italic;"><p>Caption text here</p></small></div></div></div></div>`;
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-image-card'));
            assert.ok(result.includes('https://media.beehiiv.com/image.jpg'));
            assert.ok(result.includes('Caption text here'));
        });

        it('converts image without caption to Ghost image card', () => {
            const html = '<div id="content-blocks"><div style="padding-left:15px;"><div style="padding-bottom:20px;"><img alt="Test" src="https://media.beehiiv.com/photo.jpg" /></div></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-image-card'));
            assert.ok(result.includes('https://media.beehiiv.com/photo.jpg'));
        });

        it('converts image in single div wrapper to Ghost image card', () => {
            const html = '<div id="content-blocks"><div><img alt="" src="https://media.beehiiv.com/single.jpg" /></div></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-image-card'));
            assert.ok(result.includes('https://media.beehiiv.com/single.jpg'));
        });

        it('converts image inside non-div wrapper and places card after parent', () => {
            const html = '<div id="content-blocks"><p>Text <img alt="" src="https://example.com/img.jpg" /> more text</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('kg-card kg-image-card'));
            assert.ok(result.includes('https://example.com/img.jpg'));
            assert.ok(result.includes('<p>Text  more text</p>'));
        });

        it('removes empty paragraphs', () => {
            const html = '<div id="content-blocks"><p></p><p>   </p><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('<p>Content</p>'));
            // Empty paragraphs should be removed
            const pCount = (result.match(/<p>/g) || []).length;
            assert.equal(pCount, 1);
        });

        it('removes style tags', () => {
            const html = '<div id="content-blocks"><style>.foo { color: red; }</style><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(!result.includes('<style>'));
            assert.ok(!result.includes('.foo'));
        });

        it('removes mobile ad elements', () => {
            const html = '<div id="content-blocks"><div id="pad-mobile">Ad content</div><p>Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(!result.includes('Ad content'));
            assert.ok(result.includes('Content'));
        });

        it('removes b and strong tags from headings', () => {
            const html = '<div id="content-blocks"><h2><strong>Bold Heading</strong></h2></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(result.includes('Bold Heading'));
            assert.ok(!result.includes('<strong>'));
        });

        it('removes style attributes', () => {
            const html = '<div id="content-blocks"><p style="color: red;">Content</p></div>';
            const result = processHTML({post: {url: 'test', data: {html}} as any});
            assert.ok(!result.includes('style='));
        });
    });

    describe('removeDuplicateFeatureImage', () => {
        it('removes first image when it matches feature image via asset path', () => {
            const html = '<img src="https://example.com/uploads/asset/file/123/image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(!result.includes('img'));
        });

        it('removes first image when normalized src matches feature image', () => {
            const html = '<img src="https://example.com/fit=scale-down,format=auto,onerror=redirect,quality=80/image.jpg" />';
            const featureSrc = 'https://example.com/quality=100/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(!result.includes('img'));
        });

        it('keeps image when it does not match feature image', () => {
            const html = '<img src="https://example.com/different-image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(result.includes('img'));
        });

        it('handles image wrapped in another element', () => {
            const html = '<figure><img src="https://example.com/uploads/asset/file/123/image.jpg" /></figure>';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/123/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(!result.includes('<img'));
        });

        it('handles html without images', () => {
            const html = '<p>No images here</p>';
            const featureSrc = 'https://cdn.example.com/image.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(result.includes('No images here'));
        });

        it('handles empty feature source with non-asset URL', () => {
            // When featureSrc is empty and image URL doesn't contain /uploads/asset/,
            // both split results have undefined at index 1, so image is removed
            const html = '<img src="https://example.com/image.jpg" />';
            const featureSrc = '';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            // Due to undefined === undefined comparison, image is removed
            assert.ok(!result.includes('<img'));
        });

        it('keeps image when URLs have different asset paths', () => {
            const html = '<img src="https://example.com/uploads/asset/file/123/image.jpg" />';
            const featureSrc = 'https://cdn.example.com/uploads/asset/file/456/different.jpg';
            const result = removeDuplicateFeatureImage({html, featureSrc});
            assert.ok(result.includes('img'));
        });
    });
});
