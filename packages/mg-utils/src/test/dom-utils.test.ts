import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {
    parseFragment,
    serializeNode,
    serializeChildren,
    replaceWith,
    insertBefore,
    insertAfter,
    wrap,
    createElement,
    attr,
    is,
    parents,
    lastParent,
    setStyle,
    isComment,
    getCommentData
} from '../lib/dom-utils.js';

describe('parseFragment', function () {
    it('parses basic HTML', function () {
        const parsed = parseFragment('<p>Hello</p>');

        assert.ok(parsed.body);
        assert.ok(parsed.document);
        assert.equal(parsed.html(), '<p>Hello</p>');
    });

    it('handles empty input', function () {
        const parsed = parseFragment('');

        assert.equal(parsed.html(), '');
    });

    it('handles null input', function () {
        const parsed = parseFragment(null);

        assert.equal(parsed.html(), '');
    });

    it('$ returns array of matching elements', function () {
        const parsed = parseFragment('<p>One</p><p>Two</p><span>Three</span>');
        const paragraphs = parsed.$('p');

        assert.equal(paragraphs.length, 2);
        assert.equal(paragraphs[0].textContent, 'One');
        assert.equal(paragraphs[1].textContent, 'Two');
    });

    it('$ returns empty array when no matches', function () {
        const parsed = parseFragment('<p>Hello</p>');
        const divs = parsed.$('div');

        assert.equal(divs.length, 0);
    });

    it('$ accepts context parameter', function () {
        const parsed = parseFragment('<div><p>Inside</p></div><p>Outside</p>');
        const div = parsed.$('div')[0];
        const paragraphs = parsed.$('p', div);

        assert.equal(paragraphs.length, 1);
        assert.equal(paragraphs[0].textContent, 'Inside');
    });

    it('text() returns text content', function () {
        const parsed = parseFragment('<p>Hello <strong>World</strong></p>');

        assert.equal(parsed.text(), 'Hello World');
    });
});

describe('serializeNode', function () {
    it('returns empty string for null input', function () {
        assert.equal(serializeNode(null), '');
    });

    it('serializes text nodes', function () {
        const parsed = parseFragment('Hello World');
        const textNode = parsed.body.firstChild;

        assert.equal(serializeNode(textNode), 'Hello World');
    });

    it('serializes comment nodes', function () {
        const parsed = parseFragment('<!--kg-card-begin: html-->');
        const commentNode = parsed.body.firstChild;

        assert.equal(serializeNode(commentNode), '<!--kg-card-begin: html-->');
    });

    it('serializes element nodes with children', function () {
        const parsed = parseFragment('<p>Hello</p>');
        const element = parsed.$('p')[0];

        assert.equal(serializeNode(element), '<p>Hello</p>');
    });

    it('serializes element with attributes', function () {
        const parsed = parseFragment('<a href="https://example.com" class="link">Click</a>');
        const element = parsed.$('a')[0];

        assert.equal(serializeNode(element), '<a href="https://example.com" class="link">Click</a>');
    });

    it('serializes boolean attributes without value', function () {
        const parsed = parseFragment('<input disabled>');
        const element = parsed.$('input')[0];

        assert.equal(serializeNode(element), '<input disabled>');
    });

    it('escapes special characters in attribute values', function () {
        const parsed = parseFragment('<div data-value="a &amp; b &quot;quoted&quot;"></div>');
        const element = parsed.$('div')[0];
        const serialized = serializeNode(element);

        assert.ok(serialized.includes('&amp;'));
        assert.ok(serialized.includes('&quot;'));
    });

    it('serializes document fragments', function () {
        const parsed = parseFragment('<p>One</p><p>Two</p>');
        const fragment = parsed.document.createDocumentFragment();
        const p1 = parsed.document.createElement('p');
        p1.textContent = 'First';
        const p2 = parsed.document.createElement('p');
        p2.textContent = 'Second';
        fragment.appendChild(p1);
        fragment.appendChild(p2);

        assert.equal(serializeNode(fragment), '<p>First</p><p>Second</p>');
    });

    it('returns empty string for unknown node types', function () {
        // Create a mock node with an unknown nodeType
        const unknownNode = {
            nodeType: 99
        } as unknown as Node;

        assert.equal(serializeNode(unknownNode), '');
    });
});

