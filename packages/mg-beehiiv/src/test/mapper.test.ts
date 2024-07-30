import assert from 'node:assert/strict';
import {join} from 'node:path';
import {parsePostsCSV, mapPost, fullImageURL, createSlug} from '../lib/mapper.js';
import mapper from '../index.js';

const __dirname = new URL('.', import.meta.url).pathname;
const fixturesPath = join(__dirname, '../../src/test/fixtures');

const beehiivCsvObj: beehiivPostDataObject = {
    id: 'abcd1234-1505-4fbf-9576-f3d1bd3034cc',
    web_title: 'Sample Post',
    status: 'confirmed',
    audience: 'free',
    url: 'https://example.beehiiv.com/p/sample-post',
    web_subtitle: 'A website subtitle',
    email_subject_line: 'Sample Post as a subject line',
    email_preview_text: 'Email preview text',
    content_html: '<table><tr id="content-blocks"><p>Sample HTML here</p></tr></table>',
    thumbnail_url: 'uploads/asset/file/12345678/image.png',
    created_at: '2023-01-18 21:25:27'
};

describe('beehiiv Mapper', () => {
    describe('Utils', () => {
        it('Can get the slug from post URL', async () => {
            const slug = createSlug({url: 'https://example.beehiiv.com/p/hello-world'});
            assert.equal(slug, 'hello-world');
        });

        it('Can get the slug from post URL with a custom domain', async () => {
            const slug = createSlug({domain: 'https://example.com/', url: 'https://example.com/p/hello-world'});
            assert.equal(slug, 'hello-world');
        });

        it('Can get the slug from post title when URL is blank', async () => {
            const slug = createSlug({url: '', title: '👋 This! Is a post title.'});
            assert.equal(slug, 'this-is-a-post-title');
        });

        it('Can convert relative image path to absolute', async () => {
            const newPath = fullImageURL('uploads/my-path.jpg');
            assert.equal(newPath, 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/my-path.jpg');

            const slashNewPath = fullImageURL('/uploads/my-path.jpg');
            assert.equal(slashNewPath, 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/my-path.jpg');

            const fullPath = fullImageURL('https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/my-path.jpg');
            assert.equal(fullPath, 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/my-path.jpg');
        });
    });

    it('Reads correct number of posts from CSV', async () => {
        const parsed = await parsePostsCSV({pathToFile: join(fixturesPath, 'posts.csv')});

        assert.equal(parsed.length, 2);
    });

    it('Gets required fields', async () => {
        const parsed = await parsePostsCSV({pathToFile: join(fixturesPath, 'posts.csv')});

        // Check that the fields are correct
        const fields = ['id', 'web_title', 'status', 'audience', 'url', 'web_subtitle', 'email_subject_line', 'email_preview_text', 'content_html', 'thumbnail_url', 'created_at'];
        assert.deepEqual(Object.keys(parsed[0]), fields);
        assert.deepEqual(Object.keys(parsed[1]), fields);
    });

    it('Gets correct values for each field', async () => {
        const parsed = await parsePostsCSV({pathToFile: join(fixturesPath, 'posts.csv')});

        assert.equal(parsed[0].id, 'abcd1234-1505-4fbf-9576-f3d1bd3034cc');
        assert.equal(parsed[0].web_title, 'Sample Post');
        assert.equal(parsed[0].status, 'confirmed');
        assert.equal(parsed[0].audience, 'free');
        assert.equal(parsed[0].url, 'https://example.beehiiv.com/p/sample-post');
        assert.equal(parsed[0].web_subtitle, 'A website subtitle');
        assert.equal(parsed[0].email_subject_line, 'Sample Post as a subject line');
        assert.equal(parsed[0].email_preview_text, 'Email preview text');
        assert.equal(parsed[0].thumbnail_url, 'uploads/asset/file/12345678/image.png');
        assert.equal(parsed[0].created_at, '2023-01-18 21:25:27');
    });

    it('Gets map beehiiv values to Ghost values', async () => {
        const bhObj = {...beehiivCsvObj};

        const mapped = await mapPost({postData: bhObj});

        const fields = ['url', 'data'];
        assert.deepEqual(Object.keys(mapped), fields);

        const dataFields = ['slug', 'published_at', 'updated_at', 'created_at', 'title', 'type', 'html', 'status', 'custom_excerpt', 'visibility', 'tags', 'feature_image'];
        assert.deepEqual(Object.keys(mapped.data), dataFields);

        assert.equal(mapped.url, 'https://example.beehiiv.com/p/sample-post');
        assert.equal(mapped.data.slug, 'sample-post');
        assert.equal(mapped.data.published_at, '2023-01-18 21:25:27');
        assert.equal(mapped.data.updated_at, '2023-01-18 21:25:27');
        assert.equal(mapped.data.created_at, '2023-01-18 21:25:27');
        assert.equal(mapped.data.created_at, '2023-01-18 21:25:27');
        assert.equal(mapped.data.title, 'Sample Post');
        assert.equal(mapped.data.type, 'post');
        assert.equal(mapped.data.status, 'published');
        assert.equal(mapped.data.custom_excerpt, 'A website subtitle');
        assert.equal(mapped.data.visibility, 'public');
    });

    it('Can add featured image', async () => {
        const bhObj = {...beehiivCsvObj};

        const mapped = await mapPost({postData: bhObj});

        assert.equal(mapped.data.feature_image, 'https://media.beehiiv.com/cdn-cgi/image/quality=100/uploads/asset/file/12345678/image.png');
    });

    it('Applies default author to draft posts', async () => {
        const bhObj = {...beehiivCsvObj};
        bhObj.status = 'draft';

        const mapped = await mapPost({postData: bhObj, options: {
            defaultAuthorName: 'Test Author'
        }});

        assert.equal(mapped.data.status, 'draft');

        assert.deepEqual(mapped.data.author, {
            url: 'migrator-added-author-test-author',
            data: {
                slug: 'test-author',
                name: 'Test Author',
                email: 'test-author@example.com'
            }
        });
    });

    it('Can add tags', async () => {
        const bhObj = {...beehiivCsvObj};

        const mapped = await mapPost({postData: bhObj});

        assert.deepEqual(mapped.data.tags, [
            {
                url: 'migrator-added-tag-hash-beehiiv',
                data: {
                    slug: 'hash-beehiiv',
                    name: '#beehiiv'
                }
            },
            {
                url: 'migrator-added-tag-hash-beehiiv-free',
                data: {
                    slug: 'hash-beehiiv-visibility-free',
                    name: '#beehiiv-visibility-free'
                }
            }
        ]);
    });

    it('Sets custom excerpt to null if none supplied', async () => {
        const bhObj = {...beehiivCsvObj};
        delete bhObj.web_subtitle;

        const mapped = await mapPost({postData: bhObj});

        assert.equal(mapped.data.custom_excerpt, null);
    });

    describe('Post status', () => {
        it('Handles a confirmed post status', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.status = 'confirmed';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.status, 'published');
        });

        it('Handles a draft post status', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.status = 'draft';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.status, 'draft');
        });

        it('Handles an archived post status', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.status = 'archived';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.status, 'draft');
        });
    });

    describe('Post visibility', () => {
        it('Handles a both post visibility', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.audience = 'both';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.visibility, 'members');
        });

        it('Handles a free post visibility', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.audience = 'free';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.visibility, 'public');
        });

        it('Handles an premium post visibility', async () => {
            const bhObj = {...beehiivCsvObj};
            bhObj.audience = 'premium';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.visibility, 'paid');
        });

        it('Handles an \'All premium subscribers\' post visibility', async () => {
            const bhObj = {...beehiivCsvObj};
            delete bhObj.audience;
            bhObj.web_audiences = 'All premium subscribers';

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.visibility, 'paid');
        });

        it('Handles an no post visibility being set', async () => {
            const bhObj = {...beehiivCsvObj};
            delete bhObj.audience;

            const mapped = await mapPost({postData: bhObj});

            assert.equal(mapped.data.visibility, 'public');
        });
    });

    it('Map return array of posts', async () => {
        const mapped = await mapper({options: {
            posts: join(fixturesPath, 'posts.csv')
        }});

        assert.equal(mapped.posts.length, 2);

        const fields = ['url', 'data'];
        assert.deepEqual(Object.keys(mapped.posts[0]), fields);
    });
});
