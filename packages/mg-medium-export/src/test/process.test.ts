import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {RecordDataError} from '@tryghost/mg-context';
import {domUtils} from '@tryghost/mg-utils';
import {mediumHandle, postUrl, processContent, processPost as convertPost} from '../index.js';
import type {MediumOptions} from '../index.js';

const fixtures = fileURLToPath(new URL('../../src/test/fixtures/export/posts/', import.meta.url));
const DATE = new Date('2024-02-03T04:05:06.000Z');

const readSync = (name: string) => {
    return readFileSync(join(fixtures, name), {encoding: 'utf8'});
};

const processPost = ({name, html, options}: {name: string; html: string; options?: MediumOptions}) =>
    convertPost({name, html, options, date: DATE});

const extractEContent = (html: string) => {
    const parsed = domUtils.parseFragment(html);
    const eContent = parsed.$('.e-content')[0];
    return eContent ? domUtils.serializeChildren(eContent) : '';
};

const assertMediumMetaObject = (value: any) => {
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
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addPlatformTag: true
            }
        });

        assertMediumMetaObject(post);

        assert.equal(post.url, 'https://medium.com/@JoeBloggs/testpost-efefef12121212');

        assert.equal(post.data.title, 'Basic Post Title');
        assert.equal(post.data.slug, 'testpost');
        assert.equal(post.data.custom_excerpt, 'This is a subtitle of some sort');
        assert.equal(post.data.status, 'published');

        assert.equal(post.data.created_at.toISOString(), '2018-08-11T11:23:34.123Z');
        assert.equal(post.data.published_at!.toISOString(), '2018-08-11T11:23:34.123Z');
        assert.equal(post.data.updated_at.toISOString(), '2018-08-11T11:23:34.123Z');
        assert.equal(post.data.comment_id, 'efefef12121212');

        assert.match(post.data.html, /^<section name="007"/);
        assert.match(post.data.html, /<\/section>$/);

        assertMediumMetaObject(post.data.author);

        assert.equal(post.data.author!.url, 'https://medium.com/@JoeBloggs');
        assert.equal(post.data.author!.data.name, 'Joe Bloggs');
        assert.equal(post.data.author!.data.slug, 'joebloggs');
        assert.equal(post.data.author!.data.roles[0], 'Contributor');

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
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addPlatformTag: true
            }
        });

        assertMediumMetaObject(post);

        assert.equal(post.url, 'https://medium.com/p/ababab12121212');

        assert.equal(post.data.title, 'Draft Post Title');
        assert.equal(post.data.slug, 'blog-post-title');
        assert.equal(post.data.custom_excerpt, 'This is a subtitle of some sort');
        assert.equal(post.data.status, 'draft');
        assert.equal(post.data.comment_id, 'ababab121212');
        assert.match(post.data.html, /^<section name="007"/);
        assert.match(post.data.html, /<\/section>$/);

        assert.equal(post.data.tags.length, 1);
        assert.equal(post.data.tags[0].data.name, '#medium');

        // Drafts don't have these, and are dated when the export was read
        assert.equal(post.data.published_at, undefined);
        assert.equal(post.data.author, undefined);
        assert.equal(post.data.created_at, DATE);
        assert.equal(post.data.updated_at, DATE);
    });

    it('Can do advanced content processing on medium posts', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addPlatformTag: true
            }
        });

        assertMediumMetaObject(post);

        const html = post.data.html;
        const firstDivRegex =
            /^<section name="007" class="section section--body section--first">[^\w<>]+<div class="(.*?)"/;

        // should start with a section followed by a div
        assert.match(html, firstDivRegex);

        // the first div should not be a section divider anymore (what's in the fixture)
        assert.notEqual(html.match(firstDivRegex)![1], 'section-divider');
        // this is what we expect instead
        assert.equal(html.match(firstDivRegex)![1], 'section-content');

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
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addPlatformTag: true
            }
        });

        assert.equal(post.data.status, 'draft');
        assert.equal(post.data.tags[1].data.name, '#Medium Possible Comment');
    });

    it('Can detect comment 2', function () {
        const fixture = readSync('short-post.html');
        const fakeName = '2018-08-11_blog-short-post-efefef121212.html';
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addPlatformTag: true
            }
        });

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
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addTag: 'This is my custom tag',
                addPlatformTag: true
            }
        });

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

        assert.ok(
            html.includes(
                '<blockquote><p>“Lorem Ipsum”&nbsp;<a href="https://example/com" rel="noopener" target="_blank">Example</a></p></blockquote>'
            )
        );
        assert.ok(html.includes('<blockquote><p>Lorem Ipsum</p></blockquote>'));
    });

    it('Can use Medium as canonical link', function () {
        const fixture = readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                mediumAsCanonical: true
            }
        });

        assert.equal(post.data.canonical_url, 'https://medium.com/@JoeBloggs/testpost-efefef12121212');
    });

    it('does remove the subtitle if used as excerpt', function () {
        const fixture = readSync('advanced-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';
        const post = processPost({
            name: fakeName,
            html: fixture,
            options: {
                addTag: 'This is my custom tag',
                addPlatformTag: true
            }
        });

        // "This is a subtitle of some sort" is already used as excerpt, so don't include it in the content
        assert.ok(
            !post.data.html.includes(
                '<h4 name="456" id="456" class="graf graf--h4 graf-after--h3 graf--subtitle">This is a subtitle of some sort</h4>'
            )
        );
    });

    it('Can fall back to filename for slug when canonical URL has no slug', function () {
        const fixture = readSync('no-slug-post.html');
        const fakeName = '2018-08-11_my-post-title-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {}});

        assert.equal(post.data.slug, 'my-post-title');
        assert.equal(post.data.status, 'published');
    });

    it('Can handle published post with no datetime', function () {
        const fixture = readSync('no-date-post.html');
        const fakeName = '2018-08-11_no-date-post-efefef121212.html';
        const post = processPost({name: fakeName, html: fixture, options: {}});

        assert.equal(post.data.status, 'published');
        assert.equal(post.data.created_at, DATE);
        assert.equal(post.data.published_at, DATE);
        assert.equal(post.data.updated_at, DATE);
    });

    it('Can handle post with no e-content or title', function () {
        const html = `<!DOCTYPE html><html><body>
            <article class="h-entry">
                <section class="p-summary">Summary</section>
                <footer>
                    <p>By <a href="https://medium.com/@test" class="p-author h-card">Test</a> on <a><time class="dt-published" datetime="2020-01-01T00:00:00.000Z">Jan 1</time></a>.</p>
                    <p><a href="https://medium.com/@test/post-abc123" class="p-canonical">Link</a></p>
                </footer>
            </article>
        </body></html>`;

        const post = processPost({name: '2020-01-01_post-abc123.html', html, options: {}});

        assert.equal(post.data.html, '');
        assert.equal(post.data.title, '');
    });

    it('Can handle feature image not inside a figure', function () {
        const html = `<!DOCTYPE html><html><body>
            <article class="h-entry">
                <header><h1 class="p-name">Test</h1></header>
                <section class="p-summary">Summary</section>
                <section class="e-content">
                    <img data-is-featured src="https://example.com/photo.jpg">
                    <p>Content here.</p>
                </section>
                <footer>
                    <p>By <a href="https://medium.com/@test" class="p-author h-card">Test</a> on <a><time class="dt-published" datetime="2020-01-01T00:00:00.000Z">Jan 1</time></a>.</p>
                    <p><a href="https://medium.com/@test/post-abc123" class="p-canonical">Link</a></p>
                </footer>
            </article>
        </body></html>`;

        const post = processPost({name: '2020-01-01_post-abc123.html', html, options: {}});

        assert.equal(post.data.feature_image, 'https://example.com/photo.jpg');
    });

    it('Can handle feature image with no alt or caption', function () {
        const fixture = readSync('basic-post.html');
        const fakeName = '2018-08-11_blog-post-title-efefef121212.html';

        // Inject a data-is-featured image with no alt and no figcaption
        const modifiedFixture = fixture.replace(
            '<div class="section-content">',
            '<div class="section-content"><figure><img data-is-featured src="https://example.com/photo.jpg"></figure>'
        );

        const post = processPost({name: fakeName, html: modifiedFixture, options: {}});

        assert.equal(post.data.feature_image, 'https://example.com/photo.jpg');
        assert.equal(post.data.feature_image_alt, null);
        assert.equal(post.data.feature_image_caption, null);
    });
});

