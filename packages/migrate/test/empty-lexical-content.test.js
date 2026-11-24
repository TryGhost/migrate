import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {processHTML, processWebHTML, removeDuplicateFeatureImage} from '@tryghost/mg-beehiiv';
import {htmlToLexical} from '@tryghost/mg-html-lexical';
import {processPost} from '@tryghost/mg-medium-export';
import {processContent} from '@tryghost/mg-substack';

const audienceBlock =
    '<div class="dynamic-content-block" data-dynamic-content="true" data-attrs="{&quot;audiences&quot;:[],&quot;displayName&quot;:&quot;Audience-specific content block&quot;,&quot;subscriberTagIds&quot;:null}" data-dynamic-audiences=""><div class="dynamic-content-match" data-dynamic-content-match="true"><p></p></div></div><p></p>';
const email = body => processHTML({html: `<table><tr id="content-blocks"><td>${body}</td></tr></table>`});
const web = body => processWebHTML({html: `<div id="content-blocks">${body}</div>`});
const substack = html => processContent({data: {html}}, 'https://example.substack.com', {}).data.html;
const medium = body =>
    processPost({
        name: 'draft_Test-abcdef.html',
        html: `<section class="e-content">${body}</section>`,
        date: new Date('2024-01-01')
    });

function assertEmptyParagraph(html) {
    const {children} = htmlToLexical(html).root;
    assert.equal(children.length, 1);
    assert.equal(children[0].type, 'paragraph');
    assert.deepEqual(children[0].children, []);
}

describe('empty content on Ghost import', () => {
    for (const [source, process] of [
        ['Substack', substack],
        ['beehiiv CSV', email],
        ['beehiiv API', web]
    ]) {
        it(`imports an empty audience block from ${source} as one empty paragraph`, () => {
            assertEmptyParagraph(process(audienceBlock));
        });
    }

    it('adds the paragraph after removing a duplicate beehiiv feature image', () => {
        const featureSrc = 'https://example.com/cover.jpg';
        const html = web(`<div><img src="${featureSrc}"></div><span></span>`);
        assert.deepEqual(
            htmlToLexical(html).root.children.map(node => node.type),
            ['image']
        );
        assertEmptyParagraph(removeDuplicateFeatureImage({html, featureSrc}));
    });

    it('adds the paragraph after extracting a Medium feature image', () => {
        const src = 'https://example.com/cover.jpg';
        const {data} = medium(`<section><figure><img data-is-featured src="${src}"></figure></section>`);
        assert.equal(data.feature_image, src);
        assertEmptyParagraph(data.html);
    });

    it('preserves existing empty paragraphs in Medium content', () => {
        const {children} = htmlToLexical(medium(audienceBlock).data.html).root;
        assert.deepEqual(
            children.map(node => node.type),
            ['paragraph', 'paragraph']
        );
    });

    it('keeps a standalone Substack or beehiiv paywall as the only node', () => {
        const bodies = [substack('<div class="paywall-jump"></div>'), web('<div id="subscriber-break"></div>')];
        for (const html of bodies) {
            assert.deepEqual(
                htmlToLexical(html).root.children.map(node => node.type),
                ['paywall']
            );
        }
    });
});
