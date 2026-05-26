import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    escapeHtml,
    htmlCard,
    paragraphsFromPlainText,
    renderNode,
    richContentToHtml
} from '../lib/rich-content.js';

describe('Wix rich content converter', () => {
    it('escapes HTML and wraps HTML cards', () => {
        assert.equal(escapeHtml('<a href="x">It\'s</a>'), '&lt;a href=&quot;x&quot;&gt;It&#39;s&lt;/a&gt;');
        assert.equal(htmlCard('<p>Body</p>'), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<p>Body</p>\n</div>\n<!--kg-card-end: html-->');
        assert.equal(paragraphsFromPlainText('One\nline\n\nTwo'), '<p>One<br>line</p>\n<p>Two</p>');
    });

    it('converts common block and inline nodes', () => {
        const richContent = JSON.stringify({
            nodes: [
                {
                    type: 'HEADING',
                    headingData: {level: 2},
                    nodes: [{type: 'TEXT', textData: {text: 'Heading', decorations: [{type: 'BOLD'}, {type: 'ITALIC'}]}}]
                },
                {
                    type: 'PARAGRAPH',
                    nodes: [
                        {type: 'TEXT', textData: {text: 'Bold', decorations: [{type: 'BOLD'}]}},
                        {type: 'TEXT', textData: {text: ' italic', decorations: [{type: 'ITALIC'}]}},
                        {type: 'TEXT', textData: {text: ' underline', decorations: [{type: 'UNDERLINE'}]}},
                        {type: 'TEXT', textData: {text: ' super', decorations: [{type: 'SUPERSCRIPT'}]}},
                        {type: 'TEXT', textData: {text: ' link', decorations: [{type: 'LINK', linkData: {link: {url: 'https://example.com?a=1&b=2'}}}]}},
                        {type: 'TEXT', textData: {text: ' color', decorations: [{type: 'COLOR'}]}}
                    ]
                },
                {
                    type: 'BULLETED_LIST',
                    nodes: [{type: 'LIST_ITEM', nodes: [{type: 'PARAGRAPH', nodes: [{type: 'TEXT', textData: {text: 'Bullet', decorations: []}}]}]}]
                },
                {
                    type: 'ORDERED_LIST',
                    nodes: [{type: 'LIST_ITEM', nodes: [{type: 'PARAGRAPH', nodes: [{type: 'TEXT', textData: {text: 'One', decorations: []}}]}]}]
                },
                {type: 'DIVIDER', nodes: []}
            ]
        });

        assert.equal(richContentToHtml({richContent}), '<h2><em>Heading</em></h2><p><strong>Bold</strong> <em>italic</em> <u>underline</u> <sup>super</sup> <a href="https://example.com?a=1&amp;b=2">link</a> color</p><ul><li><p>Bullet</p></li></ul><ol><li><p>One</p></li></ol><hr>');
        assert.equal(renderNode({type: 'HEADING', headingData: {level: 2}}), '<h2></h2>');
        assert.equal(renderNode({type: 'HEADING', headingData: {level: 2}, nodes: [{type: 'UNKNOWN'}]}), '<h2><!--kg-card-begin: html-->\n<div class="mg-html-card">\n<pre>{\n  &quot;type&quot;: &quot;UNKNOWN&quot;\n}</pre>\n</div>\n<!--kg-card-end: html--></h2>');
        assert.equal(renderNode({type: 'HEADING', headingData: {level: 10}, nodes: []}), '<h6></h6>');
        assert.equal(renderNode({type: 'HEADING', headingData: {level: 0}, nodes: []}), '<h2></h2>');
        assert.equal(renderNode({type: 'PARAGRAPH'}), '');
        assert.equal(renderNode({type: 'PARAGRAPH', nodes: [{type: 'TEXT', textData: {text: '   ', decorations: []}}]}), '');
        assert.equal(renderNode({type: 'TEXT'}), '');
        assert.equal(renderNode({type: 'TEXT', textData: {text: 'No URL', decorations: [{type: 'LINK'}]}}), 'No URL');
        assert.equal(renderNode({type: 'TEXT', textData: {text: ' It ', decorations: [{type: 'LINK', linkData: {link: {url: 'https://example.com'}}}]}}), ' <a href="https://example.com">It</a> ');
    });

    it('converts images, buttons, and tables', () => {
        const imageHtml = renderNode({
            type: 'IMAGE',
            imageData: {
                image: {
                    src: {id: 'image.jpg'},
                    width: 100,
                    height: 50
                },
                altText: 'Alt'
            }
        });

        assert.match(imageHtml, /kg-image-card/);
        assert.match(imageHtml, /image\.jpg/);
        assert.match(imageHtml, /Alt/);
        assert.match(renderNode({
            type: 'IMAGE',
            imageData: {
                image: {
                    src: {id: 'image-no-alt.jpg'},
                    width: 100,
                    height: 50
                }
            }
        }), /image-no-alt\.jpg/);

        assert.equal(renderNode({type: 'BUTTON', buttonData: {text: 'Go', link: {url: 'https://example.com'}, containerData: {alignment: 'CENTER'}}}), '<div class="kg-card kg-button-card kg-align-center"><a href="https://example.com" class="kg-btn kg-btn-accent">Go</a></div>');
        assert.equal(renderNode({type: 'BUTTON', buttonData: {text: 'Left', link: {url: 'https://example.com'}, containerData: {alignment: 'LEFT'}}}), '<div class="kg-card kg-button-card kg-align-left"><a href="https://example.com" class="kg-btn kg-btn-accent">Left</a></div>');
        assert.equal(renderNode({type: 'BUTTON', buttonData: {text: 'Bad alignment', link: {url: 'https://example.com'}, containerData: {alignment: 'AUTO'}}}), '<div class="kg-card kg-button-card kg-align-center"><a href="https://example.com" class="kg-btn kg-btn-accent">Bad alignment</a></div>');
        assert.equal(renderNode({type: 'BUTTON', buttonData: {text: 'No link'}}), '<p>No link</p>');
        assert.equal(renderNode({type: 'BUTTON', buttonData: {}}), '');

        const table = renderNode({
            type: 'TABLE',
            nodes: [{
                type: 'TABLE_ROW',
                nodes: [{type: 'TABLE_CELL', nodes: [{type: 'PARAGRAPH', nodes: [{type: 'TEXT', textData: {text: 'Cell', decorations: []}}]}]}]
            }]
        });
        assert.equal(table, '<table><tbody><tr><td><p>Cell</p></td></tr></tbody></table>');
    });

    it('uses HTML cards for unknown or invalid content', () => {
        assert.equal(renderNode({type: 'IMAGE'}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<pre>{\n  &quot;type&quot;: &quot;IMAGE&quot;\n}</pre>\n</div>\n<!--kg-card-end: html-->');
        assert.equal(renderNode({type: 'UNKNOWN', nodes: [{type: 'TEXT', textData: {text: 'child', decorations: []}}]}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\nchild\n</div>\n<!--kg-card-end: html-->');
        assert.match(renderNode({type: 'UNKNOWN'}), /&quot;UNKNOWN&quot;/);
        assert.equal(richContentToHtml({richContent: '', plainContent: 'Fallback'}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<p>Fallback</p>\n</div>\n<!--kg-card-end: html-->');
        assert.equal(richContentToHtml({richContent: '{"nodes":[]}', plainContent: 'Fallback'}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<p>Fallback</p>\n</div>\n<!--kg-card-end: html-->');
        assert.equal(richContentToHtml({richContent: '{"nodes":{}}', plainContent: 'Fallback'}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<p>Fallback</p>\n</div>\n<!--kg-card-end: html-->');
        assert.equal(richContentToHtml({richContent: 'bad json', plainContent: 'Fallback'}), '<!--kg-card-begin: html-->\n<div class="mg-html-card">\n<p>Fallback</p>\n</div>\n<!--kg-card-end: html-->');
    });
});