describe('Process Content', function () {
    it('Can process code blocks', function () {
        const source = `<pre name="4a0a" id="4a0a" class="graf graf--pre graf-after--p">
    <code class="markup--code markup--pre-code">
        &lt;div class="image-block"&gt;\n    &lt;a href="https://example.com"&gt;\n        &lt;img src="/images/photo.jpg" alt="My alt text"&gt;\n    &lt;/a&gt;\n&lt;/div&gt;
    </code>
</pre>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.equal(
            post.data.html,
            `<pre><code>&lt;div class="image-block"&gt;\n    &lt;a href="https://example.com"&gt;\n        &lt;img src="/images/photo.jpg" alt="My alt text"&gt;\n    &lt;/a&gt;\n&lt;/div&gt;</code></pre>`
        );
    });

    it('Can process code blocks with slashes', function () {
        const source = readSync('code-post.html');
        const contentHtml = extractEContent(source);

        const post = processContent({
            html: contentHtml,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(!post.data.html.includes('<pre name="4a0a" id="4a0a" class="graf graf--pre graf-after--p">'));
        assert.ok(
            post.data.html.includes(
                '<pre><code>sudo apt-get update \n' +
                    'sudo apt-get install \\ \n' +
                    '    apt-transport-https \\ \n' +
                    '    ca-certificates \\ \n' +
                    '    curl \\ \n' +
                    '    gnupg-agent \\ \n' +
                    '    software-properties-common \\ \n' +
                    '    example \\ \n' +
                    '    python3-example-lorem</code></pre>'
            )
        );
    });

    it('Can process consecutive code blocks', function () {
        const source = readSync('code-post.html');
        const contentHtml = extractEContent(source);

        const post = processContent({
            html: contentHtml,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(!post.data.html.includes('<pre name="9a1f" id="9a1f" class="graf graf--pre graf-after--pre">'));
        assert.ok(
            post.data.html.includes(
                '<pre><code>echo "deb https://sub.example.com/ce/dolor lorem ipsum" |\\  \n' +
                    'sudo tee /etc/apt/sources.list.d/example.list \n' +
                    'sudo apt-get update \n' +
                    'sudo apt-get install example</code></pre>'
            )
        );
    });

    it('Can process code blocks with language', function () {
        const source = `<p>My content</p>
        <pre data-code-block-mode="2" spellcheck="false" data-code-block-lang="bash" name="2296" id="2296" class="graf graf--pre graf-after--p graf--preV2">
        <span class="pre--content">wget https://example.com/package.zip</span>
        </pre>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(
            !post.data.html.includes(
                '<pre data-code-block-mode="2" spellcheck="false" data-code-block-lang="bash" name="2296" id="2296" class="graf graf--pre graf-after--p graf--preV2">\n' +
                    '<span class="pre--content">wget https://example.com/package.zip</span>\n' +
                    '</pre>'
            )
        );
        assert.ok(
            post.data.html.includes(
                '<pre><code class="language-bash">wget https://example.com/package.zip</code></pre>'
            )
        );
    });

    it('Can process galleries', function () {
        const source = `<div class="section-inner sectionLayout--outsetRow" data-paragraph-count="3">
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
        </div>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(
            !post.data.html.includes('<div class="section-inner sectionLayout--outsetRow" data-paragraph-count="3">')
        );

        assert.ok(
            post.data.html.includes(
                '<figure class="kg-card kg-gallery-card kg-width-wide kg-card-hascaption"><div class="kg-gallery-container"><div class="kg-gallery-row"><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/600/1*1234.jpeg" width="768" height="933" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/400/1*5678.jpeg" width="768" height="1024" loading="lazy" alt></div><div class="kg-gallery-image"><img src="https://cdn-images-1.medium.com/max/600/1*-abcd.jpeg" width="768" height="965" loading="lazy" alt></div></div></div><figcaption>Photos by the author</figcaption></figure>'
            )
        );
    });

    it('Can process embeds with images', function () {
        const source = `<div name="d38c" id="d38c" class="graf graf--mixtapeEmbed graf-after--p graf--trailing"><a
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
                 </div>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(
            !post.data.html.includes(
                '<div name="d38c" id="d38c" class="graf graf--mixtapeEmbed graf-after--p graf--trailing">'
            )
        );

        assert.ok(
            post.data.html.includes(
                '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.medium.com/list/1234"><div class="kg-bookmark-content"><div class="kg-bookmark-title">My best Articles</div><div class="kg-bookmark-description">A description</div><div class="kg-bookmark-metadata"></div></div><div class="kg-bookmark-thumbnail"><img src="https://cdn-images-1.medium.com/fit/c/304/160/0*5678.jpeg" alt></div></a></figure>'
            )
        );
    });

    it('Can process embeds without images', function () {
        const source = `<div name="c123" id="c123" class="graf graf--mixtapeEmbed graf-after--p">
                <a href="https://example.com/lorem/ipsum" data-href="https://example.com/lorem/ipsum" class="markup--anchor markup--mixtapeEmbed-anchor" title="https://example.com/lorem/ipsum">
                    <strong class="markup--strong markup--mixtapeEmbed-strong">lorem/ipsum</strong>
                    <br>
                    <em class="markup--em markup--mixtapeEmbed-em">Dolor Simet.</em>
                    example.com
                </a>
                <a href="https://example.com/lorem/ipsum" class="js-mixtapeImage mixtapeImage mixtapeImage--empty u-ignoreBlock" data-media-id="abcd1234"></a>
            </div>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(
            !post.data.html.includes('<div name="c123" id="c123" class="graf graf--mixtapeEmbed graf-after--p">')
        );

        assert.ok(
            post.data.html.includes(
                '<figure class="kg-card kg-bookmark-card"><a class="kg-bookmark-container" href="https://example.com/lorem/ipsum"><div class="kg-bookmark-content"><div class="kg-bookmark-title">lorem/ipsum</div><div class="kg-bookmark-description">Dolor Simet.</div><div class="kg-bookmark-metadata"></div></div></a></figure>'
            )
        );
    });

    it('Can process embed with minimal markup', function () {
        const source = `<div class="graf graf--mixtapeEmbed">
            <a href="https://example.com" class="markup--anchor">example.com</a>
        </div>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Test'
                }
            }
        }) as any;

        assert.ok(post.data.html.includes('kg-card-begin'));
        assert.ok(!post.data.html.includes('graf--mixtapeEmbed'));
    });

    it('Can process blockquotes in 2 parts', function () {
        const source = `<p>Not quote text</p>
            <blockquote name="68bf" id="68bf" class="graf graf--pullquote graf-after--p graf--trailing">Standalone quote</blockquote>
            <p>Also not quote text</p>
            <blockquote name="3755" id="3755" class="graf graf--pullquote graf--startsWithDoubleQuote graf-after--li">"Main quote."</blockquote>
            <blockquote name="8d9f" id="8d9f" class="graf graf--pullquote graf-after--pullquote graf--trailing">\u2014 <a href="https://example.com/source" data-href="https://example.com/source" class="markup--anchor markup--pullquote-anchor" rel="noopener" target="_blank">Person Name</a></blockquote>`;

        const post = processContent({
            html: source,
            post: {
                data: {
                    title: 'Blog Post Title'
                }
            }
        }) as any;

        assert.ok(
            !post.data.html.includes(
                '<blockquote name="68bf" id="68bf" class="graf graf--pullquote graf-after--p graf--trailing">Standalone quote</blockquote>'
            )
        );
        assert.ok(
            !post.data.html.includes(
                '<blockquote name="3755" id="3755" class="graf graf--pullquote graf--startsWithDoubleQuote graf-after--li">"Main quote."</blockquote>'
            )
        );

        assert.ok(post.data.html.includes('<blockquote><p>Standalone quote</p></blockquote>'));
        assert.ok(
            post.data.html.includes(
                '<blockquote><p>"Main quote."<br><br>\u2014 <a href="https://example.com/source" data-href="https://example.com/source" class="markup--anchor markup--pullquote-anchor" rel="noopener" target="_blank">Person Name</a></p></blockquote>'
            )
        );
    });
});