describe('serializeNode - void elements (self-closing)', function () {
    it('hr is self-closing', function () {
        const parsed = parseFragment('<hr>');

        assert.equal(parsed.html(), '<hr>');
        assert.ok(!parsed.html().includes('</hr>'));
        assert.ok(!parsed.html().includes('<hr/>'));
        assert.ok(!parsed.html().includes('<hr />'));
    });

    it('img is self-closing', function () {
        const parsed = parseFragment('<img src="test.jpg" alt="Test">');

        assert.equal(parsed.html(), '<img src="test.jpg" alt="Test">');
        assert.ok(!parsed.html().includes('</img>'));
        assert.ok(!parsed.html().includes('/>'));
    });

    it('br is self-closing', function () {
        const parsed = parseFragment('<p>Line 1<br>Line 2</p>');

        assert.ok(parsed.html().includes('<br>'));
        assert.ok(!parsed.html().includes('</br>'));
        assert.ok(!parsed.html().includes('<br/>'));
    });

    it('input is self-closing', function () {
        const parsed = parseFragment('<input type="text" name="test">');

        assert.equal(parsed.html(), '<input type="text" name="test">');
        assert.ok(!parsed.html().includes('</input>'));
    });

    it('meta is self-closing', function () {
        const parsed = parseFragment('<meta charset="utf-8">');

        assert.equal(parsed.html(), '<meta charset="utf-8">');
        assert.ok(!parsed.html().includes('</meta>'));
    });

    it('source is self-closing', function () {
        const parsed = parseFragment('<source src="video.mp4" type="video/mp4">');

        assert.equal(parsed.html(), '<source src="video.mp4" type="video/mp4">');
        assert.ok(!parsed.html().includes('</source>'));
    });

    it('embed is self-closing', function () {
        const parsed = parseFragment('<embed src="plugin.swf">');

        assert.equal(parsed.html(), '<embed src="plugin.swf">');
        assert.ok(!parsed.html().includes('</embed>'));
    });
});

describe('serializeNode - non-void elements (always have closing tags)', function () {
    it('script always has closing tag', function () {
        const parsed = parseFragment('<script src="app.js"></script>');

        assert.equal(parsed.html(), '<script src="app.js"></script>');
        assert.ok(parsed.html().includes('</script>'));
        assert.ok(!parsed.html().includes('<script src="app.js"/>'));
    });

    it('empty script still has closing tag', function () {
        const parsed = parseFragment('<script></script>');

        assert.equal(parsed.html(), '<script></script>');
    });

    it('iframe always has closing tag', function () {
        const parsed = parseFragment('<iframe src="https://example.com"></iframe>');

        assert.equal(parsed.html(), '<iframe src="https://example.com"></iframe>');
        assert.ok(parsed.html().includes('</iframe>'));
        assert.ok(!parsed.html().includes('<iframe src="https://example.com"/>'));
    });

    it('empty iframe still has closing tag', function () {
        const parsed = parseFragment('<iframe></iframe>');

        assert.equal(parsed.html(), '<iframe></iframe>');
    });

    it('div always has closing tag', function () {
        const parsed = parseFragment('<div class="container"></div>');

        assert.equal(parsed.html(), '<div class="container"></div>');
        assert.ok(parsed.html().includes('</div>'));
    });

    it('span always has closing tag', function () {
        const parsed = parseFragment('<span></span>');

        assert.equal(parsed.html(), '<span></span>');
    });

    it('textarea always has closing tag', function () {
        const parsed = parseFragment('<textarea></textarea>');

        assert.equal(parsed.html(), '<textarea></textarea>');
    });

    it('canvas always has closing tag', function () {
        const parsed = parseFragment('<canvas></canvas>');

        assert.equal(parsed.html(), '<canvas></canvas>');
    });
});

describe('serializeChildren', function () {
    it('returns empty string for null input', function () {
        assert.equal(serializeChildren(null), '');
    });

    it('serializes all child nodes', function () {
        const parsed = parseFragment('<p>One</p><p>Two</p>');

        assert.equal(serializeChildren(parsed.body), '<p>One</p><p>Two</p>');
    });

    it('handles mixed content', function () {
        const parsed = parseFragment('Text<!--comment--><span>Element</span>');

        assert.equal(serializeChildren(parsed.body), 'Text<!--comment--><span>Element</span>');
    });
});

