import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import * as cheerio from 'cheerio';
import processPost from '../lib/process-post.js';
import processContent from '../lib/process-content.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = (name) => {
    let fixtureFileName = join(__dirname, './', 'fixtures', 'export', 'posts', name);
    return readFileSync(fixtureFileName, {encoding: 'utf8'});
};

const assertMediumMetaObject = (value) => {
    assert.equal(typeof value, 'object');
    assert.ok(value !== null);
    assert.ok('url' in value);
    assert.ok('data' in value);
    assert.equal(typeof value.url, 'string');
    assert.match(value.url, /^https:\/\/medium\.com/);
    assert.equal(typeof value.data, 'object');
    assert.ok(value.data !== null);
    assert.ok('slug' in value.data);
};

describe('Process', function () {
    it('Can process a basic medium post', function () {
        const fixture = readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addPlatformTag: true
        }});

        assertMediumMetaObject(post);

        assert.equal(post.url, 'https://medium.com/@JoeBloggs/testpost-efefef12121212');

        assert.equal(post.data.title, 'Basic Post Title');
        assert.equal(post.data.slug, 'testpost');
        assert.equal(post.data.custom_excerpt, 'This is a subtitle of some sort');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.created_at, '2018-08-11T11:23:34.123Z');
        assert.equal(post.data.published_at, '2018-08-11T11:23:34.123Z');
        assert.equal(post.data.updated_at, '2018-08-11T11:23:34.123Z');

        assert.match(post.data.html, /^<section name="007"/);
        assert.match(post.data.html, /<\/section>$/);

        assertMediumMetaObject(post.data.author);

        assert.equal(post.data.author.url, 'https://medium.com/@JoeBloggs');
        assert.equal(post.data.author.data.name, 'Joe Bloggs');
        assert.equal(post.data.author.data.slug, 'joebloggs');
        assert.equal(post.data.author.data.slug, 'joebloggs');
        assert.equal(post.data.author.data.roles[0], 'Contributor');

        assert.equal(post.data.tags.length, 3);

        assertMediumMetaObject(post.data.tags[0]);
        assert.equal(post.data.tags[0].url, 'https://medium.com/tag/things');
        assert.equal(post.data.tags[0].data.name, 'Things');
        assert.equal(post.data.tags[0].data.slug, 'things');
        assertMediumMetaObject(post.data.tags[1]);
        assert.equal(post.data.tags[1].url, 'https://medium.com/tag/stuff');
        assert.equal(post.data.tags[1].data.name, 'Stuff');
        assert.equal(post.data.tags[1].data.slug, 'stuff');
        assert.equal(post.data.tags[2].data.name, '#medium');
    });

    it('Can process a draft medium post', function () {
        const fixture = readSync('draft-post.html');
        const fakeName = 'draft_blog-post-title-ababab121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addPlatformTag: true
        }});

        assertMediumMetaObject(post);

        assert.equal(post.url, 'https://medium.com/p/ababab12121212');

        assert.equal(post.data.title, 'Draft Post Title');
        assert.equal(post.data.slug, 'blog-post-title');
        assert.equal(post.data.custom_excerpt, 'This is a subtitle of some sort');
        assert.equal(post.data.status, 'draft');
        assert.match(post.data.html, /^<section name="007"/);
        assert.match(post.data.html, /<\/section>$/);

        assert.equal(post.data.tags.length, 1);
        assert.equal(post.data.tags[0].data.name, '#medium');

        // Drafts don't have these
        assert.equal(post.data.published_at, undefined);
        assert.equal(post.data.author, undefined);
    });

    it('Can do advanced content processing on medium posts', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addPlatformTag: true
        }});

        assertMediumMetaObject(post);

        const html = post.data.html;
        const firstDivRegex = /^<section name="007" class="section section--body section--first">[^\w<>]+<div class="(.*?)"/;

        // should start with a section followed by a div
        assert.match(html, firstDivRegex);

        // the first div should not be a section divider anymore (what's in the fixture)
        assert.notEqual(html.match(firstDivRegex)[1], 'section-divider');
        // this is what we expect instead
        assert.equal(html.match(firstDivRegex)[1], 'section-content');

        // should not contain a header with the post title
        assert.doesNotMatch(html, /<h3[^>]*>Blog Post Title/);

        // should have feature image with caption & alt text
        assert.equal(post.data.feature_image, 'https://cdn-images-1.medium.com/max/2000/abc123.jpeg');
        assert.equal(post.data.feature_image_alt, 'This is image alt text');
        assert.equal(post.data.feature_image_caption, 'This is an image caption');

        assert.equal(post.data.tags.length, 4);
        assert.equal(post.data.tags[0].data.name, 'Things');
        assert.equal(post.data.tags[1].data.name, 'Stuff');
        assert.equal(post.data.tags[2].data.name, '#medium');
        assert.equal(post.data.tags[3].data.name, '#auto-feature-image');
    });

    it('Can detect comment', function () {
        const fixture = readSync('comment.html');
        const fakeName = '2018-08-11_blog-comment-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addPlatformTag: true
        }});

        assert.equal(post.data.status, 'draft');
        assert.equal(post.data.tags[1].data.name, '#Medium Possible Comment');
    });

    it('Can detect comment 2', function () {
        const fixture = readSync('short-post.html');
        const fakeName = '2018-08-11_blog-short-post-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addPlatformTag: true
        }});

        assert.equal(post.data.status, 'published');
    });

    it('Can not add platform tags', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture});

        assert.equal(post.data.tags.length, 2);
        assert.equal(post.data.tags[0].data.name, 'Things');
        assert.equal(post.data.tags[1].data.name, 'Stuff');
    });

    it('Can add a custom tag at the start', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addTag: 'This is my custom tag',
            addPlatformTag: true
        }});

        assert.equal(post.data.tags.length, 5);
        assert.equal(post.data.tags[0].data.name, 'This is my custom tag');
        assert.equal(post.data.tags[1].data.name, 'Things');
        assert.equal(post.data.tags[2].data.name, 'Stuff');
        assert.equal(post.data.tags[3].data.name, '#medium');
        assert.equal(post.data.tags[4].data.name, '#auto-feature-image');
    });

    it('Can process blockquotes', function () {
        const fixture = readSync('quote-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture});

        assertMediumMetaObject(post);

        const html = post.data.html;

        assert.ok(html.includes('<blockquote><p>“Lorem Ipsum”&nbsp;<a href="https://example/com" rel="noopener" target="_blank">Example</a></p></blockquote>'));
        assert.ok(html.includes('<blockquote><p>Lorem Ipsum</p></blockquote>'));
    });

    it('Can use Medium as canonical link', function () {
        const fixture = readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            mediumAsCanonical: true
        }});

        assert.equal(post.data.canonical_url, 'https://medium.com/@JoeBloggs/testpost-efefef12121212');
    });

    it('does remove the subtitle if used as excerpt', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {
            addTag: 'This is my custom tag',
            addPlatformTag: true
        }});

        // "This is a subtitle of some sort" is already used as excerpt, so don't include it in the content
        assert.ok(!post.data.html.includes('<h4 name="456" id="456" class="graf graf--h4 graf-after--h3 graf--subtitle">This is a subtitle of some sort</h4>'));
    });
});