describe('Post identity, dates and authors', function () {
    const page = (footer: string, header = '<h1 class="p-name">Title</h1>') =>
        `<html><body><article class="h-entry"><header>${header}</header><section class="e-content"><p>One.</p><p>Two.</p></section><footer>${footer}</footer></article></body></html>`;

    it('reads the post ID from the file name when there is no canonical link', function () {
        const post = processPost({
            name: 'posts/2020-01-01_From-The-Name-abc123.html',
            html: page('<p>By someone</p>'),
            options: {mediumAsCanonical: true}
        });

        assert.equal(post.url, undefined);
        assert.equal(post.data.slug, 'from-the-name');
        assert.equal(post.data.comment_id, 'abc123');
        assert.equal(post.data.canonical_url, undefined);
    });

    it('rejects posts without a Medium post ID', function () {
        assert.throws(
            () => processPost({name: 'posts/no-id.html', html: page('<p>By someone</p>')}),
            (error: Error) =>
                error instanceof RecordDataError && /No Medium post ID in the canonical URL/.test(error.message)
        );
        assert.throws(() => processPost({name: 'posts/draft_no-id.html', html: page('')}), RecordDataError);
    });

    it('rejects an invalid publish date', function () {
        const html = page(
            '<time class="dt-published" datetime="not a date">Never</time><a class="p-canonical" href="https://medium.com/@a/post-abc123">Link</a>'
        );

        assert.throws(
            () => processPost({name: 'posts/2020-01-01_post-abc123.html', html}),
            (error: Error) => error instanceof RecordDataError && error.message === 'Invalid Medium publish date'
        );
    });

    it('keeps an author link without a Medium handle unslugged', function () {
        const html = page(
            '<a class="p-author h-card" href="https://example.com/writer"> Jo Writer </a><a class="p-canonical" href="https://medium.com/@a/post-abc123">Link</a>'
        );
        const post = processPost({name: 'posts/2020-01-01_post-abc123.html', html});

        assert.deepEqual(post.data.author, {
            url: 'https://example.com/writer',
            data: {name: 'Jo Writer', slug: undefined, roles: ['Contributor']}
        });
        assert.equal(post.data.title, 'Title');

        const bare = processPost({
            name: 'posts/2020-01-01_post-abc123.html',
            html: page(
                '<p class="p-tags"><a class="p-tag">Untagged</a></p><a class="p-author h-card">Nobody</a><a class="p-canonical" href="https://medium.com/@a/post-abc123">Link</a>'
            )
        });
        assert.deepEqual(bare.data.author, {
            url: undefined,
            data: {name: 'Nobody', slug: undefined, roles: ['Contributor']}
        });
        assert.deepEqual(bare.data.tags, [{url: '', data: {name: 'Untagged', slug: ''}}]);
    });

    it('gives a draft without a footer link no URL', function () {
        const post = processPost({name: 'posts/draft_A-Draft-abc123.html', html: page('<p>Nothing</p>')});

        assert.equal(post.url, undefined);
        assert.equal(post.data.slug, 'a-draft');
    });

    it('finds Medium handles and canonical URLs', function () {
        assert.equal(mediumHandle('https://medium.com/@JoeBloggs'), 'joebloggs');
        assert.equal(mediumHandle('https://medium.com/@Joe.Bloggs/post-abc?source=x'), 'joe.bloggs');
        assert.equal(mediumHandle('https://example.com/writer'), undefined);
        assert.equal(mediumHandle(undefined), undefined);
        assert.equal(postUrl(readSync('basic-post.html')), 'https://medium.com/@JoeBloggs/testpost-efefef12121212');
        assert.equal(postUrl(readSync('draft-post.html')), undefined);
    });
});