describe('replaceWith', function () {
    it('replaces element with HTML string', function () {
        const parsed = parseFragment('<div><p>Old</p></div>');
        const p = parsed.$('p')[0];

        replaceWith(p, '<span>New</span>');

        assert.equal(parsed.html(), '<div><span>New</span></div>');
    });

    it('replaces element with multiple elements', function () {
        const parsed = parseFragment('<div><p>Old</p></div>');
        const p = parsed.$('p')[0];

        replaceWith(p, '<span>One</span><span>Two</span>');

        assert.equal(parsed.html(), '<div><span>One</span><span>Two</span></div>');
    });

    it('replaces element with element node', function () {
        const parsed = parseFragment('<div><p>Old</p></div>');
        const p = parsed.$('p')[0];
        const newEl = parsed.document.createElement('span');
        newEl.textContent = 'New';

        replaceWith(p, newEl);

        assert.equal(parsed.html(), '<div><span>New</span></div>');
    });

    it('handles null element gracefully', function () {
        assert.doesNotThrow(() => replaceWith(null, '<span>New</span>'));
    });

    it('handles element without parent gracefully', function () {
        const parsed = parseFragment('<p>Test</p>');
        const orphan = parsed.document.createElement('div');

        assert.doesNotThrow(() => replaceWith(orphan, '<span>New</span>'));
    });
});

describe('insertBefore', function () {
    it('inserts HTML string before element', function () {
        const parsed = parseFragment('<div><p>After</p></div>');
        const p = parsed.$('p')[0];

        insertBefore(p, '<span>Before</span>');

        assert.equal(parsed.html(), '<div><span>Before</span><p>After</p></div>');
    });

    it('inserts comment before element', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];

        insertBefore(p, '<!--kg-card-begin: html-->');

        assert.equal(parsed.html(), '<div><!--kg-card-begin: html--><p>Content</p></div>');
    });

    it('inserts element node before element', function () {
        const parsed = parseFragment('<div><p>After</p></div>');
        const p = parsed.$('p')[0];
        const newEl = parsed.document.createElement('span');
        newEl.textContent = 'Before';

        insertBefore(p, newEl);

        assert.equal(parsed.html(), '<div><span>Before</span><p>After</p></div>');
    });

    it('handles null element gracefully', function () {
        assert.doesNotThrow(() => insertBefore(null, '<span>Content</span>'));
    });
});

describe('insertAfter', function () {
    it('inserts HTML string after element', function () {
        const parsed = parseFragment('<div><p>Before</p></div>');
        const p = parsed.$('p')[0];

        insertAfter(p, '<span>After</span>');

        assert.equal(parsed.html(), '<div><p>Before</p><span>After</span></div>');
    });

    it('inserts comment after element', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];

        insertAfter(p, '<!--kg-card-end: html-->');

        assert.equal(parsed.html(), '<div><p>Content</p><!--kg-card-end: html--></div>');
    });

    it('inserts element node after element', function () {
        const parsed = parseFragment('<div><p>Before</p></div>');
        const p = parsed.$('p')[0];
        const newEl = parsed.document.createElement('span');
        newEl.textContent = 'After';

        insertAfter(p, newEl);

        assert.equal(parsed.html(), '<div><p>Before</p><span>After</span></div>');
    });

    it('handles inserting after last child', function () {
        const parsed = parseFragment('<div><p>First</p><p>Last</p></div>');
        const last = parsed.$('p')[1];

        insertAfter(last, '<span>After Last</span>');

        assert.equal(parsed.html(), '<div><p>First</p><p>Last</p><span>After Last</span></div>');
    });

    it('handles null element gracefully', function () {
        assert.doesNotThrow(() => insertAfter(null, '<span>Content</span>'));
    });
});

