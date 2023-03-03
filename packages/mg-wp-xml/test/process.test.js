import {jest} from '@jest/globals';
import path from 'node:path';
import {promises as fs} from 'node:fs';
import process from '../lib/process.js';

const __dirname = new URL('.', import.meta.url).pathname;

const readSync = async (name) => {
    let fixtureFileName = path.join(__dirname, './', 'fixtures', name);
    return fs.readFile(fixtureFileName, {encoding: 'utf8'});
};

describe('Process', function () {
    beforeEach(function () {
        process.processHTMLContent = jest.fn(() => {
            return 'Example content';
        });
    });

    test('Can get site URL from XML file', async function () {
        let ctx = {
            options: {}
        };
        const input = await readSync('sample.xml');
        await process.all(input, ctx);

        expect(ctx.options.url).toEqual('https://example.com');
    });

    test('Can convert a single published post', async function () {
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

        expect(post).toBeObject();
        expect(post.url).toEqual('https://example.com/blog/basic-post.html');

        const data = post.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('basic-post');
        expect(data.title).toEqual('Basic Post');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.created_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.updated_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
        expect(data.feature_image).toEqual('https://images.unsplash.com/photo-1601276861758-2d9c5ca69a17?ixlib=rb-1.2.1&ixid=eyJhcHBfaWQiOjEyMDd9&auto=format&fit=crop&w=1268&q=80');
        expect(data.type).toEqual('post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(5);
        expect(tags[0].url).toEqual('/tag/company-news');
        expect(tags[0].data.slug).toEqual('company-news');
        expect(tags[0].data.name).toEqual('Company News');
        expect(tags[1].url).toEqual('/tag/has-images');
        expect(tags[1].data.slug).toEqual('has-images');
        expect(tags[1].data.name).toEqual('Has Images');
        expect(tags[2].url).toEqual('/tag/programming');
        expect(tags[2].data.slug).toEqual('programming');
        expect(tags[2].data.name).toEqual('Programming');
        expect(tags[3].url).toEqual('migrator-added-tag');
        expect(tags[3].data.slug).toEqual('hash-wp');
        expect(tags[3].data.name).toEqual('#wp');
        expect(tags[4].url).toEqual('migrator-added-tag-post');
        expect(tags[4].data.slug).toEqual('hash-wp-post');
        expect(tags[4].data.name).toEqual('#wp-post');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('hermione-example-com');
        expect(author.data.slug).toEqual('hermione-example-com');
        expect(author.data.name).toEqual('Hermione Granger');
        expect(author.data.email).toEqual('hermione@example.com');
    });

    test('Can convert a single draft post', async function () {
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

        expect(post).toBeObject();
        expect(post.url).toEqual('https://example.com/draft-post');

        const data = post.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('draft-post');
        expect(data.title).toEqual('Draft Post');
        expect(data.status).toEqual('draft');
        expect(data.published_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.created_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.updated_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(data.feature_image).toBeFalsy();
        expect(data.type).toEqual('post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(4);
        expect(tags[0].url).toEqual('/tag/company-news');
        expect(tags[0].data.slug).toEqual('company-news');
        expect(tags[0].data.name).toEqual('Company News');
        expect(tags[1].url).toEqual('/tag/programming');
        expect(tags[1].data.slug).toEqual('programming');
        expect(tags[1].data.name).toEqual('Programming');
        expect(tags[2].url).toEqual('migrator-added-tag');
        expect(tags[2].data.slug).toEqual('hash-wp');
        expect(tags[2].data.name).toEqual('#wp');
        expect(tags[3].url).toEqual('migrator-added-tag-post');
        expect(tags[3].data.slug).toEqual('hash-wp-post');
        expect(tags[3].data.name).toEqual('#wp-post');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('harry-example-com');
        expect(author.data.slug).toEqual('harry-example-com');
        expect(author.data.name).toEqual('Harry Potter');
        expect(author.data.email).toEqual('harry@example.com');
    });

    test('Can convert a published page', async function () {
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

        expect(page).toBeObject();
        expect(page.url).toEqual('https://example.com/services');

        const data = page.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('services');
        expect(data.title).toEqual('Services');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual(new Date('2017-05-27T11:33:38.000Z'));
        expect(data.feature_image).toBeFalsy();
        expect(data.type).toEqual('page');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(2);
        expect(tags[0].url).toEqual('migrator-added-tag');
        expect(tags[0].data.slug).toEqual('hash-wp');
        expect(tags[0].data.name).toEqual('#wp');
        expect(tags[1].url).toEqual('migrator-added-tag-page');
        expect(tags[1].data.slug).toEqual('hash-wp-page');
        expect(tags[1].data.name).toEqual('#wp-page');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('migrator-added-author');
        expect(author.data.slug).toEqual('migrator-added-author');
    });

    test('Can convert a custom post type', async function () {
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

        expect(post).toBeObject();
        expect(post.url).toEqual('https://example.com/mycpt/amazing-article');

        const data = post.data;

        expect(data).toBeObject();
        expect(data.slug).toEqual('amazing-article');
        expect(data.title).toEqual('My CPT Post');
        expect(data.status).toEqual('published');
        expect(data.published_at).toEqual(new Date('2012-06-07T03:00:44.000Z'));
        expect(data.feature_image).toBeFalsy();
        expect(data.type).toEqual('post');
        // We're not testing `data.html` output here. That happens in @tryghost/mg-wp-api

        const tags = data.tags;

        expect(tags).toBeArrayOfSize(3);
        expect(tags[0].url).toEqual('/tag/has-images');
        expect(tags[0].data.slug).toEqual('has-images');
        expect(tags[0].data.name).toEqual('Has Images');
        expect(tags[1].url).toEqual('migrator-added-tag');
        expect(tags[1].data.slug).toEqual('hash-wp');
        expect(tags[1].data.name).toEqual('#wp');
        expect(tags[2].url).toEqual('migrator-added-tag-customcpt');
        expect(tags[2].data.slug).toEqual('hash-wp-customcpt');
        expect(tags[2].data.name).toEqual('#wp-customcpt');

        const author = data.author;

        expect(author).toBeObject();
        expect(author.url).toEqual('hermione-example-com');
        expect(author.data.slug).toEqual('hermione-example-com');
    });

    test('Can use excerpt selector and remove from content', async function () {
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

        expect(post).toBeObject();

        expect(post.data).toBeObject();
        expect(post.data.custom_excerpt).toEqual('My excerpt in content');
        expect(post.data.html).not.toContain('<h2>My excerpt in content</h2>');
    });

    test('Can use excerpt from WordPress XML', async function () {
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

        expect(post).toBeObject();

        expect(post.data).toBeObject();
        expect(post.data.custom_excerpt).toEqual('We\'re not testing HTML output here. That happens in @tryghost/mg-wp-api');
    });

    test('Does not filter posts by date of options not present', async function () {
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

        expect(posts).toBeArrayOfSize(3);
    });

    test('Can filter by postsBefore', async function () {
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

        expect(posts).toBeArrayOfSize(1);
        expect(posts[0].data.published_at).toEqual(new Date('2012-06-07T03:00:44.000Z'));
    });

    test('Can filter by postsAfter', async function () {
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

        expect(posts).toBeArrayOfSize(2);
        expect(posts[0].data.published_at).toEqual(new Date('2013-11-02T23:02:32.000Z'));
        expect(posts[1].data.published_at).toEqual(new Date('2013-06-07T03:00:44.000Z'));
    });

    test('Can filter by postsBefore and postsAfter', async function () {
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

        expect(posts).toBeArrayOfSize(1);
        expect(posts[0].data.published_at).toEqual(new Date('2012-06-07T03:00:44.000Z'));
    });

    test('Can get posts only', async function () {
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

        expect(posts).toBeArrayOfSize(3);
    });

    test('Can get pages only', async function () {
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

        expect(posts).toBeArrayOfSize(1);
    });

    test('Can get CPT only', async function () {
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

        expect(posts).toBeArrayOfSize(1);
    });
});
