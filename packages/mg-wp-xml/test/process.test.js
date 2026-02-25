import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
import process, {processWPMeta} from '../lib/process.js';

const parserOptions = {
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false
};

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = async (name) => {
    let fixtureFileName = path.join(__dirname, './', 'fixtures', name);
    return fs.readFile(fixtureFileName, {encoding: 'utf8'});
};

describe('Process', function () {
    it('Can get site URL from XML file', async function () {
        let ctx = {
            options: {}
        };
        const input = await readSync('sample.xml');
        await process.all(input, ctx);

        assert.deepEqual(ctx.options.url, 'https://example.com');
    });

    it('Can convert a single published post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        assert.ok(typeof post === 'object' && post !== null);
        assert.deepEqual(post.url, 'https://example.com/blog/basic-post.html');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.deepEqual(data.slug, 'basic-post');
        assert.deepEqual(data.title, 'Basic Post');
        assert.deepEqual(data.comment_id, '4');
        assert.deepEqual(data.status, 'published');
        assert.deepEqual(data.published_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.deepEqual(data.created_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.deepEqual(data.updated_at, new Date('2013-06-07T03:00:44.000Z'));
        assert.deepEqual(data.feature_image, 'https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        assert.deepEqual(data.type, 'post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        assert.equal(tags.length, 5);
        assert.deepEqual(tags[0].url, '/tag/company-news');
        assert.deepEqual(tags[0].data.slug, 'company-news');
        assert.deepEqual(tags[0].data.name, 'Company News');
        assert.deepEqual(tags[1].url, '/tag/has-images');
        assert.deepEqual(tags[1].data.slug, 'has-images');
        assert.deepEqual(tags[1].data.name, 'Has Images');
        assert.deepEqual(tags[2].url, '/tag/programming');
        assert.deepEqual(tags[2].data.slug, 'programming');
        assert.deepEqual(tags[2].data.name, 'Programming');
        assert.deepEqual(tags[3].url, 'migrator-added-tag');
        assert.deepEqual(tags[3].data.slug, 'hash-wp');
        assert.deepEqual(tags[3].data.name, '#wp');
        assert.deepEqual(tags[4].url, 'migrator-added-tag-post');
        assert.deepEqual(tags[4].data.slug, 'hash-wp-post');
        assert.deepEqual(tags[4].data.name, '#wp-post');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.deepEqual(author.url, 'hermione-example-com');
        assert.deepEqual(author.data.slug, 'hermione-example-com');
        assert.deepEqual(author.data.name, 'Hermione Granger');
        assert.deepEqual(author.data.email, 'hermione@example.com');
    });

    it('Can convert a single draft post', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];

        assert.ok(typeof post === 'object' && post !== null);
        assert.deepEqual(post.url, 'https://example.com/draft-post');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.deepEqual(data.slug, 'draft-post');
        assert.deepEqual(data.title, 'Draft Post');
        assert.deepEqual(data.status, 'draft');
        assert.deepEqual(data.published_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.deepEqual(data.created_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.deepEqual(data.updated_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.ok(!data.feature_image);
        assert.deepEqual(data.type, 'post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        assert.equal(tags.length, 4);
        assert.deepEqual(tags[0].url, '/tag/company-news');
        assert.deepEqual(tags[0].data.slug, 'company-news');
        assert.deepEqual(tags[0].data.name, 'Company News');
        assert.deepEqual(tags[1].url, '/tag/programming');
        assert.deepEqual(tags[1].data.slug, 'programming');
        assert.deepEqual(tags[1].data.name, 'Programming');
        assert.deepEqual(tags[2].url, 'migrator-added-tag');
        assert.deepEqual(tags[2].data.slug, 'hash-wp');
        assert.deepEqual(tags[2].data.name, '#wp');
        assert.deepEqual(tags[3].url, 'migrator-added-tag-post');
        assert.deepEqual(tags[3].data.slug, 'hash-wp-post');
        assert.deepEqual(tags[3].data.name, '#wp-post');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.deepEqual(author.url, 'harry-example-com');
        assert.deepEqual(author.data.slug, 'harry-example-com');
        assert.deepEqual(author.data.name, 'Harry Potter');
        assert.deepEqual(author.data.email, 'harry@example.com');
    });

    it('Can convert a published page', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const page = processed.posts[3];

        assert.ok(typeof page === 'object' && page !== null);
        assert.deepEqual(page.url, 'https://example.com/services');

        const data = page.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.deepEqual(data.slug, 'services');
        assert.deepEqual(data.title, 'Services');
        assert.deepEqual(data.status, 'published');
        assert.deepEqual(data.published_at, new Date('2017-05-27T11:33:38.000Z'));
        assert.ok(!data.feature_image);
        assert.deepEqual(data.type, 'page');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        assert.equal(tags.length, 2);
        assert.deepEqual(tags[0].url, 'migrator-added-tag');
        assert.deepEqual(tags[0].data.slug, 'hash-wp');
        assert.deepEqual(tags[0].data.name, '#wp');
        assert.deepEqual(tags[1].url, 'migrator-added-tag-page');
        assert.deepEqual(tags[1].data.slug, 'hash-wp-page');
        assert.deepEqual(tags[1].data.name, '#wp-page');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.deepEqual(author.url, 'migrator-added-author');
        assert.deepEqual(author.data.slug, 'migrator-added-author');
    });

    it('Can convert a custom post type', async function () {
        let ctx = {
            options: {
                drafts: false,
                pages: false,
                posts: true,
                cpt: ['customcpt']
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[2];

        assert.ok(typeof post === 'object' && post !== null);
        assert.deepEqual(post.url, 'https://example.com/mycpt/amazing-article');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.deepEqual(data.slug, 'amazing-article');
        assert.deepEqual(data.title, 'My CPT Post');
        assert.deepEqual(data.status, 'published');
        assert.deepEqual(data.published_at, new Date('2012-06-07T03:00:44.000Z'));
        assert.ok(!data.feature_image);
        assert.deepEqual(data.type, 'post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        assert.equal(tags.length, 3);
        assert.deepEqual(tags[0].url, '/tag/has-images');
        assert.deepEqual(tags[0].data.slug, 'has-images');
        assert.deepEqual(tags[0].data.name, 'Has Images');
        assert.deepEqual(tags[1].url, 'migrator-added-tag');
        assert.deepEqual(tags[1].data.slug, 'hash-wp');
        assert.deepEqual(tags[1].data.name, '#wp');
        assert.deepEqual(tags[2].url, 'migrator-added-tag-customcpt');
        assert.deepEqual(tags[2].data.slug, 'hash-wp-customcpt');
        assert.deepEqual(tags[2].data.name, '#wp-customcpt');

        const author = data.author;

        assert.ok(typeof author === 'object' && author !== null);
        assert.deepEqual(author.url, 'hermione-example-com');
        assert.deepEqual(author.data.slug, 'hermione-example-com');
    });

    it('Can extract featured image alt text and caption', async function () {
        let ctx = {
            options: {
                drafts: false,
                pages: false,
                posts: true
            }
        };
        const input = await readSync('sample-with-alt.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[0];

        assert.ok(typeof post === 'object' && post !== null);
        assert.deepEqual(post.url, 'https://example.com/blog/post-with-featured-image-alt.html');

        const data = post.data;

        assert.ok(typeof data === 'object' && data !== null);
        assert.deepEqual(data.slug, 'post-with-featured-image-alt');
        assert.deepEqual(data.title, 'Post with Featured Image Alt Text');
        assert.deepEqual(data.feature_image, 'https://example.com/wp-content/uploads/2013/06/featured-image.jpg');
        assert.deepEqual(data.feature_image_alt, 'Sunset over mountains with orange and pink sky');
        assert.deepEqual(data.feature_image_caption, 'A gorgeous sunset over the mountains with vibrant orange and pink colors.');
    });

    it('Can handle empty post slugs', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true,
                excerpt: false,
                excerptSelector: 'h2'
            }
        };
        const input = await readSync('sample-no-slug.xml');
        const processed = await process.all(input, ctx);

        assert.deepEqual(processed.posts[0].data.slug, 'draft-post');
        assert.deepEqual(processed.posts[1].data.slug, 'basic-post');
        assert.deepEqual(processed.posts[2].data.slug, 'another-post');
        assert.deepEqual(processed.posts[3].data.slug, 'services');
    });

    it('Can use excerpt selector and remove from content', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true,
                excerpt: false,
                excerptSelector: 'h2'
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        assert.ok(typeof post === 'object' && post !== null);

        assert.ok(typeof post.data === 'object' && post.data !== null);
        assert.deepEqual(post.data.custom_excerpt, 'My excerpt in content');
        assert.ok(!post.data.html.includes('<h2>My excerpt in content</h2>'));
    });

    it('Can use excerpt from WordPress XML', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true,
                excerpt: true,
                excerptSelector: false
            }
        };
        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);

        const post = processed.posts[1];

        assert.ok(typeof post === 'object' && post !== null);

        assert.ok(typeof post.data === 'object' && post.data !== null);
        assert.deepEqual(post.data.custom_excerpt, 'We\'re not testing HTML output here. That happens in @tryghost/mg-wp-api');
    });

    it('Does not filter posts by date of options not present', async function () {
        let ctx = {
            options: {
                tags: true,
                addTag: null,
                featureImage: 'featuredmedia',
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: true,
                drafts: true
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 3);
    });

    it('Can filter by postsBefore', async function () {
        let ctx = {
            options: {
                tags: true,
                addTag: null,
                featureImage: 'featuredmedia',
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: true,
                drafts: true,
                postsBefore: 'May 01 2013'
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0].data.published_at, new Date('2012-06-07T03:00:44.000Z'));
    });

    it('Can filter by postsAfter', async function () {
        let ctx = {
            options: {
                tags: true,
                addTag: null,
                featureImage: 'featuredmedia',
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: true,
                drafts: true,
                postsAfter: 'May 01 2013'
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 2);
        assert.deepEqual(posts[0].data.published_at, new Date('2013-11-02T23:02:32.000Z'));
        assert.deepEqual(posts[1].data.published_at, new Date('2013-06-07T03:00:44.000Z'));
    });

    it('Can filter by postsBefore and postsAfter', async function () {
        let ctx = {
            options: {
                tags: true,
                addTag: null,
                featureImage: 'featuredmedia',
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: true,
                drafts: true,
                postsBefore: 'May 01 2013',
                postsAfter: 'May 01 2012'
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 1);
        assert.deepEqual(posts[0].data.published_at, new Date('2012-06-07T03:00:44.000Z'));
    });

    it('Can get posts only', async function () {
        let ctx = {
            options: {
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: true,
                drafts: true
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 3);
    });

    it('Can get pages only', async function () {
        let ctx = {
            options: {
                url: 'https://mysite.com/bloob',
                pages: true,
                posts: false,
                drafts: true
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 1);
    });

    it('Can get CPT only', async function () {
        let ctx = {
            options: {
                url: 'https://mysite.com/bloob',
                pages: false,
                posts: false,
                cpt: ['customcpt'],
                drafts: true
            }
        };

        const input = await readSync('sample.xml');
        const processed = await process.all(input, ctx);
        const posts = processed.posts;

        assert.equal(posts.length, 1);
    });

    it('Can read post_meta', async function () {
        const input = await readSync('has-meta.xml');
        const parser = new XMLParser(parserOptions);
        const xml = parser.parse(input);

        const items = xml?.rss?.channel?.item || [];
        const itemsArray = Array.isArray(items) ? items : [items];

        const post = itemsArray[0];
        const metaValues = await processWPMeta(post);

        assert.deepEqual(metaValues, {
            lorem1234: '433',
            ab_view_count: '394',
            amazonS3_cache: {
                '//example1234com.s3.ca-central-1.amazonaws.com/wp-content/uploads/2019/05/26182814/abcdefg-12345-logo.png': {id: '7050', source_type: 'media-library'},
                '//abcdefg1234.com/wp-content/uploads/2019/05/abcdefg-12345-logo.png': {id: '7050', source_type: 'media-library'}
            },
            _wp_attachment_metadata: {
                width: 3510,
                height: 1974,
                file: '2014/10/IMG_2347.jpg',
                sizes: {
                    large: {
                        file: 'IMG_2347-1024x575.jpg',
                        height: 575,
                        'mime-type': 'image/jpeg',
                        width: 1024
                    },
                    medium: {
                        file: 'IMG_2347-300x168.jpg',
                        height: 168,
                        'mime-type': 'image/jpeg',
                        width: 300
                    },
                    thumbnail: {
                        file: 'IMG_2347-150x150.jpg',
                        height: 150,
                        'mime-type': 'image/jpeg',
                        width: 150
                    }
                },
                image_meta: {
                    aperture: 7.1,
                    credit: '',
                    camera: 'Canon EOS DIGITAL REBEL XSi',
                    caption: '',
                    created_timestamp: 1224982961,
                    copyright: '',
                    focal_length: '135',
                    iso: '200',
                    shutter_speed: '0.005',
                    title: '',
                    orientation: 1
                }
            },
            _et_dynamic_cached_shortcodes: [],
            _et_dynamic_cached_attributes: []
        });
    });

    it('Can extract multiple authors from Co-Authors Plus format', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('co-authors-plus.xml');
        const processed = await process.all(input, ctx);

        // Post with 2 authors
        const multiAuthorPost = processed.posts[0];
        assert.deepEqual(multiAuthorPost.data.title, 'Multi-Author Post');
        assert.equal(multiAuthorPost.data.authors.length, 2);
        assert.equal(multiAuthorPost.data.author, undefined);
        assert.deepEqual(multiAuthorPost.data.authors[0].data.slug, 'alice-smith');
        assert.deepEqual(multiAuthorPost.data.authors[0].data.name, 'Alice Smith');
        assert.deepEqual(multiAuthorPost.data.authors[0].data.email, 'alice@example.com');
        assert.deepEqual(multiAuthorPost.data.authors[1].data.slug, 'bob-jones');
        assert.deepEqual(multiAuthorPost.data.authors[1].data.name, 'Bob Jones');
        assert.deepEqual(multiAuthorPost.data.authors[1].data.email, 'bob@example.com');
    });

    it('Can extract three authors from Co-Authors Plus format', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('co-authors-plus.xml');
        const processed = await process.all(input, ctx);

        // Post with 3 authors
        const threeAuthorPost = processed.posts[1];
        assert.deepEqual(threeAuthorPost.data.title, 'Three Author Post');
        assert.equal(threeAuthorPost.data.authors.length, 3);
        assert.equal(threeAuthorPost.data.author, undefined);
        assert.deepEqual(threeAuthorPost.data.authors[0].data.slug, 'alice-smith');
        assert.deepEqual(threeAuthorPost.data.authors[1].data.slug, 'bob-jones');
        assert.deepEqual(threeAuthorPost.data.authors[2].data.slug, 'carol-white');
    });

    it('Uses single author field for single Co-Authors Plus entry', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('co-authors-plus.xml');
        const processed = await process.all(input, ctx);

        // Post with 1 author via Co-Authors Plus should use author field, not authors array
        const singleCoAuthorPost = processed.posts[2];
        assert.deepEqual(singleCoAuthorPost.data.title, 'Single Co-Author Post');
        assert.equal(singleCoAuthorPost.data.authors, undefined);
        assert.ok(typeof singleCoAuthorPost.data.author === 'object' && singleCoAuthorPost.data.author !== null);
        assert.deepEqual(singleCoAuthorPost.data.author.data.slug, 'bob-jones');
        assert.deepEqual(singleCoAuthorPost.data.author.data.name, 'Bob Jones');
        assert.deepEqual(singleCoAuthorPost.data.author.data.email, 'bob@example.com');
    });

    it('Deduplicates Co-Authors Plus author entries', async function () {
        let ctx = {
            options: {
                drafts: true,
                pages: true,
                posts: true
            }
        };
        const input = await readSync('co-authors-plus.xml');
        const processed = await process.all(input, ctx);

        // Post with duplicate author entries should be deduplicated
        const duplicateAuthorPost = processed.posts[3];
        assert.deepEqual(duplicateAuthorPost.data.title, 'Duplicate Author Entries Post');
        assert.equal(duplicateAuthorPost.data.authors.length, 2);
        assert.equal(duplicateAuthorPost.data.author, undefined);
        assert.deepEqual(duplicateAuthorPost.data.authors[0].data.slug, 'alice-smith');
        assert.deepEqual(duplicateAuthorPost.data.authors[1].data.slug, 'bob-jones');
    });
});

describe('HTML Processing', function () {
    it('Outputs unchanged HTML is `rawHtml` option is set', async function () {
        const html = `<p style="font-weight: 400;">Hello</p><img data-src="https://example.com/image.jpg" />`;

        const processed = await process.processHTMLContent({html, options: {rawHtml: true}});

        assert.deepEqual(processed, '<!--kg-card-begin: html--><p style="font-weight: 400;">Hello</p><img data-src="https://example.com/image.jpg" /><!--kg-card-end: html-->');
    });

    it('Converts YouTube line to embed', async function () {
        const html = `Hello world
https://www.youtube.com/watch?v=ABCD1234xYz
Lorem Ipsum`;

        const processed = await process.preProcessContent({html});

        assert.deepEqual(processed, 'Hello world\n' +
        '<iframe loading="lazy" title width="160" height="9" src="https://www.youtube.com/embed/ABCD1234xYz?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\n' +
        'Lorem Ipsum');
    });

    it('Converts YouTube line with spaces to embed', async function () {
        const html = `Hello world
            https://www.youtube.com/watch?v=ABCD1234xYz
Lorem Ipsum`;

        const processed = await process.preProcessContent({html});

        assert.deepEqual(processed, 'Hello world\n' +
        '<iframe loading="lazy" title width="160" height="9" src="https://www.youtube.com/embed/ABCD1234xYz?feature=oembed" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>\n' +
        'Lorem Ipsum');
    });

    it('Does not convert YouTube line to embed if line has other text', async function () {
        const html = `Hello world
Watch https://www.youtube.com/watch?v=ABCD1234xYz this
Lorem Ipsum`;

        const processed = await process.preProcessContent({html});

        assert.deepEqual(processed, 'Hello world\n' +
        'Watch https://www.youtube.com/watch?v=ABCD1234xYz this\n' +
        'Lorem Ipsum');
    });

    it('Removes first image in post when it matches the featured image', async function () {
        const html = '<p><img src="https://example.com/feature.jpg" /></p><p>Body text.</p>';

        const processed = await process.processHTMLContent({
            html,
            featureImageSrc: 'https://example.com/feature.jpg',
            options: {}
        });
        assert.ok(processed.includes('Body text.'));
        assert.ok(!processed.includes('https://example.com/feature.jpg'));
    });

    it('Removes bare first <img> when it matches the featured image', async function () {
        const html = '<img src="https://example.com/feature.jpg" /><p>Body text.</p>';

        const processed = await process.processHTMLContent({
            html,
            featureImageSrc: 'https://example.com/feature.jpg',
            options: {}
        });
        assert.ok(processed.includes('Body text.'));
        assert.ok(!processed.includes('https://example.com/feature.jpg'));
    });
});