describe('wrap', function () {
    it('wraps element with HTML string wrapper', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];

        wrap(p, '<figure class="wrapper"></figure>');

        assert.equal(parsed.html(), '<div><figure class="wrapper"><p>Content</p></figure></div>');
    });

    it('wraps element with element node wrapper', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];
        const wrapper = parsed.document.createElement('figure');
        wrapper.className = 'wrapper';

        wrap(p, wrapper);

        assert.equal(parsed.html(), '<div><figure class="wrapper"><p>Content</p></figure></div>');
    });

    it('returns the wrapper element', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];

        const result = wrap(p, '<figure class="wrapper"></figure>');

        assert.ok(result);
        assert.equal(result!.tagName.toLowerCase(), 'figure');
        assert.equal((result as HTMLElement).className, 'wrapper');
    });

    it('returns null for null element', function () {
        const result = wrap(null, '<figure></figure>');

        assert.equal(result, null);
    });

    it('returns null for element without parent', function () {
        const parsed = parseFragment('<p>Test</p>');
        const orphan = parsed.document.createElement('div');

        const result = wrap(orphan, '<figure></figure>');

        assert.equal(result, null);
    });

    it('returns null for invalid wrapper string', function () {
        const parsed = parseFragment('<div><p>Content</p></div>');
        const p = parsed.$('p')[0];

        const result = wrap(p, '');

        assert.equal(result, null);
    });
});

describe('createElement', function () {
    it('creates element with tag name', function () {
        const parsed = parseFragment('<p>Test</p>');
        const el = createElement(parsed.document, 'div');

        assert.equal(el.tagName.toLowerCase(), 'div');
    });

    it('creates element with attributes', function () {
        const parsed = parseFragment('<p>Test</p>');
        const el = createElement(parsed.document, 'a', {
            href: 'https://example.com',
            class: 'link',
            target: '_blank'
        });

        assert.equal(el.tagName.toLowerCase(), 'a');
        assert.equal(el.getAttribute('href'), 'https://example.com');
        assert.equal(el.getAttribute('class'), 'link');
        assert.equal(el.getAttribute('target'), '_blank');
    });

    it('creates element with empty attributes object', function () {
        const parsed = parseFragment('<p>Test</p>');
        const el = createElement(parsed.document, 'span', {});

        assert.equal(el.tagName.toLowerCase(), 'span');
        assert.equal(el.attributes.length, 0);
    });
});

describe('attr', function () {
    it('gets attribute value', function () {
        const parsed = parseFragment('<a href="https://example.com">Link</a>');
        const el = parsed.$('a')[0];

        assert.equal(attr(el, 'href'), 'https://example.com');
    });

    it('returns empty string for missing attribute', function () {
        const parsed = parseFragment('<a href="https://example.com">Link</a>');
        const el = parsed.$('a')[0];

        assert.equal(attr(el, 'target'), '');
    });

    it('returns empty string for null element', function () {
        assert.equal(attr(null, 'href'), '');
    });

    it('sets attribute value', function () {
        const parsed = parseFragment('<a href="https://example.com">Link</a>');
        const el = parsed.$('a')[0];

        attr(el, 'target', '_blank');

        assert.equal(el.getAttribute('target'), '_blank');
    });

    it('sets attribute to empty string', function () {
        const parsed = parseFragment('<input>');
        const el = parsed.$('input')[0];

        attr(el, 'disabled', '');

        assert.equal(el.getAttribute('disabled'), '');
    });
});

describe('is', function () {
    it('returns true when element matches selector', function () {
        const parsed = parseFragment('<p class="intro">Hello</p>');
        const el = parsed.$('p')[0];

        assert.equal(is(el, 'p'), true);
        assert.equal(is(el, '.intro'), true);
        assert.equal(is(el, 'p.intro'), true);
    });

    it('returns false when element does not match selector', function () {
        const parsed = parseFragment('<p class="intro">Hello</p>');
        const el = parsed.$('p')[0];

        assert.equal(is(el, 'div'), false);
        assert.equal(is(el, '.outro'), false);
        assert.equal(is(el, 'p.outro'), false);
    });

    it('returns false for null element', function () {
        assert.equal(is(null, 'p'), false);
    });

    it('returns false for element without matches method', function () {
        assert.equal(is({} as Element, 'p'), false);
    });
});

