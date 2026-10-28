import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {processContent, processPost} from '../lib/processor.js';
import {apiPost, fixture} from './helpers.js';

const options = {
    url: 'https://example.com',
    subscribeLink: '#/portal/signup',
    subscribeText: 'Subscribe'
};

describe('Process', function () {
    it('Can convert a single post', function () {
        const data = processPost(fixture()[0], {...options, addPrimaryTag: 'Newsletter'});

        assert.equal(data.slug, 'lorem-ipsum');
        assert.equal(data.title, 'Lorem ipsum');
        assert.equal(data.meta_title, 'Meta title lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(data.meta_description, 'Meta description lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(
            data.html,
            '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Etiam eu risus metus. Etiam aliquet leo eget urna gravida, ac accumsan diam rutrum. Curabitur facilisis, nulla non lacinia dictum, urna sapien tincidunt diam, non elementum ante elit quis justo.</p><ul><li>Praesent vehicula libero nunc, in scelerisque nisl mattis facilisis</li><li>Praesent ornare velit vitae arcu tincidunt vulputate</li><li>Phasellus a nibh a tellus accumsan varius</li></ul><h2>Praesent felis augue, auctor aliquet dui ut</h2><p>Sollicitudin varius est. <a href="https://example.com/p/dolor-simet">Aenean</a> tincidunt eu tellus sit amet hendrerit.</p>'
        );
        assert.equal(data.custom_excerpt, 'Lorem ipsum dolor sit amet consectetur adipiscing elit');
        assert.equal(data.feature_image, 'https://example.com/lorem-ipsum-cover.webp');

        assert.deepEqual(data.tags, [
            {name: 'Newsletter', slug: 'newsletter'},
            {name: 'Lorem', slug: 'lorem'},
            {name: 'Ipsum', slug: 'ipsum'},
            {name: '#letterdrop', slug: 'hash-letterdrop'}
        ]);
        assert.equal(data.author, 'John Smith');
    });

    it('Converts signup iframes to Portal links', function () {
        const data = processPost(fixture()[1], options);

        assert.equal(
            data.html,
            '<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div><div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>'
        );
    });

    it('escapes the subscribe link and text', function () {
        const html = processContent('<iframe name="letterdrop-subscribe-input"></iframe>', {
            ...options,
            subscribeLink: '/join?a=1&b="2"',
            subscribeText: '<b>Join</b>'
        });
        assert.equal(
            html,
            '<div class="kg-card kg-button-card kg-align-center"><a href="/join?a=1&amp;b=&quot;2&quot;" class="kg-btn kg-btn-accent">&lt;b&gt;Join&lt;/b&gt;</a></div>'
        );
    });

    it('returns empty HTML for an empty body', function () {
        assert.equal(processContent('', options), '');
        assert.equal(processContent(null, options), '');
        assert.equal(processContent(undefined, options), '');
    });

    it('removes empty paragraphs and list items', function () {
        assert.equal(
            processContent('<p>One</p><p><br></p><ul><li><br></li><li>Two</li></ul>', options),
            '<p>One</p><ul><li>Two</li></ul>'
        );
    });

    it('rewrites internal /c/ links to /p/ and skips anchors without an href', function () {
        assert.equal(
            processContent(
                '<p><a href="https://example.com/c/one">One</a> <a name="top">Top</a> <a href="https://other.com/c/two">Two</a></p>',
                options
            ),
            '<p><a href="https://example.com/p/one">One</a> <a name="top">Top</a> <a href="https://other.com/c/two">Two</a></p>'
        );
    });

    it('wraps nested lists in a single HTML card', function () {
        assert.equal(
            processContent(
                '<ul><li>One<ul><li>Two<ol><li>Three</li></ol></li></ul></li></ul><ol><li>Flat</li></ol>',
                options
            ),
            '<!--kg-card-begin: html--><ul><li>One<ul><li>Two<ol><li>Three</li></ol></li></ul></li></ul><!--kg-card-end: html--><ol><li>Flat</li></ol>'
        );
    });

    it('turns Quill images into figures without inline styles', function () {
        assert.equal(
            processContent(
                '<div class="quill-upload-image" style="a"><figure style="b"><img src="https://example.com/a.jpg"><figcaption style="c">Caption</figcaption></figure></div><div class="quill-upload-image"><figure><img src="https://example.com/b.jpg"></figure></div><div class="quill-upload-image"><p>No figure</p></div>',
                options
            ),
            '<figure><img src="https://example.com/a.jpg"><figcaption>Caption</figcaption></figure><figure><img src="https://example.com/b.jpg"></figure><div class="quill-upload-image"><p>No figure</p></div>'
        );
    });

    it('turns custom buttons into button cards and removes referral buttons', function () {
        assert.equal(
            processContent(
                '<div class="letterdrop-custom-button"><a href="https://example.com/referrals/123456789012345678901234">Refer</a></div><div class="letterdrop-custom-button"><a href="https://ghost.org">Visit <b>Ghost</b></a></div><div class="letterdrop-custom-button"><span>No link</span></div>',
                options
            ),
            '<div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org" class="kg-btn kg-btn-accent">Visit <b>Ghost</b></a></div><div class="kg-card kg-button-card kg-align-center"><a href class="kg-btn kg-btn-accent"></a></div>'
        );
    });

    it('wraps plain block quotes in a paragraph', function () {
        assert.equal(
            processContent(
                '<blockquote>Quote</blockquote><blockquote class="twitter-tweet">Tweet</blockquote>',
                options
            ),
            '<blockquote><p>Quote</p></blockquote><blockquote class="twitter-tweet">Tweet</blockquote>'
        );
    });

    it('points plans, subscribe and promo links to the subscribe link', function () {
        assert.equal(
            processContent(
                '<p><a href="https://www.example.com/plans">Plans</a><a href="https://example.com/subscribe?x">Sub</a><a href="http://example.com/promo/1">Promo</a><a href="https://example.com/about">About</a></p>',
                {...options, url: 'https://www.example.com'}
            ),
            '<p><a href="#/portal/signup">Plans</a><a href="#/portal/signup">Sub</a><a href="#/portal/signup">Promo</a><a href="https://example.com/about">About</a></p>'
        );
    });

    it('keeps text that contains empty attribute syntax', function () {
        assert.equal(processContent('<p><code>class=""</code></p>', options), '<p><code>class=""</code></p>');
    });

    it('takes the slug from the URL, then the title', function () {
        assert.equal(processPost(apiPost('1', {slug: ''}), options).slug, 'post-1');
        assert.equal(
            processPost(apiPost('1', {slug: null, url: 'https://example.com/p/caf%C3%A9'}), options).slug,
            'cafe'
        );
        assert.equal(
            processPost(apiPost('1', {slug: ' ', url: 'https://example.com/p/bad%zz'}), options).slug,
            'bad-zz'
        );
        assert.equal(
            processPost(apiPost('1', {slug: '', url: 'not a url', title: 'My Title'}), options).slug,
            'my-title'
        );
        assert.equal(processPost(apiPost('1', {slug: '', url: null, title: null}), options).slug, '');
        assert.equal(processPost(apiPost('1', {title: null}), options).title, '');
    });

    it('drops blank optional fields and authors', function () {
        const data = processPost(
            apiPost('1', {subtitle: ' ', metaTitle: null, metaDescription: '', coverImage: '', author: {name: '  '}}),
            options
        );
        assert.equal(data.custom_excerpt, null);
        assert.equal(data.meta_title, null);
        assert.equal(data.meta_description, null);
        assert.equal(data.feature_image, null);
        assert.equal(data.author, null);
        assert.equal(processPost(apiPost('1', {author: null}), options).author, null);
        assert.equal(processPost(apiPost('1', {author: {name: ' Jane '}}), options).author, 'Jane');
    });

    it('builds one tag per slug, with internal tags last', function () {
        const data = processPost(
            apiPost('1', {tags: ['#Featured', 'News', ' news ', '', 7, 'C++', '???', '#', '#letterdrop']}),
            {...options, addPrimaryTag: ' Newsletter '}
        );
        assert.deepEqual(data.tags, [
            {name: 'Newsletter', slug: 'newsletter'},
            {name: 'News', slug: 'news'},
            {name: 'C++', slug: 'c'},
            {name: '???', slug: 'tag'},
            {name: '#Featured', slug: 'hash-featured'},
            {name: '#', slug: 'hash-tag'},
            {name: '#letterdrop', slug: 'hash-letterdrop'}
        ]);
        assert.deepEqual(processPost(apiPost('1', {tags: null}), {...options, addPrimaryTag: ' '}).tags, [
            {name: '#letterdrop', slug: 'hash-letterdrop'}
        ]);
    });
});
