import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {URL} from 'node:url';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {processHTML} from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

const dummyPost: mappedDataObject = {
    url: 'https://example.com/test-post',
    data: {
        slug: 'test-post',
        published_at: new Date(),
        updated_at: new Date(),
        created_at: new Date(),
        title: 'Test Post',
        type: 'post',
        html: '',
        status: 'published',
        custom_excerpt: null,
        visibility: 'public',
        tags: []
    }
};

describe('Buttondown Processor', () => {
    it('Handles no HTML', async function () {
        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data}}});

        assert.equal(renderedHtml, '');
    });

    it('Does not return body tags', async function () {
        const sampleString = '<p>Hello world</p>';

        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data, html: sampleString}}});

        assert.equal(renderedHtml, sampleString);
    });

    it('Removes signup from shortcodes HTML', async function () {
        const sampleString = '<p>{{ subscribe_form }}</p><p>Hello world</p>';

        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data, html: sampleString}}});

        assert.equal(renderedHtml, '<p>Hello world</p>');
    });

    it('Removes signup from shortcodes Markdown', async function () {
        const sampleString = 'Hello world\r\r{{ subscribe_form }}';

        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data, html: sampleString}}});

        assert.equal(renderedHtml, '<p>Hello world</p>\n\n');
    });

    it('Processes Markdown', async function () {
        const plainMd = readFileSync(join(fixturesPath, '/emails/plain-post.md'), 'utf8');

        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data, html: plainMd}}});

        assert.ok(!renderedHtml.includes('<!-- buttondown-editor-mode: plaintext -->'));

        assert.ok(renderedHtml.includes('<h2>Lorem ipsum dolor sit amet.</h2>'));
        assert.ok(!renderedHtml.includes('## Lorem ipsum dolor sit amet.'));

        assert.ok(!renderedHtml.includes('```css\n' +
            'p {\n' +
            '    color: #bada55;\n' +
            '}'));
        assert.ok(renderedHtml.includes('<pre><code class="language-css">p {\n' +
            '    color: #bada55;\n' +
            '}\n' +
            '</code></pre>'));

        assert.ok(!renderedHtml.includes('1. Excepteur sint occaecat\n' +
          '2. cupidatat non proident\n' +
          '    3. Sunt in culpa qui officia\n' +
          '4. deserunt mollit anim id est laborum.\n'));
        assert.ok(renderedHtml.includes('<ol>\n' +
            '<li>Excepteur sint occaecat</li>\n' +
            '<li>cupidatat non proident\n' +
            '3. Sunt in culpa qui officia</li>\n' +
            '<li>deserunt mollit anim id est laborum.</li>\n' +
            '</ol>'));
    });

    it('Processes HTML', async function () {
        const fancyMd = readFileSync(join(fixturesPath, '/emails/fancy-post.md'), 'utf8');

        const renderedHtml = processHTML({postData: {...dummyPost, data: {...dummyPost.data, html: fancyMd}}});

        assert.ok(!renderedHtml.includes('<!-- buttondown-editor-mode: fancy -->'));
        assert.ok(renderedHtml.includes('<h2>Lorem ipsum dolor sit amet.</h2>'));
    });
});