describe('parents', function () {
    it('returns all parent elements', function () {
        const parsed = parseFragment('<div><section><p><span>Text</span></p></section></div>');
        const span = parsed.$('span')[0];

        const result = parents(span);

        assert.ok(result.length >= 3);
        assert.equal(result[0].tagName.toLowerCase(), 'p');
        assert.equal(result[1].tagName.toLowerCase(), 'section');
        assert.equal(result[2].tagName.toLowerCase(), 'div');
    });

    it('filters parents by selector', function () {
        const parsed = parseFragment('<div class="outer"><div class="inner"><p>Text</p></div></div>');
        const p = parsed.$('p')[0];

        const result = parents(p, 'div');

        assert.equal(result.length, 2);
        assert.equal((result[0] as HTMLElement).className, 'inner');
        assert.equal((result[1] as HTMLElement).className, 'outer');
    });

    it('returns empty array when no parents match selector', function () {
        const parsed = parseFragment('<div><p>Text</p></div>');
        const p = parsed.$('p')[0];

        const result = parents(p, 'section');

        assert.equal(result.length, 0);
    });

    it('returns empty array for null element', function () {
        const result = parents(null, 'div');

        assert.equal(result.length, 0);
    });
});

describe('lastParent', function () {
    it('returns furthest parent matching selector', function () {
        const parsed = parseFragment('<ul class="outer"><li><ul class="inner"><li><span>Text</span></li></ul></li></ul>');
        const span = parsed.$('span')[0];

        const result = lastParent(span, 'ul');

        assert.ok(result);
        assert.equal((result as HTMLElement).className, 'outer');
    });

    it('returns null when no parents match selector', function () {
        const parsed = parseFragment('<div><p>Text</p></div>');
        const p = parsed.$('p')[0];

        const result = lastParent(p, 'section');

        assert.equal(result, null);
    });

    it('returns null for null element', function () {
        const result = lastParent(null, 'div');

        assert.equal(result, null);
    });

    it('returns single matching parent when only one exists', function () {
        const parsed = parseFragment('<ul><li><span>Text</span></li></ul>');
        const span = parsed.$('span')[0];

        const result = lastParent(span, 'ul');

        assert.ok(result);
        assert.equal(result!.tagName.toLowerCase(), 'ul');
    });
});

describe('setStyle', function () {
    it('sets style property on element', function () {
        const parsed = parseFragment('<div>Content</div>');
        const el = parsed.$('div')[0] as HTMLElement;

        setStyle(el, 'width', '100%');

        assert.equal(el.style.width, '100%');
    });

    it('sets multiple style properties', function () {
        const parsed = parseFragment('<div>Content</div>');
        const el = parsed.$('div')[0] as HTMLElement;

        setStyle(el, 'width', '100%');
        setStyle(el, 'color', 'red');

        assert.equal(el.style.width, '100%');
        assert.equal(el.style.color, 'red');
    });

    it('handles null element gracefully', function () {
        assert.doesNotThrow(() => setStyle(null, 'width', '100%'));
    });

    it('handles element without style property gracefully', function () {
        assert.doesNotThrow(() => setStyle({} as HTMLElement, 'width', '100%'));
    });
});

describe('isComment', function () {
    it('returns true for comment node', function () {
        const parsed = parseFragment('<!--This is a comment-->');
        const commentNode = parsed.body.firstChild;

        assert.equal(isComment(commentNode), true);
    });

    it('returns false for element node', function () {
        const parsed = parseFragment('<p>Text</p>');
        const elementNode = parsed.$('p')[0];

        assert.equal(isComment(elementNode), false);
    });

    it('returns false for text node', function () {
        const parsed = parseFragment('Just text');
        const textNode = parsed.body.firstChild;

        assert.equal(isComment(textNode), false);
    });

    it('returns false for null', function () {
        assert.equal(isComment(null), false);
    });

    it('returns false for undefined', function () {
        assert.equal(isComment(undefined), false);
    });
});

describe('getCommentData', function () {
    it('returns comment content', function () {
        const parsed = parseFragment('<!--kg-card-begin: html-->');
        const commentNode = parsed.body.firstChild;

        assert.equal(getCommentData(commentNode), 'kg-card-begin: html');
    });

    it('returns empty string for empty comment', function () {
        const parsed = parseFragment('<!---->');
        const commentNode = parsed.body.firstChild;

        assert.equal(getCommentData(commentNode), '');
    });

    it('returns empty string for non-comment node', function () {
        const parsed = parseFragment('<p>Text</p>');
        const elementNode = parsed.$('p')[0];

        assert.equal(getCommentData(elementNode), '');
    });

    it('returns empty string for null', function () {
        assert.equal(getCommentData(null), '');
    });
});
