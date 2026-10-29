import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {processContent, getImageDimensions, largeImageUrl} from '../index.js';

describe('Convert HTML from Substack to Ghost-compatible HTML', function () {
    it('Returns post object if no HTML present', async function () {
        const post = {
            data: {}
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(processed.data.html, '');
    });

    it('Can transform paywalls', async function () {
        const post = {
            data: {
                html: `<p>Public text</p><div class="paywall-jump" data-component-name="PaywallToDOM"></div><p>Premium text</p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(processed.data.html, `<p>Public text</p><!--members-only--><p>Premium text</p>`);
    });

    it('Can transform subscribe links with custom defined URL', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p><a href="https://example.com/subscribe">Subscribe</a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            `<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div><p><a href="#/portal/signup">Subscribe</a></p>`
        );
    });

    it('Removes subscribe buttons and links when noSubscribeButtons is true', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p><a href="https://example.com/subscribe">Subscribe</a></p><p>Keep this paragraph.</p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            noSubscribeButtons: true
        };

        const processed = await processContent(post, url, options);

        assert.ok(!processed.data.html!.includes('subscribe'));
        assert.ok(!processed.data.html!.includes('Sign up now'));
        assert.ok(processed.data.html!.includes('Keep this paragraph.'));
    });

    it('Removes subscription widget when noSubscribeButtons is true', async function () {
        const post = {
            data: {
                html: `<p>Before</p><div class="subscription-widget-wrap" data-attrs="{&quot;url&quot;:&quot;https://example.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe&quot;}"><div class="subscription-widget show-subscribe"><form class="subscription-widget-subscribe"><input type="submit" class="button primary" value="Subscribe"></form></div></div><p>After</p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            noSubscribeButtons: true
        };

        const processed = await processContent(post, url, options);

        assert.ok(processed.data.html!.includes('<p>Before</p>'));
        assert.ok(processed.data.html!.includes('<p>After</p>'));
        assert.ok(!processed.data.html!.includes('subscription-widget-wrap'));
    });

    it('Can transform comment buttons with custom defined URL', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/p/my-post/comments&quot;,&quot;text&quot;:&quot;Leave a comment&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/p/my-post/comments"><span>Leave a comment</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            comments: true,
            commentLink: '#post-comments'
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            `<div class="kg-card kg-button-card kg-align-center"><a href="#post-comments" class="kg-btn kg-btn-accent">Leave a comment</a></div>`
        );
    });

    it('Can remove transform comment buttons', async function () {
        const post = {
            data: {
                html: `<p>Hello</p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/p/my-post/comments&quot;,&quot;text&quot;:&quot;Leave a comment&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/p/my-post/comments"><span>Leave a comment</span></a></p><p>World</p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            comments: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(processed.data.html, `<p>Hello</p><p>World</p>`);
    });

    it('Will not change button element hrefs that are not subscribe buttons', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p>Lorem ipsum dolor sit.</p><p class="button-wrapper" data-attrs='{"url":"https://ghost.org","text":"Try Ghost","class":null}'><a class="button primary" href="https://ghost.org"><span>Try Ghost</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            `<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div><p>Lorem ipsum dolor sit.</p><div class="kg-card kg-button-card kg-align-center"><a href="https://ghost.org/" class="kg-btn kg-btn-accent">Try Ghost</a></div>`
        );
    });

    it('Will remove share buttons', async function () {
        const post = {
            data: {
                html: `<p class="button-wrapper" data-attrs='{"url":"https://example.com/subscribe?","text":"Sign up now","class":null}'><a class="button primary" href="https://example.com/subscribe?"><span>Sign up now</span></a></p><p class="button-wrapper" data-attrs="{&quot;url&quot;:&quot;https://example.com/?utm_source=substack&amp;utm_medium=email&amp;utm_content=share&amp;action=share&quot;,&quot;text&quot;:&quot;Share PodSnacks&quot;,&quot;action&quot;:null,&quot;class&quot;:null}"><a class="button primary" href="https://example.com/?utm_source=substack&amp;utm_medium=email&amp;utm_content=share&amp;action=share"><span>Share PodSnacks</span></a></p>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            `<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Sign up now</a></div>`
        );
    });

    it('Can convert signup forms to signup buttons', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p><div class="subscription-widget-wrap" data-attrs="{&quot;url&quot;:&quot;https://example.com/subscribe?&quot;,&quot;text&quot;:&quot;Subscribe&quot;}"><div class="subscription-widget show-subscribe"><div class="preamble"><p class="cta-caption">You should sign up!</p></div><form class="subscription-widget-subscribe"><input type="email" class="email-input" name="email" placeholder="Type your email…" tabindex="-1"><input type="submit" class="button primary" value="Subscribe"><div class="fake-input-wrapper"><div class="fake-input"></div><div class="fake-button"></div></div></form></div></div>`
            }
        };
        const url = 'https://example.com';
        const options = {
            subscribeLink: '#/portal/signup'
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            `<p>Lorem ipsum</p><div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>`
        );
    });

    it('Removes bold tags from headings', async function () {
        const post = {
            data: {
                html: `<h1><strong>Heading 1</strong></h1>
                <h2>Heading <b>2</b></h2>
                <h3><strong>Heading <em>3</em></strong></h3>
                <h4><b>Heading 4</b></h4>
                <h5><strong>Heading 5</strong></h5>
                <h6><b>Heading 6</b></h6>
                <h2><a href="https://example.com">Linked Heading</a></h2>
                <h3>Plain Heading</h3>
                <h4><a href="https://example.com"><b>Bold Linked Heading</b></a></h4>
                <h5><strong>Linked <a href="https://example.com">Bold</a> Heading</strong></h5>
                <p><strong>Paragraph stays bold</strong></p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<h1>Heading 1</h1>\n' +
                '                <h2>Heading 2</h2>\n' +
                '                <h3>Heading <em>3</em></h3>\n' +
                '                <h4>Heading 4</h4>\n' +
                '                <h5>Heading 5</h5>\n' +
                '                <h6>Heading 6</h6>\n' +
                '                <h2><a href="https://example.com">Linked Heading</a></h2>\n' +
                '                <h3>Plain Heading</h3>\n' +
                '                <h4><a href="https://example.com">Bold Linked Heading</a></h4>\n' +
                '                <h5>Linked <a href="https://example.com">Bold</a> Heading</h5>\n' +
                '                <p><strong>Paragraph stays bold</strong></p>'
        );
    });

    it('Can convert an image wrapped with a link', async function () {
        const post = {
            data: {
                html: `<div class="captioned-image-container">
                    <figure>
                        <a class="image-link image2 image2-800-1200" target="_blank" href="https://example.com">
                            <img src="https://example.com/photo_1200x800.jpeg" data-attrs="{&quot;src&quot;:&quot;https://example.com/photo_1200x800.jpeg&quot;,&quot;height&quot;:800,&quot;width&quot;:1200,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:185654,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/jpeg&quot;,&quot;href&quot;:&quot;https://apple.com&quot;}" alt="A nice photo">
                            <style>
                                a.image2.image-link.image2-800-1200 {
                                    padding-bottom: 66.66666666666666%;
                                    padding-bottom: min(66.66666666666666%, 800px);
                                    width: 100%;
                                    height: 0;
                                }
                                a.image2.image-link.image2-800-1200 img {
                                    max-width: 1200px;
                                    max-height: 800px;
                                }
                            </style>
                        </a>
                        <figcaption class="image-caption">This is a <a href="https://example.com/page">really</a> nice photo</figcaption>
                    </figure>
                </div>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><a href="https://example.com"><img src="https://example.com/photo_1200x800.jpeg" class="kg-image" alt="A nice photo" loading="lazy"></a><figcaption>This is a <a href="https://example.com/page">really</a> nice photo</figcaption></figure>\n' +
                '                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p>'
        );
    });

    it('Can wrap lists with images in HTML comments', async function () {
        const post = {
            data: {
                html: `<ul>
                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>
                    <li><img src="https://example.com/photo.jpg" alt="A nice photo"></li>
                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>
                </ul>
                <ul>
                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>
                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>
                </ul>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<!--kg-card-begin: html--><ul>\n' +
                '                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>\n' +
                '                    <li><img src="https://example.com/photo.jpg" alt="A nice photo"></li>\n' +
                '                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>\n' +
                '                </ul><!--kg-card-end: html-->\n' +
                '                <ul>\n' +
                '                    <li>Proin nunc purus, sollicitudin vitae dui id, condimentum efficitur mauris</li>\n' +
                '                    <li>Vivamus <a href="https://example.com">congue</a> nisl in gravida blandit</li>\n' +
                '                </ul>'
        );
    });

    it('Can process footnotes in text content in old style', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>
                <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a></p>
                <ol>
                    <li>Lorem</li>
                    <li>Phasellus scelerisque metus id elit elementum venenatis.<a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a></li>
                </ol>
                <ul>
                    <li>Ipsum</li>
                    <li>Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a></li>
                </ul>
                <div class="footnote" id="footnote-1">
                    <a href="#footnote-anchor-1" class="footnote-number" contenteditable="false">1</a>
                    <div class="footnote-content">
                        <p>Lorem ipsum</p>
                        <p>Dolor simet</p>
                    </div>
                </div>
                <div class="footnote" id="footnote-2">
                    <a href="#footnote-anchor-2" class="footnote-number" contenteditable="false">2</a>
                    <div class="footnote-content">
                        <p>Consectetur adipiscing</p>
                    </div>
                </div>
                <div class="footnote" id="footnote-3">
                    <a href="#footnote-anchor-3" class="footnote-number" contenteditable="false">3</a>
                    <div class="footnote-content">
                        <p>Elit elementum venenatis</p>
                    </div>
                </div>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Lorem ipsum</p>\n' +
                '                <!--kg-card-begin: html--><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a></p><!--kg-card-end: html-->\n' +
                '                <!--kg-card-begin: html--><ol>\n' +
                '                    <li>Lorem</li>\n' +
                '                    <li>Phasellus scelerisque metus id elit elementum venenatis.<a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a></li>\n' +
                '                </ol><!--kg-card-end: html-->\n' +
                '                <!--kg-card-begin: html--><ul>\n' +
                '                    <li>Ipsum</li>\n' +
                '                    <li>Quisque consectetur laoreet felis, sit amet rutrum mi blandit eu.<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a></li>\n' +
                '                </ul><!--kg-card-end: html-->\n' +
                '                \n' +
                '                \n' +
                '                <!--kg-card-begin: html--><div class="footnotes"><hr><ol><li id="footnote-1">\n' +
                '                        <p>Lorem ipsum</p>\n' +
                '                        <p>Dolor simet <a href="#footnote-anchor-1" title="Jump back to footnote 1 in the text.">↩</a></p>\n' +
                '                    </li><li id="footnote-2">\n' +
                '                        <p>Consectetur adipiscing <a href="#footnote-anchor-2" title="Jump back to footnote 2 in the text.">↩</a></p>\n' +
                '                    </li><li id="footnote-3">\n' +
                '                        <p>Elit elementum venenatis <a href="#footnote-anchor-3" title="Jump back to footnote 3 in the text.">↩</a></p>\n' +
                '                    </li></ol></div><!--kg-card-end: html-->'
        );
    });

    it('Can process footnotes in text content in new style', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>
                <p>Lorem ipsum<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a>.</p>
                    <p>Dolor simet</p>
                    <p>Dolor simet <a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a>.</p>
                    <p>Hello world</p>
                    <p>Hello world. This<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a> is new</p>
            <div class="footnote"><a id="footnote-1" href="#footnote-anchor-1" class="footnote-number" contenteditable="false">2</a>
                <div class="footnote-content">
                    <p>Note content</p>
                    <p>Two lines</p>
                </div>
            </div>
            <div class="footnote"><a id="footnote-2" href="#footnote-anchor-2" class="footnote-number" contenteditable="false">3</a>
                <div class="footnote-content">
                    <p>More notes</p>
                </div>
            </div>
            <div class="footnote"><a id="footnote-3" href="#footnote-anchor-3" class="footnote-number" contenteditable="false">4</a>
                <div class="footnote-content">
                    <p><a href="https://ghost.org">Link</a> in this one</p>
                </div>
            </div>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Lorem ipsum</p>\n' +
                '                <!--kg-card-begin: html--><p>Lorem ipsum<a class="footnote-anchor" id="footnote-anchor-1" href="#footnote-1">1</a>.</p><!--kg-card-end: html-->\n' +
                '                    <p>Dolor simet</p>\n' +
                '                    <!--kg-card-begin: html--><p>Dolor simet <a class="footnote-anchor" id="footnote-anchor-2" href="#footnote-2">2</a>.</p><!--kg-card-end: html-->\n' +
                '                    <p>Hello world</p>\n' +
                '                    <!--kg-card-begin: html--><p>Hello world. This<a class="footnote-anchor" id="footnote-anchor-3" href="#footnote-3">3</a> is new</p><!--kg-card-end: html-->\n' +
                '            \n' +
                '            \n' +
                '            <!--kg-card-begin: html--><div class="footnotes"><hr><ol><li id="footnote-1">\n' +
                '                    <p>Note content</p>\n' +
                '                    <p>Two lines <a href="#footnote-anchor-1" title="Jump back to footnote 1 in the text.">↩</a></p>\n' +
                '                </li><li id="footnote-2">\n' +
                '                    <p>More notes <a href="#footnote-anchor-2" title="Jump back to footnote 2 in the text.">↩</a></p>\n' +
                '                </li><li id="footnote-3">\n' +
                '                    <p><a href="https://ghost.org">Link</a> in this one <a href="#footnote-anchor-3" title="Jump back to footnote 3 in the text.">↩</a></p>\n' +
                '                </li></ol></div><!--kg-card-end: html-->'
        );
    });

    it('Can process embedded posts', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum</p>

                <div class="embedded-post-wrap"
                    data-attrs="{&quot;id&quot;: 123456,&quot;url&quot;: &quot;https://example.substack.com/p/example-post&quot;,&quot;publication_id&quot;: 1234,&quot;publication_name&quot;: &quot;Example Site&quot;,&quot;publication_logo_url&quot;: &quot;https://bucketeer-1234.s3.amazonaws.com/public/images/5678_680x680.png&quot;,&quot;title&quot;: &quot;Lorem ipsum, This is the Title I’m Showing You&quot;,&quot;truncated_body_text&quot;: &quot;Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …&quot;,&quot;date&quot;: &quot;2020-01-24T18:45:11.711Z&quot;,&quot;like_count&quot;: 8,&quot;comment_count&quot;: 3,&quot;utm_campaign&quot;: null}">
                    <a class="embedded-post" native="true"
                        href="https://example.substack.com/p/example-post?utm_source=substack&amp;utm_campaign=post_embed&amp;utm_medium=web">
                        <div class="embedded-post-header">
                            <img class="embedded-post-publication-logo"
                                src="https://bucketeer-1234.s3.amazonaws.com/public/images/5678_680x680.png">
                                    <span class="embedded-post-publication-name">Example Site</span>
                        </div>
                        <div class="embedded-post-title">Lorem ipsum, This is the Title I’m Showing You</div>
                        <div class="embedded-post-body">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …</div><span
                            class="embedded-post-read-more">Read more</span>
                        <div class="embedded-post-meta">2 years ago · 8 likes · 3 comments · Example User</div>
                    </a>
                </div>

                <p>Dolor Simet</p>`
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Lorem ipsum</p>\n' +
                '\n' +
                '                <!--kg-card-begin: html--><figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.substack.com/p/example-post"><div class="kg-bookmark-content"><div class="kg-bookmark-title">Lorem ipsum, This is the Title I’m Showing You</div><div class="kg-bookmark-description">Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad it’s veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat …</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="https://substack-post-media.s3.amazonaws.com/public/images/5678_680x680.png"><span class="kg-bookmark-author">Example Site</span></div></div></a></figure><!--kg-card-end: html-->\n' +
                '\n' +
                '                <p>Dolor Simet</p>'
        );
    });

    it('Can add an audio card for podcast posts', async function () {
        const post = {
            substackPodcastURL: 'https://example.com/files/audio.mp3',
            data: {
                html: `<p>Hello</p>`,
                title: 'My Podcast Episode #1'
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.ok(processed.data.html!.startsWith('<div class="kg-card kg-audio-card">'));
        assert.ok(processed.data.html!.includes('<div class="kg-audio-player-container">'));
        assert.ok(
            processed.data.html!.includes(
                '<audio src="https://example.com/files/audio.mp3" preload="metadata"></audio>'
            )
        );
        assert.ok(processed.data.html!.includes('<div class="kg-audio-title">My Podcast Episode #1</div>'));
        assert.ok(processed.data.html!.includes('<p>Hello</p>'));
    });

    it('Scraped audio`', async function () {
        const post = {
            data: {
                html: `<p>My content</p>`,
                title: 'My Podcast Post',
                podcast_audio_src:
                    'https://api.substack.com/api/v1/audio/upload/1234abcd-1234-abcd-5678-123456abcdef/src'
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.ok(processed.data.html!.startsWith('<div class="kg-card kg-audio-card">'));
        assert.ok(
            processed.data.html!.includes(
                '<audio src="https://api.substack.com/api/v1/audio/upload/1234abcd-1234-abcd-5678-123456abcdef/src"'
            )
        );
        assert.ok(processed.data.html!.includes('<p>My content</p>'));
    });

    it('Can remove the first image if it is the same as `og:image`', async function () {
        const post = {
            data: {
                html: `<p></p><img src="https://example.com/content/file_1200x800.jpg" /><p>My content</p>`,
                title: 'My Image Post',
                og_image: 'https://example.com/content/file_1024x768.jpg'
            }
        };
        const url = 'https://example.com';
        const options = {};

        const processed = await processContent(post, url, options);

        assert.equal(processed.data.html, '<p>My content</p>');
    });

    it('Will take useMetaImage as priority over useFirstImage', async function () {
        const post = {
            data: {
                html: `<p></p><figure><img src="https://example.com/content/first-image.jpg" /><figcaption>My image</figcaption></figure><p>My content</p>`,
                title: 'My Image Post',
                og_image: 'https://example.com/content/file_1024x768.jpg'
            }
        };
        const url = 'https://example.com';
        const options = {
            useMetaImage: true,
            useFirstImage: true
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<figure><img src="https://example.com/content/first-image.jpg"><figcaption>My image</figcaption></figure><p>My content</p>'
        );
        assert.equal(processed.data.feature_image, 'https://example.com/content/file_1024x768.jpg');
    });

    it('Can useFirstImage', async function () {
        const post = {
            data: {
                html: `<p></p><figure><img src="https://example.com/content/first-image.jpg" /><figcaption>My image</figcaption></figure><p>My content</p>`,
                title: 'My Image Post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: true
        };

        const processed = await processContent(post, url, options);

        assert.equal(processed.data.html, '<p>My content</p>');
        assert.equal(processed.data.feature_image, 'https://example.com/content/first-image.jpg');
        assert.equal(processed.data.feature_image_caption, 'My image');
    });

    it('Converts bucketeer image paths', async function () {
        const post = {
            data: {
                html: '<div class="captioned-image-container"><figure><a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" data-component-name="Image2ToDOM"><div class="image2-inset"><picture><source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1456w" sizes="100vw"><img src="https://bucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/efgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" width="1200" height="800.390625" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/efgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg&quot;,&quot;srcNoWatermark&quot;:null,&quot;fullscreen&quot;:false,&quot;imageSize&quot;:&quot;large&quot;,&quot;height&quot;:683,&quot;width&quot;:1024,&quot;resizeWidth&quot;:1200,&quot;bytes&quot;:188889,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/jpeg&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;topImage&quot;:true,&quot;internalRedirect&quot;:null}" class="sizing-large" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2Fefgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg 1456w" sizes="100vw" fetchpriority="high"></picture></div></a><figcaption class="image-caption">My image</figcaption></figure></div><p>Hello</p>',
                title: 'My Image Post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://substack-post-media.s3.amazonaws.com/public/images/efgh5678-fad6-49df-b659-b16976e1ce59_1024x683.jpeg" class="kg-image" alt loading="lazy"><figcaption>My image</figcaption></figure><p>Hello</p>'
        );
    });

    it('Converts galleries', async function () {
        const post = {
            data: {
                html: `<div dir="auto" class="body markup">
                    <p>Hello</p>
                    <figure class="frontend-components-ImageGallery-module__imageGallery--shoTe">
                        <div class="pencraft pc-display-flex pc-flexDirection-column pc-gap-8 pc-reset">
                            <div
                                class="pencraft pc-display-flex pc-gap-8 pc-reset frontend-components-ImageGallery-module__imageRow--RFMqP">
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                            </div>
                            <div
                                class="pencraft pc-display-flex pc-gap-8 pc-reset frontend-components-ImageGallery-module__imageRow--RFMqP">
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                                <picture>
                                    <source type="image/webp"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 474w"
                                        sizes="100vw"><img
                                        src="https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg"
                                        sizes="100vw" alt="My alt text"
                                        srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 424w, https://substackcdn.com/image/fetch/w_474,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg 474w"
                                        width="474"
                                        class="frontend-components-responsive_img-module__img--Pgjj2 frontend-components-ImageGallery-module__image--g2yvp frontend-components-ImageGallery-module__small--Muz63 frontend-components-ImageGallery-module__zoom--eQKQQ pencraft pc-reset">
                                </picture>
                            </div>
                            <figcaption class="frontend-components-ImageGallery-module__imageCaption--JESLj">My caption</figcaption>
                        </div>
                    </figure>
                    <p>World</p>
                </div>`,
                title: 'My gallery post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.ok(
            !processed.data.html!.includes(
                '<figure class="frontend-components-ImageGallery-module__imageGallery--shoTe">'
            )
        );
        assert.ok(
            processed.data.html!.includes(
                '<figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg" width="7008" height="4672" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg" width="4000" height="6000" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg" width="3600" height="2025" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg" width="8048" height="5368" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg" width="4032" height="3024" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg" width="9504" height="6336" loading="lazy" alt></div></div></div><figcaption>My caption</figcaption></figure>'
            )
        );
    });

    it('Converts embeded galleries', async function () {
        const post = {
            data: {
                html: `<p>Before</p><div class="image-gallery-embed" data-attrs="{&quot;gallery&quot;:{&quot;images&quot;:[{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg&quot;},{&quot;type&quot;:&quot;image/jpeg&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg&quot;}],&quot;caption&quot;:&quot;My caption&quot;,&quot;alt&quot;:&quot;My alt text&quot;,&quot;staticGalleryImage&quot;:{&quot;type&quot;:&quot;image/png&quot;,&quot;src&quot;:&quot;https://substack-post-media.s3.amazonaws.com/public/images/abcd1240-6dbe-4463-8494-4171b6c05b3a_1456x964.png&quot;}},&quot;isEditorNode&quot;:true}"></div><p>After</p>`,
                title: 'My gallery embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Before</p><figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-2021-4a0e-b815-90b9ae74d5a0_7008x4672.jpeg" width="7008" height="4672" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abc1235-6563-4aa8-bde7-e5b3ddcd2729_4000x6000.jpeg" width="4000" height="6000" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1236-c233-4e0d-87c0-6a0d128bc07d_3600x2025.jpeg" width="3600" height="2025" loading="lazy" alt></div></div><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1237-2469-4db8-874b-36ad8733bd97_8048x5368.jpeg" width="8048" height="5368" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1238-2236-442c-9d9a-b0387c946a18_4032x3024.jpeg" width="4032" height="3024" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1239-e31d-401c-b94f-ceae393d95f6_9504x6336.jpeg" width="9504" height="6336" loading="lazy" alt></div></div></div><figcaption>My caption</figcaption></figure><p>After</p>'
        );
    });

    it('Includes supplied content in tweet blockquote', async function () {
        const post = {
            data: {
                html: `<p>Hello</p><div class="tweet">
                <a class="tweet-link-top" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-header">
                        <img class="tweet-header-avatar" src="https://example.com/image/twitter_name/w_96/example.jpg" alt="Twitter avatar for @example" loading="lazy">
                        <div class="tweet-header-text">
                            <span class="tweet-author-name">example </span><span class="tweet-author-handle">@example</span>
                        </div>
                    </div>
                    <div class="tweet-text">This is the tweet text</div>
                </a>
                <a class="tweet-link-bottom" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-footer">
                        <span class="tweet-date">1:26 AM ∙ Apr 28, 2022</span>
                        <hr>
                        <div class="tweet-ufi">
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/likes" class="likes">
                                <span class="like-count">50</span>
                                Likes
                            </span>
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/retweets"
                                class="retweets">
                                <span class="rt-count">35</span>
                                Retweets
                            </span>
                        </div>
                    </div>
                </a>
            </div><p>World</p>`,
                title: 'My tweet post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Hello</p><figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><p lang="en" dir="ltr">This is the tweet text</p> — example (@example) <a href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890"> 1:26 AM ∙ Apr 28, 2022 </a><a href="https://twitter.com/example/status/123456"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure><p>World</p>'
        );
    });

    it('Includes supplied content in tweet blockquote derp', async function () {
        const post = {
            data: {
                html: `<p>Hello</p><div class="tweet">
                <a class="tweet-link-top" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-header">
                        <img class="tweet-header-avatar" src="https://example.com/image/twitter_name/w_96/example.jpg" alt="Twitter avatar for @example" loading="lazy">
                        <div class="tweet-header-text">
                            <span class="tweet-author-name">example </span>
                        </div>
                    </div>
                </a>
                <a class="tweet-link-bottom" href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890" target="_blank">
                    <div class="tweet-footer">
                        <span class="tweet-date">1:26 AM ∙ Apr 28, 2022</span>
                        <hr>
                        <div class="tweet-ufi">
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/likes" class="likes">
                                <span class="like-count">50</span>
                                Likes
                            </span>
                            <span href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890/retweets"
                                class="retweets">
                                <span class="rt-count">35</span>
                                Retweets
                            </span>
                        </div>
                    </div>
                </a>
            </div><p>World</p>`,
                title: 'My tweet post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Hello</p><figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet">— example <a href="https://twitter.com/example/status/123456?s=21&amp;t=abcd7890"> 1:26 AM ∙ Apr 28, 2022 </a><a href="https://twitter.com/example/status/123456"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure><p>World</p>'
        );
    });

    it('Handle post embeds', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt.</p>
                <div class="digest-post-embed" data-attrs="{&quot;nodeId&quot;:&quot;1234abcd-99c9-4df9-965a-0dd00e91708a&quot;,&quot;caption&quot;:&quot;The caption&quot;,&quot;size&quot;:&quot;sm&quot;,&quot;isEditorNode&quot;:true,&quot;title&quot;:&quot;The Title&quot;,&quot;publishedBylines&quot;:[{&quot;id&quot;:8097277,&quot;name&quot;:&quot;Author Name&quot;,&quot;bio&quot;:&quot;Author bio&quot;,&quot;photo_url&quot;:&quot;https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcd1234-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F27491f91-70a2-4e95-a648-1fd9d4795106_400x400.jpeg&quot;,&quot;is_guest&quot;:false,&quot;bestseller_tier&quot;:null}],&quot;post_date&quot;:&quot;2024-10-07T01:06:09.384Z&quot;,&quot;cover_image&quot;:&quot;https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-1a48-4dd3-ac53-06900dc9a92d_1200x800.jpeg&quot;,&quot;cover_image_alt&quot;:null,&quot;canonical_url&quot;:&quot;https://www.exampe.com/p/the-link&quot;,&quot;section_name&quot;:null,&quot;id&quot;:149897757,&quot;type&quot;:&quot;newsletter&quot;,&quot;reaction_count&quot;:0,&quot;comment_count&quot;:0,&quot;publication_name&quot;:&quot;Pub Name&quot;,&quot;publication_logo_url&quot;:&quot;https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fabcd1234-9772-40c8-bc77-0ae3e6ec4774_205x205.png&quot;,&quot;belowTheFold&quot;:true}"></div>
                <p>Dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco.</p>
                `,
                title: 'My embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.ok(!processed.data.html!.includes('<div class="digest-post-embed"'));
        assert.ok(
            processed.data.html!.includes(
                '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://www.exampe.com/p/the-link"><div class="kg-bookmark-content"><div class="kg-bookmark-title">The Title</div><div class="kg-bookmark-description">The caption</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-9772-40c8-bc77-0ae3e6ec4774_205x205.png" alt><span class="kg-bookmark-author">Pub Name</span><span class="kg-bookmark-publisher">Author Name</span></div></div><div class="kg-bookmark-thumbnail"><img src="https://substack-post-media.s3.amazonaws.com/public/images/abcd1234-1a48-4dd3-ac53-06900dc9a92d_1200x800.jpeg" alt></div></a></figure>'
            )
        );
    });

    it('Skips post embed if JSON is invalid', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum.</p><div class="digest-post-embed" data-attrs="{&quot;no"></div><p>Dolore magna.</p>`,
                title: 'My embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Lorem ipsum.</p><div class="digest-post-embed" data-attrs="{&quot;no"></div><p>Dolore magna.</p>'
        );
    });

    it('Handle files cards', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum.</p><div class="file-embed-wrapper" data-component-name="FileToDOM">
    <div class="file-embed-container-reader">
        <div class="file-embed-container-top">
            <image class="file-embed-thumbnail-default" src="https://substack.com/img/attachment_icon.svg"></image>
            <div class="file-embed-details">
                <div class="file-embed-details-h1">Information Document</div>
                <div class="file-embed-details-h2">31.6KB ∙ PDF file</div>
            </div><a class="file-embed-button wide" href="https://example.com/api/v1/file/1234-abcd.pdf"><span class="file-embed-button-text">Download</span></a>
        </div><a class="file-embed-button narrow" href="https://example.com/api/v1/file/1234-abcd.pdf"><span class="file-embed-button-text">Download</span></a>
    </div>
</div><p>Dolore magna.</p>`,
                title: 'My embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.ok(
            processed.data.html!.includes(
                '<a class="kg-file-card-container" href="https://example.com/api/v1/file/1234-abcd.pdf" title="Download" download>'
            )
        );
        assert.ok(
            !processed.data.html!.includes(
                '<a class="file-embed-button wide" href="https://example.com/api/v1/file/1234-abcd.pdf"><span class="file-embed-button-text">Download</span></a>'
            )
        );
    });

    it('Handle latex cards', async function () {
        const post = {
            data: {
                html: `<p>Lorem ipsum.</p><div class="latex-rendered" data-attrs="{&quot;persistentExpression&quot;:&quot;ABC_{\\text{Terminal}}ABCTerminal&quot;,&quot;id&quot;:&quot;ACASDWEARE&quot;}" data-component-name="LatexBlockToDOM"></div><p>Dolore magna.</p>`,
                title: 'My embed post'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Lorem ipsum.</p><!--kg-card-begin: html--><div class="latex-rendered" data-attrs="{&quot;persistentExpression&quot;:&quot;ABC_{\\text{Terminal}}ABCTerminal&quot;,&quot;id&quot;:&quot;ACASDWEARE&quot;}" data-component-name="LatexBlockToDOM"></div><!--kg-card-end: html--><p>Dolore magna.</p>'
        );
    });

    it('Escapes mention names', async function () {
        const post = {
            data: {
                html: '<p><span class="mention-wrap" data-attrs="{&quot;name&quot;:&quot;&lt;b&gt;Bold&lt;/b&gt;&quot;,&quot;id&quot;:1}"></span></p>'
            }
        };

        const processed = await processContent(post, 'https://example.com', {useFirstImage: false});

        assert.equal(
            processed.data.html,
            '<p><a href="https://open.substack.com/users/1">&lt;b&gt;Bold&lt;/b&gt;</a></p>'
        );
    });

    it('Can convert mention spans to links', async function () {
        const post = {
            data: {
                html: '<p>Thanks <span class="mention-wrap" data-attrs="{&quot;name&quot;:&quot;Test User&quot;,&quot;id&quot;:12345678,&quot;type&quot;:&quot;user&quot;,&quot;url&quot;:null,&quot;photo_url&quot;:&quot;https://example.com/photo.png&quot;,&quot;uuid&quot;:&quot;00000000-0000-0000-0000-000000000000&quot;}" data-component-name="MentionToDOM"></span> for the tip!</p>'
            }
        };
        const url = 'https://example.com';
        const options = {
            useFirstImage: false
        };

        const processed = await processContent(post, url, options);

        assert.equal(
            processed.data.html,
            '<p>Thanks <a href="https://open.substack.com/users/12345678">Test User</a> for the tip!</p>'
        );
    });
});

describe('Image handling', function () {
    it('Handle images that link to themselves', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        assert.equal(
            processed.data.html,
            '<figure class="kg-card kg-image-card"><img src="https://substack-post-media.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></figure>'
        );
    });

    it('Handle images that link to themselves with no srcset', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        assert.equal(
            processed.data.html,
            '<figure class="kg-card kg-image-card"><img src="https://substack-post-media.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></figure>'
        );
    });

    it('Handle images with external links', async function () {
        let thehtml = `<a class="image-link is-viewable-img image2" target="_blank" href="https://ghost.org"><div class="image2-inset"><picture> <source type="image/webp" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_webp,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"><img src="https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" width="968" height="813" data-attrs="{&quot;src&quot;:&quot;https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png&quot;,&quot;fullscreen&quot;:null,&quot;imageSize&quot;:null,&quot;height&quot;:813,&quot;width&quot;:968,&quot;resizeWidth&quot;:null,&quot;bytes&quot;:null,&quot;alt&quot;:null,&quot;title&quot;:null,&quot;type&quot;:&quot;image/png&quot;,&quot;href&quot;:null,&quot;belowTheFold&quot;:false,&quot;internalRedirect&quot;:null}" class="sizing-normal" alt="" srcset="https://substackcdn.com/image/fetch/w_424,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 424w, https://substackcdn.com/image/fetch/w_848,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 848w, https://substackcdn.com/image/fetch/w_1272,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1272w, https://substackcdn.com/image/fetch/w_1456,c_limit,f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fbucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png 1456w" sizes="100vw"></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        assert.equal(
            processed.data.html,
            '<figure class="kg-card kg-image-card"><a href="https://ghost.org"><img src="https://substack-post-media.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png" class="kg-image" alt loading="lazy"></a></figure>'
        );
    });

    it('Handles images with no src attribute', async function () {
        let thehtml = `<p>Hello</p><a class="image-link is-viewable-img image2" target="_blank" href="https://ghost.org"><div class="image2-inset"><picture> <source type="image/webp"><img class="sizing-normal" alt=""></picture></div></a>`;

        const post = {
            data: {
                html: thehtml,
                title: 'My Image Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        assert.equal(processed.data.html, '<p>Hello</p>');
    });

    it('Can process Instagram embeds', async () => {
        let theHtml = `<div class="instagram" data-attrs="{&quot;instagram_id&quot;:&quot;QWERTYNgZO8&quot;,&quot;title&quot;:&quot;A post shared by Example User (@exampleuser)&quot;,&quot;author_name&quot;:&quot;exampleuser&quot;,&quot;thumbnail_url&quot;:&quot;https://scontent.cdninstagram.com/v/t01.2345-67/e01/p480x480/125269447_123456789439748_5866997504257834626_n.jpg?_nc_ht=scontent.cdninstagram.com&amp;_nc_cat=100&amp;_nc_ohc=ABCDKvvBbVMAX-g_pZ8&amp;tp=1&amp;oh=c4e4faca2360d3c909134133edddccd6&amp;oe=60138323&quot;,&quot;timestamp&quot;:null,&quot;belowTheFold&quot;:false}"><div class="instagram-top-bar"><a class="instagram-author-name" href="https://instagram.com/exampleuser" target="_blank">exampleuser</a></div><a class="instagram-image" href="https://instagram.com/p/QWERTYNgZO8" target="_blank"><img src="https://scontent.cdninstagram.com/v/t01.2345-67/e01/p480x480/125269447_123456789439748_5866997504257834626_n.jpg?_nc_ht=scontent.cdninstagram.com&amp;_nc_cat=100&amp;_nc_ohc=ABCDKvvBbVMAX-g_pZ8&amp;tp=1&amp;oh=c4e4faca2360d3c909134133edddccd6&amp;oe=60138323"></a><div class="instagram-bottom-bar"><div class="instagram-title">A post shared by Example User (<a href="https://instagram.com/exampleuser" target="_blank">@exampleuser</a>)</div></div></div>`;

        const post = {
            data: {
                html: theHtml,
                title: 'My Instagram Post'
            }
        };

        const processed = await processContent(post, 'https://example.com', {});

        assert.equal(
            processed.data.html,
            '<figure class="instagram"><iframe class="instagram-media instagram-media-rendered" id="instagram-embed-0" allowtransparency="true" allowfullscreen="true" frameborder="0" height="968" data-instgrm-payload-id="instagram-media-payload-0" scrolling="no" style="background: white; max-width: 658px; width: calc(100% - 2px); border-radius: 3px; border: 1px solid rgb(219, 219, 219); box-shadow: none; display: block; margin: 0px 0px 12px; min-width: 326px; padding: 0px;" src="https://instagram.com/p/QWERTYNgZO8/embed/captioned/"></iframe><script async src="//www.instagram.com/embed.js"></script></figure>'
        );
    });

    it('Can get dimensions from images', () => {
        const url1 =
            'https://substackcdn.com/image/fetch/f_auto,q_auto:good,fl_progressive:steep/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png';
        const url2 =
            'https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png';
        const url3 =
            'https://bucketeer-abcdabcd-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/12345678-2415-4bdd-8878-bb841f9ca9d4_968x813.png?lorem=ipsum&dolor-simet12345.fake';

        const d1 = getImageDimensions(url1);
        assert.deepEqual(d1, {width: 968, height: 813});
        const d2 = getImageDimensions(url2);
        assert.deepEqual(d2, {width: 968, height: 813});
        const d3 = getImageDimensions(url3);
        assert.deepEqual(d3, {width: 968, height: 813});
    });

    it('Can upscale images and remove crop', async () => {
        let originalSrc =
            'https://substackcdn.com/image/fetch/w_1200,h_600,c_fill,f_jpg,q_auto:good,fl_progressive:steep,g_auto/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2F3c4b3aa9-abcd-efgh-1234-1234567891234_4368x2151.png';

        let larger = largeImageUrl(originalSrc);

        assert.equal(
            larger,
            'https://substack-post-media.s3.amazonaws.com/public/images/3c4b3aa9-abcd-efgh-1234-1234567891234_4368x2151.png'
        );
    });

    it("Skips upscale images and remove crop if image doesn't need it", async () => {
        let originalSrc =
            'https://substack-post-media.s3.amazonaws.com/public/images/db9ef48f-933f-48f0-a6c4-1234567891234_4368x2151.png';

        let larger = largeImageUrl(originalSrc);

        assert.equal(
            larger,
            'https://substack-post-media.s3.amazonaws.com/public/images/db9ef48f-933f-48f0-a6c4-1234567891234_4368x2151.png'
        );
    });
});

describe('Converting less common Substack HTML', function () {
    const convert = (html: string, options = {}) =>
        processContent({data: {html, title: 'T', slug: 's'}}, 'https://example.com', options).data as {
            html: string;
            [key: string]: unknown;
        };

    it('uses an image that is the first element as the feature image', function () {
        assert.deepEqual(convert('<img src="https://example.com/a.jpg"><p>Text</p>', {useFirstImage: true}), {
            html: '<p>Text</p>',
            title: 'T',
            slug: 's',
            feature_image: 'https://example.com/a.jpg'
        });
    });

    it('keeps a first image without a usable source in the content', function () {
        for (const src of ['', 'https://substackcdn.com/image/fetch/']) {
            const data = convert(`<img src="${src}"><p>Text</p>`, {useFirstImage: true});
            assert.equal(data.html, '<img src><p>Text</p>');
            assert.equal(data.feature_image, undefined);
        }
    });

    it('removes video and poll embeds, comments and styles inside links', function () {
        assert.equal(
            convert(
                '<p>A</p><div class="native-video-embed">v</div><div class="poll-embed">p</div><div class="comment">c</div><a href="https://x.com"><style>.a{}</style>Link</a>'
            ).html,
            '<p>A</p><a href="https://x.com">Link</a>'
        );
    });

    it('converts image3 blocks to image cards', function () {
        assert.equal(
            convert(
                `<div class="image3" data-attrs='{"src":"https://substackcdn.com/image/fetch/w_1456/https%3A%2F%2Fsubstack-post-media.s3.amazonaws.com%2Fpublic%2Fimages%2Fa.png","title":"Title"}'></div>`
            ).html,
            '<figure class="kg-card kg-image-card kg-card-hascaption"><img src="https://substack-post-media.s3.amazonaws.com/public/images/a.png" class="kg-image" alt="Title" loading="lazy"><figcaption>Title</figcaption></figure>'
        );
    });

    it('converts a tweet with only its text', function () {
        assert.equal(
            convert(
                '<div class="tweet"><a href="https://twitter.com/x/status/1?s=20"></a><div class="tweet-text">Hello</div></div>'
            ).html,
            '<figure class="kg-card kg-embed-card"><blockquote class="twitter-tweet"><p lang="en" dir="ltr">Hello</p> — <a href="https://twitter.com/x/status/1"></a></blockquote><script async src="https://platform.twitter.com/widgets.js" charset="utf-8"></script></figure>'
        );
    });

    it('sizes gallery images without dimensions in their names as 100×100', function () {
        const gallery = convert(
            `<div class="image-gallery-embed" data-attrs='{"gallery":{"images":[{"src":"https://example.com/a.jpg"},{"src":"https://example.com/b_200x100.jpg"}],"caption":"Cap"}}'></div>`
        ).html;
        assert.ok(gallery.includes('<img src="https://example.com/a.jpg" width="100" height="100"'));
        assert.ok(gallery.includes('<img src="https://example.com/b_200x100.jpg" width="200" height="100"'));
        assert.ok(gallery.includes('<figcaption>Cap</figcaption>'));

        const moduleGallery = convert(
            '<div class="ImageGallery-module__imageGallery"><div class="ImageGallery-module__imageRow"><picture><img src="https://example.com/a.jpg"></picture></div></div>'
        ).html;
        assert.ok(moduleGallery.includes('<img src="https://example.com/a.jpg" width="100" height="100"'));
        assert.ok(!moduleGallery.includes('figcaption'));
    });

    it('converts images without alt text, links or captions', function () {
        const expected =
            '<figure class="kg-card kg-image-card"><img src="https://example.com/a.jpg" class="kg-image" alt loading="lazy"></figure>';
        assert.equal(
            convert('<div class="captioned-image-container"><img src="https://example.com/a.jpg"></div>').html,
            expected
        );
        assert.equal(
            convert('<a class="image-link" href="https://ghost.org"><img src="https://example.com/a.jpg"></a>').html,
            expected
        );
    });

    it('converts a file embed without a title or size', function () {
        const html = convert(
            '<div class="file-embed-wrapper"><a class="file-embed-button" href="https://example.com/f.pdf">Download</a></div>'
        ).html;
        assert.ok(html.includes('href="https://example.com/f.pdf"'));
        assert.ok(html.includes('<div class="kg-file-card-filesize">0 Byte</div>'));
    });

    it('leaves mentions with invalid data and embedded posts without data unchanged', function () {
        const mention = '<p><span class="mention-wrap" data-attrs="not json">@x</span></p>';
        assert.equal(convert(mention).html, mention);
        assert.equal(
            convert('<div class="embedded-post-wrap">x</div>').html,
            '<div class="embedded-post-wrap">x</div>'
        );
    });

    it('converts a digest post embed without bylines', function () {
        assert.equal(
            convert(
                `<div class="digest-post-embed" data-attrs='{"canonical_url":"https://a.com/p/x","title":"T","caption":"C","cover_image":"https://a.com/c.jpg","publication_logo_url":"https://a.com/l.png","publishedBylines":[],"publication_name":"Pub"}'></div>`
            ).html,
            '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://a.com/p/x"><div class="kg-bookmark-content"><div class="kg-bookmark-title">T</div><div class="kg-bookmark-description">C</div><div class="kg-bookmark-metadata"><img class="kg-bookmark-icon" src="https://a.com/l.png" alt><span class="kg-bookmark-author">Pub</span></div></div><div class="kg-bookmark-thumbnail"><img src="https://a.com/c.jpg" alt></div></a></figure>'
        );
    });

    it('points subscribe buttons at Portal by default', function () {
        assert.equal(
            convert(
                '<p class="button-wrapper"><a class="button primary" href="https://example.com/subscribe?"><span>Subscribe</span></a></p>'
            ).html,
            '<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent">Subscribe</a></div>'
        );
    });

    it('wraps nested lists in an HTML card', function () {
        assert.equal(
            convert('<ul><li>One<ul><li>Two</li></ul></li></ul>').html,
            '<!--kg-card-begin: html--><ul><li>One<ul><li>Two</li></ul></li></ul><!--kg-card-end: html-->'
        );
    });

    it('replaces subscribe links and forms, skipping anchors without a link', function () {
        const options = {subscribeLink: '#/portal/signup'};
        assert.equal(
            convert('<p><a name="x">Anchor</a> <a href="/subscribe">Sub</a></p>', options).html,
            '<p><a name="x">Anchor</a> <a href="#/portal/signup">Sub</a></p>'
        );
        assert.equal(
            convert('<div class="subscription-widget-wrap"><form><input type="email"></form></div>', options).html,
            '<div class="kg-card kg-button-card kg-align-center"><a href="#/portal/signup" class="kg-btn kg-btn-accent"></a></div>'
        );
    });

    it('embeds Instagram links without a trailing slash, and leaves embeds without a link', function () {
        assert.ok(
            convert(
                '<div class="instagram"><a class="instagram-image" href="https://instagram.com/p/ABC/?utm=1"></a></div>'
            ).html.includes('src="https://instagram.com/p/ABC/embed/captioned/"')
        );
        assert.equal(convert('<div class="instagram"><p>x</p></div>').html, '<div class="instagram"><p>x</p></div>');
    });

    it('returns no dimensions for an image name without a size', function () {
        assert.equal(getImageDimensions('https://example.com/a.jpg'), false);
    });
});