describe('Process Content', function () {
    it('Can process code blocks', function () {
        const source = `<div class="e-content"><pre name="4a0a" id="4a0a" class="graf graf--pre graf-after--p">
    <code class="markup--code markup--pre-code">
        &lt;div class="image-block"&gt;\n    &lt;a href="https://example.com"&gt;\n        &lt;img src="/images/photo.jpg" alt="My alt text"&gt;\n    &lt;/a&gt;\n&lt;/div&gt;
    </code>
</pre></div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.equal(post.data.html, `<pre><code>&lt;div class="image-block"&gt;\n    &lt;a href="https://example.com"&gt;\n        &lt;img src="/images/photo.jpg" alt="My alt text"&gt;\n    &lt;/a&gt;\n&lt;/div&gt;</code></pre>`);
    });

    it('Can process code blocks wish slashes', function () {
        const source = readSync('code-post.html');

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<pre name="4a0a" id="4a0a" class="graf graf--pre graf-after--p">'));
        assert.ok(post.data.html.includes('<pre><code>sudo apt-get update \n' +
        'sudo apt-get install \\ \n' +
        '    apt-transport-https \\ \n' +
        '    ca-certificates \\ \n' +
        '    curl \\ \n' +
        '    gnupg-agent \\ \n' +
        '    software-properties-common \\ \n' +
        '    example \\ \n' +
        '    python3-example-lorem</code></pre>'));
    });

    it('Can process code blocks', function () {
        const source = readSync('code-post.html');

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<pre name="9a1f" id="9a1f" class="graf graf--pre graf-after--pre">'));
        assert.ok(post.data.html.includes('<pre><code>echo "deb https://sub.example.com/ce/dolor lorem ipsum" |\\  \n' +
        'sudo tee /etc/apt/sources.list.d/example.list \n' +
        'sudo apt-get update \n' +
        'sudo apt-get install example</code></pre>'));
    });

    it('Can process code blocks', function () {
        const source = `<div class="e-content"><p>My content</p>
        <pre data-code-block-mode="2" spellcheck="false" data-code-block-lang="bash" name="2296" id="2296" class="graf graf--pre graf-after--p graf--preV2">
        <span class="pre--content">wget https://example.com/package.zip</span>
        </pre></div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<pre data-code-block-mode="2" spellcheck="false" data-code-block-lang="bash" name="2296" id="2296" class="graf graf--pre graf-after--p graf--preV2">\n' +
            '<span class="pre--content">wget https://example.com/package.zip</span>\n' +
            '</pre>'));
        assert.ok(post.data.html.includes('<pre><code class="language-bash">wget https://example.com/package.zip</code></pre>'));
    });

    it('Can process galleries', function () {
        const source = `<div class="e-content"><div class="section-inner sectionLayout--outsetRow" data-paragraph-count="3">
            <figure name="f106" id="f106" class="graf graf--figure graf--layoutOutsetRow is-partialWidth graf-after--li" style="width: 34.74%;">
                <img class="graf-image" data-image-id="1*1234.jpeg" data-width="768" data-height="933" src="https://cdn-images-1.medium.com/max/600/1*1234.jpeg">
            </figure>
            <figure name="13ec" id="13ec" class="graf graf--figure graf--layoutOutsetRowContinue is-partialWidth graf-after--figure" style="width: 31.659%;">
                <img class="graf-image" data-image-id="1*5678.jpeg" data-width="768" data-height="1024" src="https://cdn-images-1.medium.com/max/400/1*5678.jpeg">
            </figure>
            <figure name="4dc5" id="4dc5" class="graf graf--figure graf--layoutOutsetRowContinue is-partialWidth graf-after--figure" style="width: 33.601%;">
                <img class="graf-image" data-image-id="1*-abcd.jpeg" data-width="768" data-height="965" src="https://cdn-images-1.medium.com/max/600/1*-abcd.jpeg">
                <figcaption class="imageCaption" style="width: 297.61%; left: -197.61%;">Photos by the author</figcaption>
            </figure>
        </div></div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<div class="section-inner sectionLayout--outsetRow" data-paragraph-count="3">'));

        assert.ok(post.data.html.includes('<figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/600/1*1234.jpeg" width="768" height="933" loading="lazy" alt=""></div><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/400/1*5678.jpeg" width="768" height="1024" loading="lazy" alt=""></div><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/600/1*-abcd.jpeg" width="768" height="965" loading="lazy" alt=""></div></div></div><figcaption>Photos by the author</figcaption></figure>'));
    });

    it('Can process embeds with images', function () {
        const source = `<div class="e-content">
         <div name="d38c" id="d38c" class="graf graf--mixtapeEmbed graf-after--p graf--trailing"><a
                     href="https://example.medium.com/list/1234"
                     data-href="https://example.medium.com/list/1234"
                     class="markup--anchor markup--mixtapeEmbed-anchor"
                     title="https://example.medium.com/list/1234"><strong
                       class="markup--strong markup--mixtapeEmbed-strong">My best Articles</strong><br>
                       class="markup--em markup--mixtapeEmbed-em"><em class="markup--em markup--mixtapeEmbed-em">A description</em>example.medium.com</a><a
                     href="https://example.medium.com/list/1234"
                     class="js-mixtapeImage mixtapeImage mixtapeImage--mediumCatalog  u-ignoreBlock"
                     data-media-id="abcd1234"
                     data-thumbnail-img-id="0*5678.jpeg"
                     style="background-image: url(https://cdn-images-1.medium.com/fit/c/304/160/0*5678.jpeg);"></a>
                 </div>
        </div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<div name="d38c" id="d38c" class="graf graf--mixtapeEmbed graf-after--p graf--trailing">'));

        assert.ok(post.data.html.includes('<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.medium.com/list/1234"><div class="kg-bookmark-content"><div class="kg-bookmark-title">My best Articles</div><div class="kg-bookmark-description">A description</div><div class="kg-bookmark-metadata"></div></div><div class="kg-bookmark-thumbnail"><img src="https://cdn-images-1.medium.com/fit/c/304/160/0*5678.jpeg" alt=""></div></a></figure>'));
    });

    it('Can process embeds without images', function () {
        const source = `<div class="e-content">
            <div name="c123" id="c123" class="graf graf--mixtapeEmbed graf-after--p">
                <a href="https://example.com/lorem/ipsum" data-href="https://example.com/lorem/ipsum" class="markup--anchor markup--mixtapeEmbed-anchor" title="https://example.com/lorem/ipsum">
                    <strong class="markup--strong markup--mixtapeEmbed-strong">lorem/ipsum</strong>
                    <br>
                    <em class="markup--em markup--mixtapeEmbed-em">Dolor Simet.</em>
                    example.com
                </a>
                <a href="https://example.com/lorem/ipsum" class="js-mixtapeImage mixtapeImage mixtapeImage--empty u-ignoreBlock" data-media-id="abcd1234"></a>
            </div>
        </div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<div name="c123" id="c123" class="graf graf--mixtapeEmbed graf-after--p">'));

        assert.ok(post.data.html.includes('<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.com/lorem/ipsum"><div class="kg-bookmark-content"><div class="kg-bookmark-title">lorem/ipsum</div><div class="kg-bookmark-description">Dolor Simet.</div><div class="kg-bookmark-metadata"></div></div></a></figure>'));
    });

    it('Can process blockquotes in 2 parts', function () {
        const source = `<div class="e-content">
            <p>Not quote text</p>
            <blockquote name="68bf" id="68bf" class="graf graf--pullquote graf-after--p graf--trailing">Standalone quote</blockquote>
            <p>Also not quote text</p>
            <blockquote name="3755" id="3755" class="graf graf--pullquote graf--startsWithDoubleQuote graf-after--li">"Main quote."</blockquote>
            <blockquote name="8d9f" id="8d9f" class="graf graf--pullquote graf-after--pullquote graf--trailing">— <a href="https://example.com/source" data-href="https://example.com/source" class="markup--anchor markup--pullquote-anchor" rel="noopener" target="_blank">Person Name</a></blockquote>
        </div>`;

        const $post = cheerio.load(source, {
            xml: {
                xmlMode: false,
                decodeEntities: false
            }
        }, false);

        const post = processContent({
            content: $post('.e-content'),
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        });

        assert.ok(!post.data.html.includes('<blockquote name="68bf" id="68bf" class="graf graf--pullquote graf-after--p graf--trailing">Standalone quote</blockquote>'));
        assert.ok(!post.data.html.includes('<blockquote name="3755" id="3755" class="graf graf--pullquote graf--startsWithDoubleQuote graf-after--li">"Main quote."</blockquote>'));
        assert.ok(!post.data.html.includes('<blockquote name="8d9f" id="8d9f" class="graf graf--pullquote graf-after--pullquote graf--trailing">— <a href="https://example.com/source" data-href="https://example.com/source" class="markup--anchor markup--pullquote-anchor" rel="noopener" target="_blank">Person Name</a></blockquote>'));

        assert.ok(post.data.html.includes('<blockquote><p>Standalone quote</p></blockquote>'));
        assert.ok(post.data.html.includes('<blockquote><p>"Main quote."<br><br>— <a href="https://example.com/source" data-href="https://example.com/source" class="markup--anchor markup--pullquote-anchor" rel="noopener" target="_blank">Person Name</a></p></blockquote>'));
    });
});
